/**
 * Ingest agent - fetches market + wallet data.
 *
 * Discovery is DexScreener-first, market data is DexPaprika-first, and wallet
 * snapshots are derived from RPC. Moralis is not part of the default path.
 */
import type { MarketSnapshot } from "../core/contracts/market.js";
import type { WalletSnapshot } from "../core/contracts/wallet.js";
import type { Clock } from "../core/clock.js";
import { sha256 } from "../core/determinism/hash.js";
import type { DiscoveryProvider, MarketDataProvider } from "../config/config-schema.js";
import type { DexScreenerClient } from "../adapters/dexscreener/client.js";
import type { DexPaprikaClient } from "../adapters/dexpaprika/client.js";
import type { DexPaprikaPoolItem, DexPaprikaTokenResponse } from "../adapters/dexpaprika/types.js";
import type { RpcClient } from "../adapters/rpc-verify/client.js";
import {
  mapTokenPairsToCandidatePairSearchResult,
  selectCanonicalPairCandidate,
} from "../adapters/dexscreener/mapper.js";
import {
  mapPoolToMarketSnapshot,
  mapPoolToPoolMarketSnapshot,
  mapPoolOhlcvToSeries,
  mapPoolTransactionsToTape,
  mapTokenToTokenMarketSnapshot,
} from "../adapters/dexpaprika/mapper.js";

const DEFAULT_TOKEN_QUERY = "So11111111111111111111111111111111111111112";
const PRIMARY_DISCOVERY_PROVIDER: DiscoveryProvider = "dexscreener";
const PRIMARY_MARKET_PROVIDER: MarketDataProvider = "dexpaprika";
const BASE58_SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface IngestAgentConfig {
  discovery: DexScreenerClient;
  marketData: DexPaprikaClient;
  rpcClient: Pick<RpcClient, "getBalance">;
  walletAddress: string;
  defaultTokenId?: string;
  discoveryProvider?: DiscoveryProvider;
  marketDataProvider?: MarketDataProvider;
  requiredOhlcvTimeframe?: string;
  requireRecentActivity?: boolean;
  clock?: Clock;
}

