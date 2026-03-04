import type { DataQualityV1, StructuralMetricsV1, DivergenceV1 } from "@bobby/contracts";

export function computeRiskFlags(
  dataQuality: DataQualityV1,
  structural: StructuralMetricsV1,
  divergence: DivergenceV1,
): string[] {
  const flags: string[] = [];

  if (dataQuality.cross_source_confidence < 0.5) {
    flags.push("low_cross_source_confidence");
  }

  if (dataQuality.discrepancy_rate > 0.3) {
    flags.push("cross_source_anomaly");
  }

  if (structural.liquidity_regime === "Fragile") {
    flags.push("fragile_liquidity");
  }

  if (structural.liquidity_regime === "Thin") {
    flags.push("thin_liquidity");
  }

  if (divergence.divergence_count >= 2) {
    flags.push("multi_divergence");
  }

  if (structural.v2l_ratio > 5) {
    flags.push("high_volume_to_liquidity");
  }

  if (dataQuality.completeness < 50) {
    flags.push("low_data_completeness");
  }

  return flags;
}
