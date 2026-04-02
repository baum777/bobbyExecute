/**
 * Pre-authority typed artifact.
 * Repo-native SignalPackV1 foundation line.
 * Observational, replayable, and explicitly non-authoritative.
 */
import { z } from "zod";

export const SignalPackCoverageStatusSchema = z.enum([
  "OK",
  "PARTIAL",
  "STALE",
  "ERROR",
  "MISSING",
]);

export const SignalPackSourceCoverageEntrySchema = z.object({
  status: SignalPackCoverageStatusSchema,
  completeness: z.number().min(0).max(1).nullable().default(null),
  freshness: z.number().min(0).max(1).nullable().default(null),
  freshnessMs: z.number().int().nonnegative().nullable().default(null),
  evidenceRefs: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

export const SignalPackMarketStructureSchema = z.object({
  observedHigh: z.number().nullable().default(null),
  observedLow: z.number().nullable().default(null),
  lastPrice: z.number().nullable().default(null),
  priceReturnPct: z.number().nullable().default(null),
  drawdownPct: z.number().nullable().default(null),
  rangePct: z.number().nullable().default(null),
  reclaimGapPct: z.number().nullable().default(null),
  lowerHighPct: z.number().nullable().default(null),
  higherHighPct: z.number().nullable().default(null),
  lowerLowPct: z.number().nullable().default(null),
  higherLowPct: z.number().nullable().default(null),
  pivotCount: z.number().int().nonnegative().nullable().default(null),
  notes: z.array(z.string()).default([]),
});

export const SignalPackVolatilitySchema = z.object({
  realizedVolatilityPct: z.number().nullable().default(null),
  atrPct: z.number().nullable().default(null),
  rangePct: z.number().nullable().default(null),
  maxStalenessMs: z.number().int().nonnegative().nullable().default(null),
  notes: z.array(z.string()).default([]),
});

export const SignalPackLiquiditySchema = z.object({
  liquidityUsd: z.number().nullable().default(null),
  liquidityScore: z.number().nullable().default(null),
  spreadPct: z.number().nullable().default(null),
  depthUsd: z.number().nullable().default(null),
  slippagePct: z.number().nullable().default(null),
  notes: z.array(z.string()).default([]),
});

export const SignalPackVolumeSchema = z.object({
  volume24hUsd: z.number().nullable().default(null),
  relativeVolumePct: z.number().nullable().default(null),
  volumeMomentumPct: z.number().nullable().default(null),
  transferCount: z.number().int().nonnegative().nullable().default(null),
  notes: z.array(z.string()).default([]),
});

export const SignalPackHolderFlowSchema = z.object({
  holderCount: z.number().int().nonnegative().nullable().default(null),
  holderConcentrationPct: z.number().nullable().default(null),
  holderTurnoverPct: z.number().nullable().default(null),
  netFlowUsd: z.number().nullable().default(null),
  netFlowDirection: z.enum(["inflow", "outflow", "flat"]).nullable().default(null),
  participationPct: z.number().nullable().default(null),
  notes: z.array(z.string()).default([]),
});

export const SignalPackManipulationFlagsSchema = z.object({
  washTradingSuspected: z.boolean().nullable().default(null),
  spoofingSuspected: z.boolean().nullable().default(null),
  concentrationFragility: z.boolean().nullable().default(null),
  staleSourceRisk: z.boolean().nullable().default(null),
  crossSourceDivergence: z.boolean().nullable().default(null),
  anomalyFlags: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

export const SignalPackV1Schema = z.object({
  schema_version: z.literal("signal_pack.v1"),
  chain: z.enum(["solana"]),
  token: z.string(),
  traceId: z.string(),
  timestamp: z.string().datetime(),
  dataQualityTraceId: z.string(),
  cqdHash: z.string(),
  marketStructure: SignalPackMarketStructureSchema,
  volatility: SignalPackVolatilitySchema,
  liquidity: SignalPackLiquiditySchema,
  volume: SignalPackVolumeSchema,
  holderFlow: SignalPackHolderFlowSchema,
  manipulationFlags: SignalPackManipulationFlagsSchema,
  evidenceRefs: z.array(z.string()).default([]),
  missingFields: z.array(z.string()).default([]),
  sourceCoverage: z.record(SignalPackSourceCoverageEntrySchema).default({}),
  notes: z.array(z.string()).default([]),
  payloadHash: z.string(),
});

export type SignalPackCoverageStatus = z.infer<typeof SignalPackCoverageStatusSchema>;
export type SignalPackSourceCoverageEntry = z.infer<typeof SignalPackSourceCoverageEntrySchema>;
export type SignalPackMarketStructure = z.infer<typeof SignalPackMarketStructureSchema>;
export type SignalPackVolatility = z.infer<typeof SignalPackVolatilitySchema>;
export type SignalPackLiquidity = z.infer<typeof SignalPackLiquiditySchema>;
export type SignalPackVolume = z.infer<typeof SignalPackVolumeSchema>;
export type SignalPackHolderFlow = z.infer<typeof SignalPackHolderFlowSchema>;
export type SignalPackManipulationFlags = z.infer<typeof SignalPackManipulationFlagsSchema>;
export type SignalPackV1 = z.infer<typeof SignalPackV1Schema>;

export function assertSignalPackV1(value: unknown, source = "unknown"): SignalPackV1 {
  const result = SignalPackV1Schema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const reason = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}:${issue.message}`;
    })
    .join(";");

  throw new Error(`INVALID_SIGNAL_PACK:${source}:${reason}`);
}
