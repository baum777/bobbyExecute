import { StructuralMetricsV1Schema, type NormalizedTokenV1, type StructuralMetricsV1 } from "@reducedmode/contracts";
import { inferLiquidityRegime, inferVolatilityRegime } from "./regime.infer.js";

export function buildStructuralMetrics(token: NormalizedTokenV1): StructuralMetricsV1 {
  const liquidity = token.merged.liquidity_usd;
  const volume = token.merged.volume_24h_usd;
  const liquidityNorm = logNormalize(liquidity);
  const volumeNorm = logNormalize(volume);
  const v2lRatio = liquidity && liquidity > 0 && volume !== null ? volume / liquidity : null;

  const rawScore = (liquidityNorm * 0.6 + volumeNorm * 0.4) * 20;
  const structuralScore = clamp(rawScore, 0, 100);
  const liquidityRegime = inferLiquidityRegime(structuralScore, liquidity, v2lRatio);
  const volatilityRegime = inferVolatilityRegime(token.quality.relative_delta_price);

  return StructuralMetricsV1Schema.parse({
    liquidity_norm: liquidityNorm,
    volume_norm: volumeNorm,
    v2l_ratio: v2lRatio,
    structural_score: structuralScore,
    liquidity_regime: liquidityRegime,
    volatility_regime: volatilityRegime,
    notes: [
      `liquidity_norm=${liquidityNorm.toFixed(3)}`,
      `volume_norm=${volumeNorm.toFixed(3)}`,
      `v2l_ratio=${v2lRatio === null ? "null" : v2lRatio.toFixed(3)}`,
    ],
  });
}

function logNormalize(value: number | null): number {
  if (value === null || value <= 0) return 0;
  return Math.log10(value + 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
