/**
 * SignalPack - Aggregierte Signale aus Quellen.
 * @deprecated migration target: `intelligence/signals/contracts/constructed-signal-set.v1.ts`.
 * Legacy non-surviving lineage; not canonical future path.
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: core/contracts | Last Updated: 2026-03-04
 */
import { z } from "zod";

export const SignalSourceSchema = z.enum(["moralis", "dexscreener", "paprika", "x_tl_keyword", "x_tl_semantic"]);

export const RawSignalSchema = z.object({
  source: SignalSourceSchema,
  timestamp: z.string().datetime(),
  poolId: z.string().optional(),
  baseToken: z.string(),
  quoteToken: z.string(),
  priceUsd: z.number().positive(),
  volume24h: z.number().nonnegative().optional(),
  liquidity: z.number().nonnegative().optional(),
  rawPayloadHash: z.string().optional(),
});

export const SignalPackDataQualitySchema = z.object({
  completeness: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
  sourceReliability: z.number().min(0).max(1),
  crossSourceConfidence: z.number().min(0).max(1).optional(),
});

export const SignalPackSchema = z.object({
  traceId: z.string(),
  timestamp: z.string().datetime(),
  signals: z.array(RawSignalSchema),
  dataQuality: SignalPackDataQualitySchema,
  sources: z.array(SignalSourceSchema),
});

export type SignalSource = z.infer<typeof SignalSourceSchema>;
export type RawSignal = z.infer<typeof RawSignalSchema>;
export type SignalPack = z.infer<typeof SignalPackSchema>;
