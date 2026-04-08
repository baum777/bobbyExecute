import type { WalletSnapshot } from "../core/contracts/wallet.js";
import { sha256 } from "../core/determinism/hash.js";
import type { RpcClient } from "./rpc-verify/client.js";
import { mapTokenToMarketSnapshot } from "./dexpaprika/mapper.js";
import type { DexPaprikaTokenResponse } from "./dexpaprika/types.js";
import type { MarketAdapterFetch } from "./orchestrator/adapter-orchestrator.js";

export const PRIMARY_DISCOVERY_PROVIDER_ID = "dexscreener" as const;
export const PRIMARY_MARKET_PROVIDER_ID = "dexpaprika" as const;
export const PRIMARY_WALLET_PROVIDER_ID = "rpc" as const;
export const MORALIS_FALLBACK_PROVIDER_ID = "moralis" as const;
export const OPTIONAL_INTELLIGENCE_PROVIDER_ID = "dexcheck" as const;

export const CANONICAL_PROVIDER_ROLE_SPLIT = {
  dexscreener: {
    providerId: PRIMARY_DISCOVERY_PROVIDER_ID,
    plane: "discovery",
    priority: "primary",
    requiredForPaperRuntime: true,
    responsibilities: [
      "token search",
      "token to candidate pair resolution",
      "initial pair shortlist",
      "boost / order / profile metadata",
      "discovery evidence support",
    ],
  },
  dexpaprika: {
    providerId: PRIMARY_MARKET_PROVIDER_ID,
    plane: "market_data",
    priority: "primary",
    requiredForPaperRuntime: true,
    responsibilities: [
      "pool ingest",
      "token latest snapshot",
      "pool latest snapshot",
      "ohlcv",
      "recent pool transactions",
      "advanced pool filtering",
      "batched prices",
      "paper-mode normalized market data",
      "market freshness baseline",
    ],
  },
  rpc: {
    providerId: PRIMARY_WALLET_PROVIDER_ID,
    plane: "wallet",
    priority: "primary",
    requiredForPaperRuntime: true,
    responsibilities: [
      "wallet snapshots",
      "native balance",
      "token balances",
      "onchain verification support",
      "derived wallet normalization",
    ],
  },
  moralis: {
    providerId: MORALIS_FALLBACK_PROVIDER_ID,
    plane: "wallet",
    priority: "fallback_only",
    requiredForPaperRuntime: false,
    responsibilities: [
      "disabled fallback wallet snapshots",
      "legacy cross-check support only when explicitly enabled",
    ],
  },
  dexcheck: {
    providerId: OPTIONAL_INTELLIGENCE_PROVIDER_ID,
    plane: "intelligence",
    priority: "optional",
    requiredForPaperRuntime: false,
    responsibilities: [
      "whale tracking",
      "top trader signals",
      "wallet signals",
      "smart-money signals",
      "websocket analytics",
    ],
  },
} as const;

export function getPaperMarketAdapterRoleViolations(
  adapters: readonly Pick<MarketAdapterFetch, "id">[]
): string[] {
  const violations: string[] = [];

  if (adapters.length === 0) {
    violations.push(
      "Paper runtime requires at least one market adapter and must begin with DexPaprika."
    );
    return violations;
  }

  if (adapters[0]?.id !== PRIMARY_MARKET_PROVIDER_ID) {
    violations.push(
      "Paper runtime market ingest must start with DexPaprika as the primary market adapter."
    );
  }

  if (adapters.some((adapter) => adapter.id === OPTIONAL_INTELLIGENCE_PROVIDER_ID)) {
    violations.push("DexCheck is intelligence-only and cannot be wired into paper market ingest.");
  }

  return violations;
}

export function assertCanonicalPaperMarketAdapters(
  adapters: readonly Pick<MarketAdapterFetch, "id">[]
): void {
  const violations = getPaperMarketAdapterRoleViolations(adapters);
  if (violations.length > 0) {
    throw new Error(violations.join(" "));
  }
}

export function getPaperWalletProviderViolation(
  wallet: Pick<WalletSnapshot, "source">
): string | null {
  if (wallet.source !== PRIMARY_WALLET_PROVIDER_ID) {
    return "Paper runtime wallet and holder intake must come from RPC-derived snapshots.";
  }

  return null;
}

export function createCanonicalPaperMarketAdapters(params: {
  dexpaprika: {
    getTokenWithHash: (tokenId: string) => Promise<{
      raw: unknown;
      rawPayloadHash: string;
    }>;
  };
  tokenId: string;
}): MarketAdapterFetch[] {
  return [
    {
      id: PRIMARY_MARKET_PROVIDER_ID,
      fetch: async () => {
        const timestamp = new Date().toISOString();
        const traceId = `paper-${PRIMARY_MARKET_PROVIDER_ID}-${timestamp}`;
        const token = await params.dexpaprika.getTokenWithHash(params.tokenId);
        const tokenRaw = token.raw as {
          id: string;
          name?: string;
          symbol: string;
          chain?: string;
          decimals?: number;
          summary?: {
            price_usd?: number;
            "24h"?: { volume?: number; volume_usd?: number };
            liquidity_usd?: number;
          };
        };

        return mapTokenToMarketSnapshot(
          {
            id: tokenRaw.id,
            name: tokenRaw.name ?? tokenRaw.symbol,
            symbol: tokenRaw.symbol,
            chain: tokenRaw.chain ?? "solana",
            decimals: tokenRaw.decimals ?? 9,
            summary: tokenRaw.summary,
          } satisfies DexPaprikaTokenResponse,
          traceId,
          timestamp,
          token.rawPayloadHash
        );
      },
    },
  ];
}

function normalizeAtomicBalance(balance: string, decimals: number): number {
  const raw = Number.parseFloat(balance);
  if (!Number.isFinite(raw) || decimals < 0) {
    return 0;
  }
  return raw / 10 ** decimals;
}

export function createCanonicalPaperWalletSnapshotFetcher(params: {
  rpcClient: Pick<RpcClient, "getBalance">;
  walletAddress: string;
  tokenMint?: string;
  tokenPriceUsd?: number;
}): () => Promise<WalletSnapshot> {
  return async () => {
    const timestamp = new Date().toISOString();
    const traceId = `paper-${PRIMARY_WALLET_PROVIDER_ID}-${timestamp}`;
    const trackedMint = params.tokenMint ?? "So11111111111111111111111111111111111111112";
    const balance = await params.rpcClient.getBalance(params.walletAddress, trackedMint);
    const normalizedAmount = normalizeAtomicBalance(balance.balance, balance.decimals);
    const amountUsd =
      typeof params.tokenPriceUsd === "number" && Number.isFinite(params.tokenPriceUsd)
        ? normalizedAmount * params.tokenPriceUsd
        : undefined;

    return {
      traceId,
      timestamp,
      source: "rpc",
      walletAddress: params.walletAddress,
      balances: [
        {
          mint: trackedMint,
          symbol: trackedMint === "So11111111111111111111111111111111111111112" ? "SOL" : trackedMint,
          decimals: balance.decimals,
          amount: balance.balance,
          amountUsd,
        },
      ],
      totalUsd: amountUsd,
      rawPayloadHash: sha256(JSON.stringify({
        walletAddress: params.walletAddress,
        trackedMint,
        balance,
        tokenPriceUsd: params.tokenPriceUsd ?? null,
      })),
    } satisfies WalletSnapshot;
  };
}
