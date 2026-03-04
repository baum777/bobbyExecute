/**
 * DataQuality - completeness, freshness, sourceReliability.
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: core/contracts | Last Updated: 2026-03-04
 */
import { z } from "zod";

export const DataQualitySchema = z.object({
  traceId: z.string(),
  timestamp: z.string().datetime(),
  completeness: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
  sourceReliability: z.number().min(0).max(1),
  crossSourceConfidence: z.number().min(0).max(1).optional(),
});

export type DataQuality = z.infer<typeof DataQualitySchema>;

export const DATA_QUALITY_MIN_COMPLETENESS = 0.7;
export const CROSS_SOURCE_CONFIDENCE_MIN = 0.85;
