/**
 * DexPaprika response mappers.
 *
 * Legacy helpers remain for existing MarketSnapshot consumers.
 * New helpers normalize token/pool snapshots and activity tapes into
 * provider-agnostic contracts without elevating raw payloads to authority.
 */
import type { MarketSnapshot } from "../../core/contracts/market.js";
import type { NormalizedTokenV1 } from "../../core/contracts/normalized-token.js";
import type {
  OhlcvSeriesV1,
  PoolMarketSnapshotV1,
  PoolTransactionTapeV1,
  TokenMarketSnapshotV1,
} from "../../core/contracts/provider-market-data.js";
import type { DexScreenerPairInfo, DexScreenerTokenResponse } from "../dexscreener/types.js";
import type { DexPaprikaPoolItem, DexPaprikaTokenResponse } from "./types.js";

export function mapTokenToMarketSnapshot(
  raw: DexPaprikaTokenResponse,
  traceId: string,
  timestamp: string,
  rawPayloadHash?: string
): MarketSnapshot {
  const priceUsd = raw.summary?.price_usd ?? 0;
  const volume24h = raw.summary?.["24h"]?.volume_usd ?? raw.summary?.["24h"]?.volume ?? 0;

  return {
    schema_version: "market.v1",
    traceId,
    timestamp,
    source: "dexpaprika",
    poolId: raw.id,
    baseToken: raw.symbol,
    quoteToken: "USD",
    priceUsd,
    volume24h: Number(volume24h),
    liquidity: (raw.summary as { liquidity_usd?: number })?.liquidity_usd ?? 0,
    freshnessMs: 0,
    rawPayloadHash,
  };
}

export function mapPoolToMarketSnapshot(
  raw: DexPaprikaPoolItem,
  traceId: string,
  timestamp: string,
  rawPayloadHash?: string
): MarketSnapshot {
  const priceUsd = requirePositiveNumber(raw.price_usd, "DexPaprika pool price is missing");
  const liquidity = requireNonNegativeNumber(raw.liquidity_usd, "DexPaprika pool liquidity is missing");
  const volume24h = requireNonNegativeNumber(raw.volume_24h_usd, "DexPaprika pool volume is missing");
  const baseToken = raw.base_token?.symbol ?? raw.base_token?.id;
  const quoteToken = raw.quote_token?.symbol ?? raw.quote_token?.id;

  if (!baseToken?.trim()) {
    throw new Error("DexPaprika pool base token is missing");
  }
  if (!quoteToken?.trim()) {
    throw new Error("DexPaprika pool quote token is missing");
  }

  return {
    schema_version: "market.v1",
    traceId,
    timestamp,
    source: "dexpaprika",
    poolId: raw.id,
    baseToken,
    quoteToken,
    priceUsd,
    volume24h,
    liquidity,
    freshnessMs: 0,
    rawPayloadHash,
  };
}

export function mapTokenToTokenMarketSnapshot(
  raw: DexPaprikaTokenResponse,
  tokenAddress: string,
  fetchedAt: string,
  rawPayloadHash?: string
): TokenMarketSnapshotV1 {
  const priceUsd = requirePositiveNumber(raw.summary?.price_usd, "DexPaprika token price is missing");
  const volume24hUsd = requireNonNegativeNumber(
    raw.summary?.["24h"]?.volume_usd ?? raw.summary?.["24h"]?.volume,
    "DexPaprika token volume is missing"
  );
  const liquidityUsd = requireNonNegativeNumber(
    (raw.summary as { liquidity_usd?: number } | undefined)?.liquidity_usd,
    "DexPaprika token liquidity is missing"
  );

  return {
    schema_version: "token_market_snapshot.v1",
    provider: "dexpaprika",
    kind: "market_data",
    chain: "solana",
    tokenId: raw.id,
    tokenAddress,
    baseToken: raw.symbol,
    quoteToken: "USD",
    priceUsd,
    volume24hUsd,
    liquidityUsd,
    freshnessMs: 0,
    observedAt: fetchedAt,
    fetchedAt,
    ...(rawPayloadHash ? { rawPayloadHash } : {}),
    status: "ok",
    metadata: {
      name: raw.name,
      chain: raw.chain,
      decimals: raw.decimals,
      lastUpdated: raw.last_updated,
    },
  };
}

