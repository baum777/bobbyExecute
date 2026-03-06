/**
 * Wave 5 P0: MEV / Sandwich detection signal.
 * Detects sandwich attack pattern: front-run + victim + back-run.
 * Input from simulated mempool data or execution verification.
 */
import type { ChaosResult } from "../contracts/chaos-result.js";

export interface MevSandwichInput {
  /** Simulated: front-run tx detected before victim tx */
  frontRunDetected?: boolean;
  /** Simulated: back-run tx detected after victim tx */
  backRunDetected?: boolean;
  /** Actual slippage exceeded max allowed (from execution verification) */
  slippageExceeded?: boolean;
  /** Simulated: similar swap txs in same block (sandwich pattern) */
  similarTxInSameBlock?: number;
  /** Price impact anomaly (e.g. unexpected >5% impact) */
  priceImpactAnomaly?: number;
}

/**
 * Detects sandwich attack. Hit when:
 * - Both front-run and back-run detected (classic sandwich), or
 * - Slippage exceeded + (front-run or back-run), or
 * - Multiple similar txs in same block + slippage
 */
export function detectMevSandwich(input: MevSandwichInput): ChaosResult {
  const frontRun = input.frontRunDetected ?? false;
  const backRun = input.backRunDetected ?? false;
  const slippage = input.slippageExceeded ?? false;
  const similarCount = input.similarTxInSameBlock ?? 0;
  const impactAnomaly = input.priceImpactAnomaly ?? 0;

  const sandwichPattern = frontRun && backRun;
  const slippageWithRun = slippage && (frontRun || backRun);
  const clusterSandwich = similarCount >= 2 && (slippage || impactAnomaly > 0.05);

  if (sandwichPattern) {
    return {
      hit: true,
      severity: 0.9,
      reasonCode: "MEV_SANDWICH",
      evidence: { frontRun, backRun, pattern: "front+back" },
    };
  }

  if (slippageWithRun) {
    return {
      hit: true,
      severity: 0.7,
      reasonCode: "MEV_SLIPPAGE_WITH_RUN",
      evidence: { frontRun, backRun, slippageExceeded: slippage },
    };
  }

  if (clusterSandwich) {
    return {
      hit: true,
      severity: 0.6,
      reasonCode: "MEV_CLUSTER_SANDWICH",
      evidence: { similarTxInSameBlock: similarCount, slippage, priceImpactAnomaly: impactAnomaly },
    };
  }

  return { hit: false, severity: 0 };
}
