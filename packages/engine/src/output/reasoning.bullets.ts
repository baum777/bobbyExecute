import type { ReasoningBullet, NormalizedTokenV1, StructuralMetricsV1, RiskBreakdownV1, DivergenceV1, EcosystemClassV1 } from "@bobby/contracts";

export function buildReasoningBullets(
  normalized: NormalizedTokenV1,
  structural: StructuralMetricsV1,
  risk: RiskBreakdownV1,
  divergence: DivergenceV1,
  ecosystem: EcosystemClassV1 | null,
): ReasoningBullet {
  const dq = normalized.data_quality;
  const discSummary = dq.discrepancies.length > 0
    ? `${dq.discrepancies.length} discrepancies detected`
    : "no discrepancies";

  const bullets: [string, string, string] = [
    `data_quality: completeness=${dq.completeness}%, cross_source_confidence=${dq.cross_source_confidence}, ${discSummary}`,
    `structure: structural_score=${structural.structural_score}, liquidity_regime=${structural.liquidity_regime}, volume_to_liquidity_ratio=${structural.v2l_ratio}`,
    `risk_divergence: overall_risk=${risk.overall_risk_score}, divergence_count=${divergence.divergence_count}, ecosystem=${ecosystem?.market_structure ?? "N/A"}`,
  ];

  return { token: normalized.symbol, bullets: [...bullets] };
}