export function mapPoolToPoolMarketSnapshot(
  raw: DexPaprikaPoolItem,
  tokenId: string,
  fetchedAt: string,
  rawPayloadHash?: string
): PoolMarketSnapshotV1 {
  const priceUsd = requirePositiveNumber(raw.price_usd, "DexPaprika pool price is missing");
  const volume24hUsd = requireNonNegativeNumber(raw.volume_24h_usd, "DexPaprika pool volume is missing");
  const liquidityUsd = requireNonNegativeNumber(raw.liquidity_usd, "DexPaprika pool liquidity is missing");
  const baseTokenAddress = raw.base_token?.id;
  const quoteTokenAddress = raw.quote_token?.id;

  if (!baseTokenAddress?.trim()) {
    throw new Error("DexPaprika pool base token address is missing");
  }
  if (!quoteTokenAddress?.trim()) {
    throw new Error("DexPaprika pool quote token address is missing");
  }

  return {
    schema_version: "pool_market_snapshot.v1",
    provider: "dexpaprika",
    kind: "market_data",
    chain: "solana",
    tokenId,
    poolId: raw.id,
    pairId: raw.id,
    baseToken: raw.base_token?.symbol ?? baseTokenAddress,
    quoteToken: raw.quote_token?.symbol ?? quoteTokenAddress,
    baseTokenAddress,
    quoteTokenAddress,
    priceUsd,
    volume24hUsd,
    liquidityUsd,
    pairCreatedAt: parseDateMaybe(raw.last_updated),
    freshnessMs: 0,
    observedAt: fetchedAt,
    fetchedAt,
    ...(rawPayloadHash ? { rawPayloadHash } : {}),
    status: "ok",
    metadata: {
      name: raw.name,
      lastUpdated: raw.last_updated,
    },
  };
}

export function mapPoolOhlcvToSeries(
  raw: unknown,
  poolId: string,
  timeframe: string,
  fetchedAt: string,
  rawPayloadHash?: string
): OhlcvSeriesV1 {
  const candles = extractOhlcvCandles(raw, timeframe);
  return {
    schema_version: "ohlcv_series.v1",
    provider: "dexpaprika",
    kind: "market_data",
    chain: "solana",
    poolId,
    timeframe,
    observedAt: fetchedAt,
    fetchedAt,
    freshnessMs: 0,
    candles,
    ...(rawPayloadHash ? { rawPayloadHash } : {}),
    status: candles.length > 0 ? "ok" : "partial",
    metadata: {
      sourceType: Array.isArray(raw) ? "array" : raw == null ? "null" : typeof raw,
    },
  };
}

export function mapPoolTransactionsToTape(
  raw: unknown,
  poolId: string,
  fetchedAt: string,
  rawPayloadHash?: string
): PoolTransactionTapeV1 {
  const transactions = extractPoolTransactions(raw);
  return {
    schema_version: "pool_transaction_tape.v1",
    provider: "dexpaprika",
    kind: "market_data",
    chain: "solana",
    poolId,
    observedAt: fetchedAt,
    fetchedAt,
    freshnessMs: 0,
    transactions,
    ...(rawPayloadHash ? { rawPayloadHash } : {}),
    status: transactions.length > 0 ? "ok" : "partial",
    metadata: {
      sourceType: Array.isArray(raw) ? "array" : raw == null ? "null" : typeof raw,
    },
  };
}

function requirePositiveNumber(value: unknown, message: string): number {
  const parsed = toNumber(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(message);
  }
  return parsed;
}

function requireNonNegativeNumber(value: unknown, message: string): number {
  const parsed = toNumber(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(message);
  }
  return parsed;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}

function parseDateMaybe(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeRawArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw != null && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data;
    }
    if (Array.isArray(record.candles)) {
      return record.candles;
    }
    if (Array.isArray(record.transactions)) {
      return record.transactions;
    }
  }
  return [];
}

