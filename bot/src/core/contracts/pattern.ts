/**
 * PatternResult - Output von reasoning.pattern_recognizer.
 * Version: 1.1.0 | Owner: Kimi Swarm | Layer: core/contracts | Last Updated: 2026-03-04
 */
import { z } from "zod";

export const PATTERN_IDS = [
  "velocity_liquidity_divergence",
  "bundle_sybil_cluster",
  "narrative_shift",
  "smart_money_fakeout",
  "early_pump_risk",
  "sentiment_structural_mismatch",
  "cross_source_anomaly",
  "fragile_expansion",
] as const;

const PatternIdSchema = z.enum(PATTERN_IDS);

export const PatternEvidenceSchema = z.object({
  id: z.string(),
  hash: z.string(),
});

export const PatternResultSchema = z.object({
  traceId: z.string(),
  timestamp: z.string().datetime(),
  patterns: z.array(PatternIdSchema),
  flags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  evidence: z.array(PatternEvidenceSchema),
});

export type PatternId = (typeof PATTERN_IDS)[number];
export type PatternEvidence = z.infer<typeof PatternEvidenceSchema>;
export type PatternResult = z.infer<typeof PatternResultSchema>;