export async function createIngestHandler(
  config: IngestAgentConfig
): Promise<() => Promise<{ market: MarketSnapshot; wallet: WalletSnapshot }>> {
  assertProviderSelection(config.discoveryProvider, config.marketDataProvider);

  return async () => {
    const timestamp = config.clock?.now().toISOString() ?? new Date().toISOString();
    const traceId = `ingest-${timestamp.replace(/[:.]/g, "-")}`;
    const tokenQuery = config.defaultTokenId ?? DEFAULT_TOKEN_QUERY;

    const discoverySearch = await config.discovery.searchWithHash(tokenQuery);
    const discoverySearchResult = mapTokenPairsToCandidatePairSearchResult(
      discoverySearch.raw,
      tokenQuery,
      tokenQuery,
      timestamp,
      discoverySearch.rawPayloadHash
    );
    const discoveryCandidate = selectBestPairCandidate(discoverySearchResult.candidates);
    if (!discoveryCandidate) {
      throw new Error("TOKEN_CANNOT_BE_RESOLVED_CANONICALLY: no Solana candidate pair resolved from discovery");
    }

    const canonicalTokenAddress = resolveCanonicalTokenAddress(tokenQuery, discoveryCandidate.baseTokenAddress);
    const tokenPairs = await config.discovery.getTokenPairsV1WithHash("solana", canonicalTokenAddress);
    const canonicalPairResult = mapTokenPairsToCandidatePairSearchResult(
      tokenPairs.raw,
      canonicalTokenAddress,
      canonicalTokenAddress,
      timestamp,
      tokenPairs.rawPayloadHash
    );
    const canonicalPair = selectCanonicalPairCandidate(canonicalPairResult.candidates, canonicalTokenAddress);
    if (!canonicalPair) {
      throw new Error("TOKEN_CANNOT_BE_RESOLVED_CANONICALLY: no base-token pair resolved for canonical address");
    }
    const canonicalPairResolved = canonicalPair;

    if (canonicalPairResolved.baseTokenAddress !== canonicalTokenAddress) {
      throw new Error("TOKEN_CANONICAL_RESOLUTION_CONFLICT: discovery candidate does not match canonical token address");
    }

    const tokenLatest = await config.marketData.getTokenWithHash(canonicalTokenAddress);
    const tokenRaw = coerceDexPaprikaToken(tokenLatest.raw);
    const tokenSnapshot = mapTokenToTokenMarketSnapshot(
      tokenRaw,
      canonicalTokenAddress,
      timestamp,
      tokenLatest.rawPayloadHash
    );

    const tokenPools = await config.marketData.getTokenPoolsWithHash(canonicalTokenAddress);
    const pools = extractDexPaprikaPools(tokenPools.raw, canonicalTokenAddress);
    const selectedPool = selectCanonicalPool(pools, canonicalPairResolved);
    if (!selectedPool) {
      throw new Error("NO_VALID_POOL_RESOLVED: no DexPaprika pool matched the canonical discovery pair");
    }

    const selectedPoolDetail = await config.marketData.getPoolWithHash(selectedPool.id);
    const liquidityUsd = extractDexPaprikaPoolLiquidity(selectedPoolDetail.raw);
    if (liquidityUsd === undefined) {
      throw new Error("DexPaprika pool liquidity is missing");
    }
    const selectedPoolWithLiquidity = {
      ...selectedPool,
      liquidity_usd: liquidityUsd,
    };

    const poolSnapshot = mapPoolToPoolMarketSnapshot(
      selectedPoolWithLiquidity,
      canonicalTokenAddress,
      timestamp,
      selectedPoolDetail.rawPayloadHash
    );

    if (poolSnapshot.baseTokenAddress !== canonicalTokenAddress) {
      throw new Error("BASE_QUOTE_ORIENTATION_INCONSISTENT: pool base token did not match canonical token");
    }

    if (
      canonicalPairResolved.quoteTokenAddress &&
      poolSnapshot.quoteTokenAddress &&
      canonicalPairResolved.quoteTokenAddress !== poolSnapshot.quoteTokenAddress
    ) {
      throw new Error("BASE_QUOTE_ORIENTATION_INCONSISTENT: discovery pair and pool quote token differ");
    }

    if (
      canonicalPairResolved.quoteTokenSymbol &&
      poolSnapshot.quoteToken !== canonicalPairResolved.quoteTokenSymbol &&
      canonicalPairResolved.quoteTokenAddress !== poolSnapshot.quoteTokenAddress
    ) {
      throw new Error("BASE_QUOTE_ORIENTATION_INCONSISTENT: discovery pair and pool quote token symbol differ");
    }

    if (config.requiredOhlcvTimeframe) {
      const ohlcvRaw = await config.marketData.getPoolOhlcvWithHash(poolSnapshot.poolId);
      const ohlcvSeries = mapPoolOhlcvToSeries(
        ohlcvRaw.raw,
        poolSnapshot.poolId,
        config.requiredOhlcvTimeframe,
        timestamp,
        ohlcvRaw.rawPayloadHash
      );
      if (ohlcvSeries.candles.length === 0) {
        throw new Error(`OHLCV_TIMEFRAME_UNAVAILABLE:${config.requiredOhlcvTimeframe}`);
      }
    }

    if (config.requireRecentActivity) {
      const transactionRaw = await config.marketData.getPoolTransactionsWithHash(poolSnapshot.poolId);
      const transactionTape = mapPoolTransactionsToTape(
        transactionRaw.raw,
        poolSnapshot.poolId,
        timestamp,
        transactionRaw.rawPayloadHash
      );
      if (transactionTape.transactions.length === 0) {
        throw new Error("RECENT_ACTIVITY_UNAVAILABLE: DexPaprika transaction tape is unavailable");
      }
    }

    const market: MarketSnapshot = mapPoolToMarketSnapshot(
      selectedPoolWithLiquidity,
      traceId,
      timestamp,
      sha256(
        JSON.stringify({
          discovery: {
            query: tokenQuery,
            searchHash: discoverySearch.rawPayloadHash,
            canonicalSearchHash: tokenPairs.rawPayloadHash,
            canonicalTokenAddress,
            selectedPairId: canonicalPairResolved.pairId,
          },
          marketData: {
            tokenHash: tokenLatest.rawPayloadHash,
            poolHash: tokenPools.rawPayloadHash,
          },
        })
      )
    );

    const balance = await config.rpcClient.getBalance(config.walletAddress, canonicalTokenAddress);
    const walletAmount = normalizeAtomicBalance(balance.balance, balance.decimals);
    const walletAmountUsd = Number.isFinite(tokenSnapshot.priceUsd)
      ? walletAmount * tokenSnapshot.priceUsd
      : undefined;

    const wallet: WalletSnapshot = {
      traceId,
      timestamp,
      source: "rpc",
      walletAddress: config.walletAddress,
      balances: [
        {
          mint: canonicalTokenAddress,
          symbol: tokenSnapshot.baseToken,
          decimals: balance.decimals,
          amount: balance.balance,
          ...(walletAmountUsd !== undefined ? { amountUsd: walletAmountUsd } : {}),
        },
      ],
      totalUsd: walletAmountUsd ?? 0,
      rawPayloadHash: sha256(
        JSON.stringify({
          walletAddress: config.walletAddress,
          tokenAddress: canonicalTokenAddress,
          balance,
        })
      ),
    };

    return { market, wallet };
  };
}