function extractOhlcvCandles(raw: unknown, timeframe: string): OhlcvSeriesV1["candles"] {
  const rows = normalizeRawArray(raw);
  const deltaMs = parseTimeframeToMs(timeframe);

  return rows.flatMap((row) => {
    if (row == null || typeof row !== "object") {
      return [];
    }

    const record = row as Record<string, unknown>;
    const startTime =
      toIsoString(record.startTime) ??
      toIsoString(record.start_time) ??
      toIsoString(record.time) ??
      toIsoString(record.timestamp) ??
      toIsoString(record.t);
    if (!startTime) {
      return [];
    }

    const open = toNumber(record.open);
    const high = toNumber(record.high);
    const low = toNumber(record.low);
    const close = toNumber(record.close);
    const volumeUsd = toNumber(record.volumeUsd ?? record.volume_usd ?? record.volume ?? record.v);
    if (![open, high, low, close, volumeUsd].every((value) => Number.isFinite(value))) {
      return [];
    }

    const openValue = open as number;
    const highValue = high as number;
    const lowValue = low as number;
    const closeValue = close as number;
    const volumeUsdValue = volumeUsd as number;

    return [
      {
        startTime,
        endTime: new Date(Date.parse(startTime) + deltaMs).toISOString(),
        open: openValue,
        high: highValue,
        low: lowValue,
        close: closeValue,
        volumeUsd: volumeUsdValue,
      },
    ];
  });
}

function extractPoolTransactions(raw: unknown): PoolTransactionTapeV1["transactions"] {
  const rows = normalizeRawArray(raw);
  return rows.flatMap((row) => {
    if (row == null || typeof row !== "object") {
      return [];
    }

    const record = row as Record<string, unknown>;
    const signature = toString(record.signature ?? record.txSignature ?? record.hash ?? record.id);
    const timestamp =
      toIsoString(record.timestamp) ??
      toIsoString(record.time) ??
      toIsoString(record.blockTime) ??
      toIsoString(record.block_time);
    if (!signature || !timestamp) {
      return [];
    }

    return [
      {
        signature,
        timestamp,
        side: normalizeTransactionSide(record.side ?? record.type ?? record.action),
        ...(() => {
          const amountUsd = toNumber(record.amountUsd ?? record.amount_usd ?? record.usd_value);
          return amountUsd !== undefined ? { amountUsd } : {};
        })(),
        ...(() => {
          const priceUsd = toNumber(record.priceUsd ?? record.price_usd);
          return priceUsd !== undefined ? { priceUsd } : {};
        })(),
        ...(() => {
          const baseTokenAmount = toNumber(record.baseTokenAmount ?? record.base_token_amount);
          return baseTokenAmount !== undefined ? { baseTokenAmount } : {};
        })(),
        ...(() => {
          const quoteTokenAmount = toNumber(record.quoteTokenAmount ?? record.quote_token_amount);
          return quoteTokenAmount !== undefined ? { quoteTokenAmount } : {};
        })(),
        metadata: {
          sourceType: typeof row,
        },
      },
    ];
  });
}

function normalizeTransactionSide(value: unknown): "buy" | "sell" | "add_liquidity" | "remove_liquidity" | "swap" | "unknown" {
  const side = String(value ?? "").toLowerCase();
  if (side === "buy" || side === "sell" || side === "add_liquidity" || side === "remove_liquidity" || side === "swap") {
    return side;
  }
  return "unknown";
}

