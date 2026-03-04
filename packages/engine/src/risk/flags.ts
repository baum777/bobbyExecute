import type { DivergenceV1, NormalizedTokenV1, SocialIntelV1, StructuralMetricsV1 } from "@reducedmode/contracts";

export function deriveRiskFlags(input: {
  normalized: NormalizedTokenV1;
  structural: StructuralMetricsV1;
  social: SocialIntelV1;
  divergence: DivergenceV1;
  discrepancyThreshold: number;
}): string[] {
  const flags: string[] = [];

  if ((input.normalized.quality.relative_delta_price ?? 0) >= input.discrepancyThreshold) {
    flags.push("cross_source_anomaly");
  }
  if (input.normalized.quality.cross_source_confidence_score < 65) {
    flags.push("low_cross_source_confidence");
  }
  if (input.structural.liquidity_regime === "fragile") {
    flags.push("fragile_liquidity_regime");
  }
  if (input.social.data_status === "data_insufficient") {
    flags.push("social_data_insufficient");
  }
  if (input.divergence.signal_count >= 2) {
    flags.push("divergence_override_fragile_expansion");
  }

  return flags;
}
