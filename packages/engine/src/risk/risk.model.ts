import type {
  RiskBreakdownV1,
  NormalizedTokenV1,
  StructuralMetricsV1,
  SocialIntelV1,
  DivergenceV1,
} from "@bobby/contracts";
import { selectWeightProfile } from "./risk.weights.js";
import { computeRiskFlags } from "./flags.js";

export function computeRisk(
  token: NormalizedTokenV1,
  structural: StructuralMetricsV1,
  social: SocialIntelV1,
  divergence: DivergenceV1,
): RiskBreakdownV1 {
  const weightProfile = selectWeightProfile(social, token.data_quality.discrepancy_rate);

  const structuralComponent = (100 - structural.structural_score) * weightProfile.structural_weight;

  let socialComponent = 0;
  if (social.data_status === "ok" && social.sentiment_score !== null) {
    socialComponent = ((1 - social.sentiment_score) / 2) * 100 * weightProfile.social_weight;
  }

  const divergenceComponent =
    Math.min(divergence.divergence_count * 25, 100) * weightProfile.divergence_weight;

  const dataQualityComponent =
    (100 - token.data_quality.completeness) * weightProfile.data_quality_weight;

  const overall = clamp(
    structuralComponent + socialComponent + divergenceComponent + dataQualityComponent,
    0,
    100,
  );

  const flags = computeRiskFlags(token.data_quality, structural, divergence);

  return {
    contract_address: token.contract_address,
    overall_risk_score: round(overall, 2),
    structural_component: round(structuralComponent, 4),
    social_component: round(socialComponent, 4),
    divergence_component: round(divergenceComponent, 4),
    data_quality_component: round(dataQualityComponent, 4),
    weight_profile: weightProfile,
    flags,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}
