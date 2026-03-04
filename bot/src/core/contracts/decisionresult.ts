/**
 * DecisionResult - Finale Entscheidung mit Evidence und Hash.
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: core/contracts | Last Updated: 2026-03-04
 */
import { z } from "zod";

export const EvidenceSchema = z.object({
  id: z.string(),
  hash: z.string(),
  type: z.string(),
  value: z.unknown().optional(),
});

export const DecisionResultSchema = z.object({
  traceId: z.string(),
  timestamp: z.string().datetime(),
  decision: z.enum(["allow", "deny"]),
  direction: z.enum(["buy", "sell", "hold"]),
  confidence: z.number().min(0).max(1),
  evidence: z.array(EvidenceSchema),
  decisionHash: z.string(),
  rationale: z.string().optional(),
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type DecisionResult = z.infer<typeof DecisionResultSchema>;
