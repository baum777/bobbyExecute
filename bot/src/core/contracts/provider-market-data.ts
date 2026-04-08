/**
 * Provider-agnostic normalized market data contracts.
 *
 * These shapes sit between provider adapters and runtime consumption. They are
 * deliberately non-authoritative: they normalize provider output but do not
 * create decision truth.
 */
import { z } from "zod";

export const DataProviderIdSchema = z.enum(["dexscreener", "dexpaprika", "moralis", "rpc"]);
export type DataProviderId = z.infer<typeof DataProviderIdSchema>;

export const DataProviderKindSchema = z.enum(["discovery", "market_data", "streaming", "wallet"]);
export type DataProviderKind = z.infer<typeof DataProviderKindSchema>;

export const NormalizedPairCandidateSchema = z
  .object({
    schema_version: z.literal("normalized_pair_candidate.v1"),
    provider: DataProviderIdSchema,
    kind: z.literal("discovery"),
    chain: z.literal("solana"),
    tokenId: z.string().min(1),
    pairId: z.string().min(1),
    dexId: z.string().min(1),
    baseTokenAddress: z.string().min(1),
    baseTokenSymbol: z.string().min(1),
    quoteTokenAddress: z.string().min(1),
    quoteTokenSymbol: z.string().min(1),
    priceUsd: z.number().nonnegative().optional(),
    liquidityUsd: z.number().nonnegative().optional(),
    volume24hUsd: z.number().nonnegative().optional(),
    freshnessMs: z.number().nonnegative().default(0),
    observedAt: z.string().datetime(),
    rawPayloadHash: z.string().optional(),
    status: z.enum(["ok", "partial", "stale", "degraded"]).default("ok"),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();
export type NormalizedPairCandidateV1 = z.infer<typeof NormalizedPairCandidateSchema>;

export const CandidatePairSearchResultSchema = z
  .object({
    schema_version: z.literal("candidate_pair_search_result.v1"),
    provider: DataProviderIdSchema,
    kind: z.literal("discovery"),
    query: z.string().min(1),
    chain: z.literal("solana"),
    tokenId: z.string().min(1),
    observedAt: z.string().datetime(),
    fetchedAt: z.string().datetime(),
    selectedPairId: z.string().optional(),
    canonicalTokenId: z.string().min(1).optional(),
    candidates: z.array(NormalizedPairCandidateSchema).default([]),
    rawPayloadHash: z.string().optional(),
    status: z.enum(["ok", "partial", "stale", "degraded"]).default("ok"),
  })
  .strict();
export type CandidatePairSearchResultV1 = z.infer<typeof CandidatePairSearchResultSchema>;

export const TokenMarketSnapshotSchema = z
  .object({
    schema_version: z.literal("token_market_snapshot.v1"),
    provider: DataProviderIdSchema,
    kind: z.literal("market_data"),
    chain: z.literal("solana"),
    tokenId: z.string().min(1),
    tokenAddress: z.string().min(1),
    pairId: z.string().min(1).optional(),
    poolId: z.string().min(1).optional(),
    baseToken: z.string().min(1),
    quoteToken: z.string().min(1),
    priceUsd: z.number().positive(),
    volume24hUsd: z.number().nonnegative(),
    liquidityUsd: z.number().nonnegative(),
    freshnessMs: z.number().nonnegative().default(0),
    observedAt: z.string().datetime(),
    fetchedAt: z.string().datetime(),
    rawPayloadHash: z.string().optional(),
    status: z.enum(["ok", "partial", "stale", "degraded"]).default("ok"),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();
export type TokenMarketSnapshotV1 = z.infer<typeof TokenMarketSnapshotSchema>;

export const PoolMarketSnapshotSchema = z
  .object({
    schema_version: z.literal("pool_market_snapshot.v1"),
    provider: DataProviderIdSchema,
    kind: z.literal("market_data"),
    chain: z.literal("solana"),
    tokenId: z.string().min(1),
    poolId: z.string().min(1),
    pairId: z.string().min(1).optional(),
    baseToken: z.string().min(1),
    quoteToken: z.string().min(1),
    baseTokenAddress: z.string().min(1).optional(),
    quoteTokenAddress: z.string().min(1).optional(),
    priceUsd: z.number().positive(),
    volume24hUsd: z.number().nonnegative(),
    liquidityUsd: z.number().nonnegative(),
    pairCreatedAt: z.number().int().nonnegative().optional(),
    freshnessMs: z.number().nonnegative().default(0),
    observedAt: z.string().datetime(),
    fetchedAt: z.string().datetime(),
    rawPayloadHash: z.string().optional(),
    status: z.enum(["ok", "partial", "stale", "degraded"]).default("ok"),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();
export type PoolMarketSnapshotV1 = z.infer<typeof PoolMarketSnapshotSchema>;

export const OhlcvCandleSchema = z
  .object({
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    open: z.number().nonnegative(),
    high: z.number().nonnegative(),
    low: z.number().nonnegative(),
    close: z.number().nonnegative(),
    volumeUsd: z.number().nonnegative(),
  })
  .strict();
export type OhlcvCandleV1 = z.infer<typeof OhlcvCandleSchema>;

export const OhlcvSeriesSchema = z
  .object({
    schema_version: z.literal("ohlcv_series.v1"),
    provider: DataProviderIdSchema,
    kind: z.literal("market_data"),
    chain: z.literal("solana"),
    poolId: z.string().min(1),
    timeframe: z.string().min(1),
    observedAt: z.string().datetime(),
    fetchedAt: z.string().datetime(),
    freshnessMs: z.number().nonnegative().default(0),
    candles: z.array(OhlcvCandleSchema).default([]),
    rawPayloadHash: z.string().optional(),
    status: z.enum(["ok", "partial", "stale", "degraded"]).default("ok"),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();
export type OhlcvSeriesV1 = z.infer<typeof OhlcvSeriesSchema>;

export const PoolTransactionSchema = z
  .object({
    signature: z.string().min(1),
    timestamp: z.string().datetime(),
    side: z.enum(["buy", "sell", "add_liquidity", "remove_liquidity", "swap", "unknown"]).default("unknown"),
    amountUsd: z.number().nonnegative().optional(),
    priceUsd: z.number().nonnegative().optional(),
    baseTokenAmount: z.number().nonnegative().optional(),
    quoteTokenAmount: z.number().nonnegative().optional(),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();
export type PoolTransactionV1 = z.infer<typeof PoolTransactionSchema>;

export const PoolTransactionTapeSchema = z
  .object({
    schema_version: z.literal("pool_transaction_tape.v1"),
    provider: DataProviderIdSchema,
    kind: z.literal("market_data"),
    chain: z.literal("solana"),
    poolId: z.string().min(1),
    observedAt: z.string().datetime(),
    fetchedAt: z.string().datetime(),
    freshnessMs: z.number().nonnegative().default(0),
    transactions: z.array(PoolTransactionSchema).default([]),
    rawPayloadHash: z.string().optional(),
    status: z.enum(["ok", "partial", "stale", "degraded"]).default("ok"),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();
export type PoolTransactionTapeV1 = z.infer<typeof PoolTransactionTapeSchema>;

export function isMarketDataProvider(value: string): value is DataProviderId {
  return DataProviderIdSchema.safeParse(value).success;
}

