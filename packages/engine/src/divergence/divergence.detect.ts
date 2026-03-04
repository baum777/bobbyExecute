import { DivergenceV1Schema, type DivergenceV1, type NormalizedTokenV1, type SocialIntelV1, type StructuralMetricsV1 } from "@reducedmode/contracts";

export function detectDivergence(input: {
  normalized: NormalizedTokenV1;
  structural: StructuralMetricsV1;
  social: SocialIntelV1;
  discrepancyThreshold: number;
}): DivergenceV1 {
  const signals: DivergenceV1["signals"] = [];

  const delta = input.normalized.quality.relative_delta_price ?? 0;
  if (delta >= input.discrepancyThreshold) {
    signals.push("cross_source_price_delta");
  }

  const v2l = input.structural.v2l_ratio ?? 0;
  if (v2l > 4 || v2l < 0.1) {
    signals.push("volume_liquidity_mismatch");
  }

  if (
    input.social.data_status === "ok" &&
    (input.social.weighted_narrative_score ?? 0) > 70 &&
    input.structural.structural_score < 45
  ) {
    signals.push("structural_vs_narrative_gap");
  }

  if (input.normalized.quality.cross_source_confidence_score < 60) {
    signals.push("confidence_drop");
  }

  const hasOverride = signals.length >= 2;
  return DivergenceV1Schema.parse({
    signals,
    signal_count: signals.length,
    has_override: hasOverride,
    override_classification: hasOverride ? "Fragile Expansion" : undefined,
  });
}
