/**
 * Repo-native DataQualityV1 contract owner.
 * Wave bundle term `DataQualityReportV1` maps here.
 * Extended for Cross-Source Validation with discrepancy detection and admission gating.
 * Version: 1.1.0 | Owner: Kimi Swarm | Layer: core/contracts | Last Updated: 2026-03-05
 */
import { z } from "zod";

export const SourceQualitySchema = z.object({
  source: z.string(),
  completeness: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
  reliability: z.number().min(0).max(1),
  latency_ms: z.number().optional(),
});

/** Data quality status: pass (ok), fail (block), degraded (warn) */
export const DataQualityStatusSchema = z.enum(["pass", "fail", "degraded"]);

export const DATA_QUALITY_REASON_CODES = [
  "DQ_MISSING_CRITICAL_FIELDS",
  "DQ_NO_OBSERVATIONS",
  "DQ_NO_CANDIDATES",
  "DQ_REJECTED_EVIDENCE",
  "DQ_UNIVERSE_EXCLUDED",
  "DQ_ROUTE_NOT_VIABLE",
  "DQ_LIQUIDITY_INELIGIBLE",
  "DQ_STALE_SOURCES",
  "DQ_DISAGREED_SOURCES",
  "DQ_LOW_COMPLETENESS",
  "DQ_LOW_FRESHNESS",
  "DQ_LOW_SOURCE_RELIABILITY",
  "DQ_LOW_CROSS_SOURCE_CONFIDENCE",
  "DQ_HIGH_DISCREPANCY",
] as const;

export const DataQualityReasonCodeSchema = z.enum(DATA_QUALITY_REASON_CODES);

export const DataQualityV1Schema = z.object({
  schema_version: z.literal("data_quality.v1"),
  traceId: z.string(),
  timestamp: z.string().datetime(),
  completeness: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
  discrepancy: z.number().min(0).max(1),
  sourceReliability: z.number().min(0).max(1),
  crossSourceConfidence: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  source_breakdown: z.record(SourceQualitySchema),
  discrepancy_flags: z.array(z.string()),
  missingCriticalFields: z.array(z.string()),
  staleSources: z.array(z.string()),
  disagreedSources: z.record(z.array(z.string())),
  routeViable: z.boolean(),
  liquidityEligible: z.boolean(),
  /** Normalized: status for fail-closed gates */
  status: DataQualityStatusSchema,
  /** Normalized: machine-readable reason codes */
  reasonCodes: z.array(DataQualityReasonCodeSchema),
});

// Legacy schema for backwards compatibility with older core consumers.
export const DataQualitySchema = DataQualityV1Schema.omit({
  schema_version: true,
  discrepancy: true,
  confidence: true,
  source_breakdown: true,
  discrepancy_flags: true,
  missingCriticalFields: true,
  staleSources: true,
  disagreedSources: true,
  routeViable: true,
  liquidityEligible: true,
  status: true,
  reasonCodes: true,
}).merge(z.object({
  crossSourceConfidence: z.number().min(0).max(1).optional(),
  status: DataQualityStatusSchema.optional(),
  reasonCodes: z.array(z.string()).optional(),
}));

export type SourceQuality = z.infer<typeof SourceQualitySchema>;
export type DataQualityV1 = z.infer<typeof DataQualityV1Schema>;
export type DataQuality = z.infer<typeof DataQualitySchema>;
export type DataQualityReasonCode = z.infer<typeof DataQualityReasonCodeSchema>;

export const DATA_QUALITY_MIN_COMPLETENESS = 0.7;
export const CROSS_SOURCE_CONFIDENCE_MIN = 0.85;
export const DISCREPANCY_THRESHOLD = 0.05; // 5%

/**
 * Calculate discrepancy between sources using sMAPE (symmetric Mean Absolute Percentage Error)
 */
export function calculateDiscrepancy(values: number[]): number {
  if (values.length < 2) return 0;

  let totalSmape = 0;
  let count = 0;

  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const v1 = values[i];
      const v2 = values[j];
      const denom = (Math.abs(v1) + Math.abs(v2)) / 2;
      if (denom === 0) continue;
      totalSmape += Math.abs(v1 - v2) / denom;
      count++;
    }
  }
  
  return count === 0 ? 0 : totalSmape / count;
}

/**
 * Generate discrepancy flags based on source comparison
 */
export function generateDiscrepancyFlags(
  sourceValues: Record<string, number>,
  threshold: number = DISCREPANCY_THRESHOLD,
  labelPrefix = "price_divergence"
): string[] {
  const flags: string[] = [];
  const sources = Object.entries(sourceValues);

  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const [s1, v1] = sources[i];
      const [s2, v2] = sources[j];
      const avg = (Math.abs(v1) + Math.abs(v2)) / 2;
      if (avg === 0) continue;

      const diff = Math.abs(v1 - v2) / avg;
      if (diff > threshold) {
        flags.push(`${labelPrefix}:${s1}:${s2}:${diff.toFixed(4)}`);
      }
    }
  }
  
  return flags;
}
