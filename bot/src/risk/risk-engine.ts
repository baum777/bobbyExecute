/**
 * Risk Engine - Aggregate risk, return structured RiskDecision.
 * Normalized planning package: deny with reason codes.
 */
import { aggregateRisk } from "../core/risk/global-risk.js";
import type { RiskBreakdown } from "../core/contracts/riskbreakdown.js";
import type { RiskDecision } from "../core/contracts/trade.js";

export interface RiskInput {
  traceId: string;
  timestamp: string;
  liquidity: number;
  socialManip: number;
  momentumExhaust: number;
  structuralWeakness: number;
}

const RISK_THRESHOLD = 0.7;

/**
 * Evaluate risk. Returns RiskDecision with allowed, checks, reasonCodes.
 */
export function runRiskEngine(input: RiskInput): RiskDecision {
  const breakdown: RiskBreakdown = aggregateRisk(input);

  const checks: Record<string, boolean> = {
    liquidity: breakdown.liquidity <= RISK_THRESHOLD,
    socialManip: breakdown.socialManip <= RISK_THRESHOLD,
    momentumExhaust: breakdown.momentumExhaust <= RISK_THRESHOLD,
    structuralWeakness: breakdown.structuralWeakness <= RISK_THRESHOLD,
  };

  const allPass = Object.values(checks).every(Boolean);
  const failedChecks = Object.entries(checks)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  return {
    allowed: allPass,
    checks,
    reason: allPass ? undefined : `Risk exceeded: ${failedChecks.join(", ")}`,
    blockReason: allPass ? undefined : `RISK_${failedChecks.join("_").toUpperCase()}`,
    severity: allPass ? undefined : failedChecks.length >= 3 ? "critical" : "high",
    reasonCodes: failedChecks.map((c) => `RISK_${c.toUpperCase()}`),
  };
}
