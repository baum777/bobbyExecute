import type {
  NormalizedTokenV1,
  StructuralMetricsV1,
  SocialIntelV1,
  RiskBreakdownV1,
  DivergenceV1,
  TokenAnalysisV1,
  ReasoningBullet,
} from "@bobby/contracts";

export function buildTokenAnalysis(
  normalized: NormalizedTokenV1,
  structural: StructuralMetricsV1,
  social: SocialIntelV1,
  risk: RiskBreakdownV1,
  divergence: DivergenceV1,
): TokenAnalysisV1 {
  return {
    normalized,
    structural,
    social,
    risk,
    divergence,
    reasoning: buildReasoningBullets(normalized, structural, risk, divergence),
  };
}

function buildReasoningBullets(
  normalized: NormalizedTokenV1,
  structural: StructuralMetricsV1,
  risk: RiskBreakdownV1,
  divergence: DivergenceV1,
): ReasoningBullet {
  const bullets: string[] = [];

  bullets.push(
    `structural_score=${structural.structural_score}, liquidity_regime=${structural.liquidity_regime}, v2l_ratio=${structural.v2l_ratio}`,
  );

  bullets.push(
    `overall_risk_score=${risk.overall_risk_score}, flags=[${risk.flags.join(",")}], weight_profile=${risk.weight_profile.profile}`,
  );

  bullets.push(
    `data_completeness=${normalized.data_quality.completeness}%, cross_source_confidence=${normalized.data_quality.cross_source_confidence}, divergence_count=${divergence.divergence_count}`,
  );

  return {
    token: normalized.symbol,
    bullets,
  };
}