function assertProviderSelection(
  discoveryProvider?: DiscoveryProvider,
  marketDataProvider?: MarketDataProvider
): void {
  if (discoveryProvider && discoveryProvider !== PRIMARY_DISCOVERY_PROVIDER) {
    throw new Error("DISCOVERY_PROVIDER must resolve through DexScreener for the default ingest path.");
  }
  if (marketDataProvider && marketDataProvider !== PRIMARY_MARKET_PROVIDER) {
    throw new Error("MARKET_DATA_PROVIDER must resolve through DexPaprika for the default ingest path.");
  }
}

function selectBestPairCandidate(
  candidates: readonly ReturnType<typeof selectCanonicalPairCandidate>[]
): NonNullable<ReturnType<typeof selectCanonicalPairCandidate>> | undefined {
  const ranked = candidates
    .filter((candidate): candidate is NonNullable<ReturnType<typeof selectCanonicalPairCandidate>> => candidate != null)
    .sort((left, right) => {
      const leftLiquidity = left.liquidityUsd ?? 0;
      const rightLiquidity = right.liquidityUsd ?? 0;
      if (rightLiquidity !== leftLiquidity) {
        return rightLiquidity - leftLiquidity;
      }

      const leftVolume = left.volume24hUsd ?? 0;
      const rightVolume = right.volume24hUsd ?? 0;
      if (rightVolume !== leftVolume) {
        return rightVolume - leftVolume;
      }

      return (right.priceUsd ?? 0) - (left.priceUsd ?? 0);
    });

  return ranked[0];
}

function resolveCanonicalTokenAddress(tokenQuery: string, discoveredTokenAddress: string): string {
  if (BASE58_SOLANA_ADDRESS.test(tokenQuery)) {
    if (tokenQuery !== discoveredTokenAddress) {
      throw new Error("TOKEN_CANNOT_BE_RESOLVED_CANONICALLY: query address does not match discovered canonical token");
    }
    return tokenQuery;
  }

  if (!discoveredTokenAddress.trim()) {
    throw new Error("TOKEN_CANNOT_BE_RESOLVED_CANONICALLY: discovery did not return a canonical token address");
  }

  return discoveredTokenAddress;
}

function extractDexPaprikaPools(raw: unknown, canonicalTokenId?: string): DexPaprikaPoolItem[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw != null && typeof raw === "object"
      ? Array.isArray((raw as Record<string, unknown>).pools)
        ? ((raw as Record<string, unknown>).pools as unknown[])
        : Array.isArray((raw as Record<string, unknown>).data)
          ? ((raw as Record<string, unknown>).data as unknown[])
          : []
      : [];

  return rows.flatMap((row) => normalizeDexPaprikaPool(row, canonicalTokenId));
}

function normalizeDexPaprikaPool(raw: unknown, canonicalTokenId?: string): DexPaprikaPoolItem[] {
  if (raw == null || typeof raw !== "object") {
    return [];
  }

  const record = raw as Record<string, unknown>;
  const id = toString(record.id);
  if (!id) {
    return [];
  }

  const baseToken =
    toDexPaprikaTokenRef(record.base_token) ??
    pickDexPaprikaTokenFromTokens(record.tokens, canonicalTokenId, true);
  const quoteToken =
    toDexPaprikaTokenRef(record.quote_token) ??
    pickDexPaprikaTokenFromTokens(record.tokens, canonicalTokenId, false);

  if (!baseToken || !quoteToken) {
    return [];
  }

  return [
    {
      id,
      name: toString(record.name) ?? toString(record.dex_name),
      base_token: baseToken,
      quote_token: quoteToken,
      price_usd: toNumber(record.price_usd),
      liquidity_usd: toNumber(record.liquidity_usd),
      volume_24h_usd: toNumber(record.volume_24h_usd ?? record.volume_usd),
      last_updated: toString(record.last_updated) ?? toString(record.created_at),
    },
  ];
}

