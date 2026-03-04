import { RiskBreakdownV1Schema, type DivergenceV1, type NormalizedTokenV1, type RiskBreakdownV1, type SocialIntelV1, type StructuralMetricsV1 } from "@reducedmode/contracts";
import { deriveRiskFlags } from "./flags.js";
import { selectDynamicWeightProfile } from "./risk.weights.js";

export function computeRiskBreakdown(input: {
  normalized: NormalizedTokenV1;
  structural: StructuralMetricsV1;
  social: SocialIntelV1;
  divergence: DivergenceV1;
  discrepancyThreshold: number;
}): RiskBreakdownV1 {
  const structuralRisk = clamp(100 - input.structural.structural_score, 0, 100);
  const socialRisk = computeSocialRisk(input.social);
  const qualityRisk = clamp(100 - input.normalized.quality.cross_source_confidence_score, 0, 100);
  const divergenceRisk = clamp(
    input.divergence.signal_count * 22 + input.normalized.quality.discrepancy_rate * 35,
    0,
    100,
  );

  const weightProfile = selectDynamicWeightProfile({
    structural: input.structural,
    social: input.social,
    divergence: input.divergence,
  });

  const overallRisk =
    structuralRisk * weightProfile.weights.structural +
    socialRisk * weightProfile.weights.social +
    qualityRisk * weightProfile.weights.quality +
    divergenceRisk * weightProfile.weights.divergence;

  const flags = deriveRiskFlags({
    normalized: input.normalized,
    structural: input.structural,
    social: input.social,
    divergence: input.divergence,
    discrepancyThreshold: input.discrepancyThreshold,
  });

  return RiskBreakdownV1Schema.parse({
    structural_risk_score: structuralRisk,
    social_risk_score: socialRisk,
    quality_risk_score: qualityRisk,
    divergence_risk_score: divergenceRisk,
    overall_risk_score: clamp(overallRisk, 0, 100),
    flags,
    weight_profile: weightProfile,
  });
}

function computeSocialRisk(social: SocialIntelV1): number {
  if (social.data_status === "disabled") return 50;
  if (social.data_status === "data_insufficient") return 55;
  return clamp(100 - (social.weighted_narrative_score ?? 50), 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
