import type { RiskBreakdownV1, NormalizedTokenV1, StructuralMetricsV1, SocialIntelV1, DivergenceV1 } from "@bobby/contracts";
import { selectProfile, getProfileWeights, selectWeightProfile } from "./risk.weights.js";
import { computeRiskFlags } from "./flags.js";

export function computeRisk(
  token: NormalizedTokenV1,
  structural: StructuralMetricsV1,
  social: SocialIntelV1,
  divergence: DivergenceV1,
): RiskBreakdownV1 {
  const profile = selectProfile(structural, social, token.data_quality.discrepancy_rate);
  const weights = getProfileWeights(profile);
  const weightProfile = selectWeightProfile(structural, social, token.data_quality.discrepancy_rate);

  const liquidityRisk = (100 - structural.structural_score) * weights.liquidity;
  const manipulationRisk = Math.min(divergence.divergence_count * 25, 100) * weights.manipulation;
  const exhaustionRisk = (100 - token.data_quality.completeness) * weights.exhaustion;
  const structuralRisk = computeStructuralRiskComponent(structural) * weights.structural;

  const overall = clamp(liquidityRisk + manipulationRisk + exhaustionRisk + structuralRisk, 0, 100);
  const flags = computeRiskFlags(token.data_quality, structural, divergence);

  return {
    contract_address: token.contract_address,
    overall_risk_score: round(overall, 2),
    structural_component: round(structuralRisk, 4),
    social_component: 0,
    divergence_component: round(manipulationRisk, 4),
    data_quality_component: round(exhaustionRisk + liquidityRisk, 4),
    weight_profile: weightProfile,
    flags,
  };
}

function computeStructuralRiskComponent(structural: StructuralMetricsV1): number {
  let base = 100 - structural.structural_score;
  if (structural.v2l_ratio > 5) base = Math.min(100, base + 15);
  if (structural.liquidity_regime === "Fragile") base = Math.min(100, base + 10);
  return base;
}

function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }
function round(v: number, d: number): number { const f = Math.pow(10, d); return Math.round(v * f) / f; }
