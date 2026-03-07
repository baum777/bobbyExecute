/**
 * Market data contracts - normalized from DexPaprika/DexScreener/Moralis.
 * Normalized planning package: schema_version, status, freshnessMs.
 */
import { z } from "zod";

export const MarketSourceSchema = z.enum(["dexpaprika", "dexscreener", "moralis"]);
export type MarketSource = z.infer<typeof MarketSourceSchema>;

export const MarketSnapshotSchema = z.object({
  schema_version: z.literal("market.v1").default("market.v1"),
  traceId: z.string(),
  timestamp: z.string().datetime(),
  source: MarketSourceSchema,
  decisionHash: z.string().optional(),
  resultHash: z.string().optional(),
  poolId: z.string(),
  baseToken: z.string(),
  quoteToken: z.string(),
  priceUsd: z.number().positive(),
  volume24h: z.number().nonnegative(),
  liquidity: z.number().nonnegative(),
  /** Age of data in ms at mapping time. 0 = just fetched. Required for staleness checks. */
  freshnessMs: z.number().nonnegative().optional().default(0),
  rawPayloadHash: z.string().optional(),
  /** Status for audit: ok | stale | degraded */
  status: z.enum(["ok", "stale", "degraded"]).optional(),
});

export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;
