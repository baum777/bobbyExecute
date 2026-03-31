/**
 * Normalized decision reason classification for audit-grade provenance (PR-C1).
 * Used across dry / paper / live; must stay stable for cross-mode replay.
 */
import { z } from "zod";

export const DecisionReasonClassSchema = z.enum([
  "DATA_STALE",
  "DATA_MISSING",
  "DATA_DISAGREEMENT",
  "SIGNAL_REJECTED",
  "RISK_BLOCKED",
  "EXECUTION_FAILED",
  "SUCCESS",
  "NO_TRADE",
]);

export type DecisionReasonClass = z.infer<typeof DecisionReasonClassSchema>;

const STALE_HINT = /stale|freshness|DATA_STALE/i;
const MISSING_HINT = /missing|invalid|DATA_MISSING/i;
const DISAGREE_HINT = /disagreement|divergence|degraded|DATA_DISAGREEMENT/i;
const SIGNAL_HINT = /signal|SIGNAL_|DATA_QUALITY|completeness/i;
const RISK_HINT = /risk|chaos|daily loss|Chaos gate/i;
const EXEC_HINT = /execution|verify|RPC|verification|IDEMPOTENCY/i;

/**
 * Derive reason class from terminal stage and free-text blocked reason (deterministic heuristics).
 */
export function resolveDecisionReasonClass(input: {
  blocked: boolean;
  terminalStage: import("./decision-envelope.js").DecisionStage;
  blockedReason?: string;
  tradeCompleted: boolean;
}): DecisionReasonClass {
  if (!input.blocked) {
    return input.tradeCompleted ? "SUCCESS" : "NO_TRADE";
  }

  const r = input.blockedReason ?? "";
  const stage = input.terminalStage;

  if (stage === "ingest") {
    if (STALE_HINT.test(r) || r.includes("freshness")) return "DATA_STALE";
    if (MISSING_HINT.test(r)) return "DATA_MISSING";
    if (DISAGREE_HINT.test(r)) return "DATA_DISAGREEMENT";
    return "DATA_MISSING";
  }

  if (stage === "signal") {
    if (SIGNAL_HINT.test(r) || r.includes("completeness")) return "SIGNAL_REJECTED";
    return "SIGNAL_REJECTED";
  }

  if (stage === "reasoning") {
    return "SIGNAL_REJECTED";
  }

  if (stage === "risk") {
    if (RISK_HINT.test(r)) return "RISK_BLOCKED";
    return "RISK_BLOCKED";
  }

  if (stage === "execute" || stage === "verify") {
    if (EXEC_HINT.test(r)) return "EXECUTION_FAILED";
    return "EXECUTION_FAILED";
  }

  if (EXEC_HINT.test(r)) return "EXECUTION_FAILED";
  if (RISK_HINT.test(r)) return "RISK_BLOCKED";
  return "RISK_BLOCKED";
}