function selectCanonicalPool(
  pools: readonly DexPaprikaPoolItem[],
  canonicalPair: NonNullable<ReturnType<typeof selectCanonicalPairCandidate>>
): DexPaprikaPoolItem | undefined {
  const tokenId = canonicalPair.baseTokenAddress;
  const quoteTokenAddress = canonicalPair.quoteTokenAddress;
  const quoteTokenSymbol = canonicalPair.quoteTokenSymbol;

  const ranked = pools
    .filter((pool) => pool.base_token?.id === tokenId)
    .sort((left, right) => {
      const leftQuoteMatch = scoreQuoteMatch(left, quoteTokenAddress, quoteTokenSymbol);
      const rightQuoteMatch = scoreQuoteMatch(right, quoteTokenAddress, quoteTokenSymbol);
      if (rightQuoteMatch !== leftQuoteMatch) {
        return rightQuoteMatch - leftQuoteMatch;
      }

      const leftLiquidity = left.liquidity_usd ?? 0;
      const rightLiquidity = right.liquidity_usd ?? 0;
      if (rightLiquidity !== leftLiquidity) {
        return rightLiquidity - leftLiquidity;
      }

      const leftVolume = left.volume_24h_usd ?? 0;
      const rightVolume = right.volume_24h_usd ?? 0;
      return rightVolume - leftVolume;
    });

  const selected = ranked[0];
  if (!selected) {
    return undefined;
  }

  if (selected.base_token?.id !== tokenId) {
    return undefined;
  }

  if (quoteTokenAddress && selected.quote_token?.id !== quoteTokenAddress) {
    return undefined;
  }

  if (quoteTokenSymbol && selected.quote_token?.symbol !== quoteTokenSymbol && quoteTokenAddress) {
    return undefined;
  }

  return selected;
}

function scoreQuoteMatch(
  pool: DexPaprikaPoolItem,
  quoteTokenAddress?: string,
  quoteTokenSymbol?: string
): number {
  if (quoteTokenAddress && pool.quote_token?.id === quoteTokenAddress) {
    return 3;
  }
  if (quoteTokenSymbol && pool.quote_token?.symbol === quoteTokenSymbol) {
    return 2;
  }
  if (pool.quote_token?.id || pool.quote_token?.symbol) {
    return 1;
  }
  return 0;
}

function coerceDexPaprikaToken(raw: unknown): DexPaprikaTokenResponse {
  if (raw != null && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const id = toString(record.id);
    const name = toString(record.name) ?? id;
    const symbol = toString(record.symbol) ?? id;
    const chain = toString(record.chain) ?? "solana";
    const decimals = toNumber(record.decimals);

    if (id && name && symbol && decimals !== undefined && Number.isFinite(decimals)) {
      return {
        id,
        name,
        symbol,
        chain,
        decimals,
        summary: record.summary as DexPaprikaTokenResponse["summary"] | undefined,
        last_updated: toString(record.last_updated),
      };
    }
  }

  throw new Error("DEXPAPRIKA_TOKEN_UNAVAILABLE: token latest snapshot could not be normalized");
}

function normalizeAtomicBalance(balance: string, decimals: number): number {
  const raw = Number.parseFloat(balance);
  if (!Number.isFinite(raw) || decimals < 0) {
    return 0;
  }
  return raw / 10 ** decimals;
}

function toDexPaprikaTokenRef(
  value: unknown
): { id: string; symbol: string } | undefined {
  if (value != null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const id = toString(record.id);
    const symbol = toString(record.symbol);
    if (id && symbol) {
      return { id, symbol };
    }
  }

  return undefined;
}

function extractDexPaprikaPoolLiquidity(raw: unknown): number | undefined {
  if (raw != null && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const topLevelLiquidity = toNumber(record.liquidity_usd ?? record.liquidityUsd);
    if (topLevelLiquidity !== undefined) {
      return topLevelLiquidity;
    }

    const reserves = record.token_reserves ?? record.tokenReserves;
    if (Array.isArray(reserves)) {
      const summed = reserves.reduce((total, reserve) => {
        if (reserve == null || typeof reserve !== "object") {
          return total;
        }

        const reserveRecord = reserve as Record<string, unknown>;
        const reserveUsd = toNumber(reserveRecord.reserve_usd ?? reserveRecord.reserveUsd);
        return reserveUsd !== undefined ? total + reserveUsd : total;
      }, 0);

      return summed > 0 ? summed : undefined;
    }
  }

  return undefined;
}

function pickDexPaprikaTokenFromTokens(
  value: unknown,
  canonicalTokenId: string | undefined,
  preferCanonical: boolean
): { id: string; symbol: string } | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tokens = value.flatMap((item) => {
    if (item == null || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const id = toString(record.id);
    const symbol = toString(record.symbol);
    if (!id || !symbol) {
      return [];
    }

    return [{ id, symbol }];
  });

  if (tokens.length === 0) {
    return undefined;
  }

  if (canonicalTokenId) {
    const canonical = tokens.find((token) => token.id === canonicalTokenId);
    const other = tokens.find((token) => token.id !== canonicalTokenId);
    if (preferCanonical) {
      return canonical;
    }
    return other ?? canonical;
  }

  return preferCanonical ? tokens[0] : tokens[1] ?? tokens[0];
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function toString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}
