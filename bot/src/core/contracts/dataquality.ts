/**
 * DataQuality - completeness, freshness, sourceReliability.
 * Extended for Cross-Source Validation with discrepancy detection.
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

export const DataQualityV1Schema = z.object({
  schema_version: z.literal("data_quality.v1"),
  traceId: z.string(),
  timestamp: z.string().datetime(),
  completeness: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
  sourceReliability: z.number().min(0).max(1),
  crossSourceConfidence: z.number().min(0).max(1).optional(),
  // Extended fields for cross-source validation
  discrepancy: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1),
  source_breakdown: z.record(SourceQualitySchema).optional(),
  discrepancy_flags: z.array(z.string()).default([]),
});

// Legacy schema for backwards compatibility
export const DataQualitySchema = DataQualityV1Schema.omit({
  schema_version: true,
  discrepancy: true,
  confidence: true,
  source_breakdown: true,
  discrepancy_flags: true,
}).merge(z.object({
  crossSourceConfidence: z.number().min(0).max(1).optional(),
}));

export type SourceQuality = z.infer<typeof SourceQualitySchema>;
export type DataQualityV1 = z.infer<typeof DataQualityV1Schema>;
export type DataQuality = z.infer<typeof DataQualitySchema>;

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
  threshold: number = DISCREPANCY_THRESHOLD
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
        flags.push(`price_divergence:${s1}:${s2}:${diff.toFixed(4)}`);
      }
    }
  }
  
  return flags;
}
