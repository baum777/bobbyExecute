/**
 * ScoreCard - MCI/BCI/Hybrid Scores (age-adjusted, double-penalty protected).
 * @deprecated migration target: deterministic pre-authority score-card contract owner.
 * Zero-authority residue only. Compatibility-only legacy contract surface; not part
 * of the canonical BobbyExecute v2 authority path.
 * Legacy non-surviving lineage; not canonical future path.
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: core/contracts | Last Updated: 2026-03-04
 */
import { z } from "zod";

export const ScoreCardSchema = z.object({
  traceId: z.string(),
  timestamp: z.string().datetime(),
  mci: z.number().min(-1).max(1),
  bci: z.number().min(-1).max(1),
  hybrid: z.number().min(-1).max(1),
  crossSourceConfidenceScore: z.number().min(0).max(1),
  ageAdjusted: z.boolean().default(true),
  doublePenaltyApplied: z.boolean().optional(),
  /** Normalized: schema version for audit */
  version: z.string().optional().default("1.0"),
  /** Normalized: hash of decision for replay */
  decisionHash: z.string().optional(),
});

export type ScoreCard = z.infer<typeof ScoreCardSchema>;