function parseTimeframeToMs(timeframe: string): number {
  const match = timeframe.trim().match(/^(\d+)([mhd])$/i);
  if (!match) {
    throw new Error(`Unsupported OHLCV timeframe: ${timeframe}`);
  }

  const value = Number.parseInt(match[1] ?? "0", 10);
  const unit = (match[2] ?? "m").toLowerCase();
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Unsupported OHLCV timeframe: ${timeframe}`);
  }

  if (unit === "m") {
    return value * 60_000;
  }
  if (unit === "h") {
    return value * 60 * 60_000;
  }
  if (unit === "d") {
    return value * 24 * 60 * 60_000;
  }

  throw new Error(`Unsupported OHLCV timeframe: ${timeframe}`);
}

function toIsoString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    const iso = new Date(value).toISOString();
    return iso;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
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

/**
 * Map DexScreener response to array of NormalizedTokenV1
 *
 * Groups pairs by base token and creates canonical token entries.
 * Used for TokenUniverse building.
 */
export function mapPairsToTokenUniverse(
  response: DexScreenerTokenResponse,
  chain: "solana" | "ethereum" | "base" = "solana",
  traceId: string,
  timestamp: string,
  rawPayloadHash?: string
): NormalizedTokenV1[] {
  if (!response.pairs || response.pairs.length === 0) {
    return [];
  }

  // Group pairs by base token address
  const byToken = new Map<string, DexScreenerPairInfo[]>();
  for (const pair of response.pairs) {
    const key = pair.baseToken.address;
    if (!byToken.has(key)) {
      byToken.set(key, []);
    }
    byToken.get(key)!.push(pair);
  }

  return Array.from(byToken.entries()).map(([address, pairs]) => {
    const primaryPair = pairs[0];
    void traceId;
    void rawPayloadHash;

    return {
      schema_version: "normalized_token.v1",
      canonical_id: `dexscreener:${chain}:${address}`,
      symbol: primaryPair.baseToken.symbol,
      mint: address,
      chain,
      sources: ["dexscreener"],
      confidence_score: calculateConfidence(pairs),
      mappings: {
        dexscreener: {
          tokenId: address,
          pairId: primaryPair.pairAddress,
        },
      },
      metadata: {
        name: primaryPair.baseToken.name,
        decimals: undefined, // Not provided by DexScreener API
        logoUrl: undefined,
        tags: [...new Set(pairs.map((p) => p.dexId))], // Unique DEX IDs
      },
      discovered_at: timestamp,
      last_updated: timestamp,
    };
  });
}

/**
 * Calculate confidence score based on available data
 *
 * Factors:
 * - Number of pairs (more = better, up to 5)
 * - Total liquidity (higher = better, up to $1M)
 * - 24h volume (higher = better)
 */
function calculateConfidence(pairs: DexScreenerPairInfo[]): number {
  if (pairs.length === 0) return 0;

  const totalLiquidity = pairs.reduce((sum, p) => sum + (p.liquidity?.usd || 0), 0);
  const totalVolume = pairs.reduce((sum, p) => sum + (p.volume?.h24 || 0), 0);

  // Liquidity score: logarithmic scale, capped at $1M
  const liquidityScore = totalLiquidity > 0
    ? Math.min(1, Math.log10(totalLiquidity) / 6) // log10(1M) = 6
    : 0;

  // Pair count score: more pairs = higher confidence (up to 5)
  const pairCountScore = Math.min(1, pairs.length / 5);

  // Volume score: logarithmic scale, capped at $100K
  const volumeScore = totalVolume > 0
    ? Math.min(1, Math.log10(totalVolume) / 5) // log10(100K) = 5
    : 0;

  // Weighted combination
  // 50% liquidity, 30% pair count, 20% volume
  const rawScore = (liquidityScore * 0.5) + (pairCountScore * 0.3) + (volumeScore * 0.2);

  // Scale to 0.5-1.0 range (minimum 0.5 for any valid data)
  return 0.5 + (rawScore * 0.5);
}

/**
 * Extract trending tokens from DexScreener response
 *
 * Sorts by volume and returns top N tokens
 */
export function extractTrendingTokens(
  response: DexScreenerTokenResponse,
  limit: number = 20
): Array<{ symbol: string; address: string; volume24h: number; liquidity: number }> {
  if (!response.pairs || response.pairs.length === 0) {
    return [];
  }

  // Group by token and aggregate metrics
  const byToken = new Map<string, { symbol: string; address: string; volume24h: number; liquidity: number }>();

  for (const pair of response.pairs) {
    const addr = pair.baseToken.address;
    const existing = byToken.get(addr);

    if (existing) {
      existing.volume24h += pair.volume?.h24 || 0;
      existing.liquidity += pair.liquidity?.usd || 0;
    } else {
      byToken.set(addr, {
        symbol: pair.baseToken.symbol,
        address: addr,
        volume24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
      });
    }
  }

  // Sort by volume and return top N
  return Array.from(byToken.values())
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, limit);
}
