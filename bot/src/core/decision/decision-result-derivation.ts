import { hashDecision } from "../determinism/hash.js";
import type { DecisionResult } from "../contracts/decisionresult.js";
import type { PatternResult } from "../contracts/pattern.js";
import type { RiskBreakdown } from "../contracts/riskbreakdown.js";
import type { MciBciScoreCard } from "../intelligence/mci-bci-formulas.js";

/**
 * Derived decision view for orchestrator lifecycle consumers.
 * This is not the canonical authority; it is a deterministic projection of already-produced evidence.
 */
export function deriveDecisionResult(
  traceId: string,
  timestamp: string,
  scoreCard: MciBciScoreCard,
  patternResult: PatternResult,
  riskBreakdown?: RiskBreakdown
): DecisionResult {
  let direction: "buy" | "sell" | "hold" = "hold";
  if (scoreCard.hybrid > 0.6) direction = "buy";
  else if (scoreCard.hybrid < -0.4) direction = "sell";

  const hasReliableConfidence = scoreCard.crossSourceConfidenceScore >= 0.85;
  const riskDeny = riskBreakdown && riskBreakdown.aggregate >= 0.8;
  const decision: "allow" | "deny" =
    direction !== "hold" && hasReliableConfidence && !riskDeny ? "allow" : "deny";

  const decisionHash = hashDecision({ scoreCard, patternResult });

  return {
    traceId,
    timestamp,
    decision,
    direction,
    confidence: Math.min(0.95, patternResult.confidence + Math.abs(scoreCard.hybrid) / 2),
    evidence: patternResult.evidence.map((e) => ({ id: e.id, hash: e.hash, type: "pattern", value: undefined })),
    decisionHash,
    rationale: `decision=${decision} hybrid=${scoreCard.hybrid} patterns=${patternResult.patterns.join(",")}`,
  };
}
