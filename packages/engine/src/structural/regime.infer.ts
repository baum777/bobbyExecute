import type { LiquidityRegime, VolatilityRegime } from "@bobby/contracts";

export function inferLiquidityRegime(
  structuralScore: number,
  liquidityUsd: number | null,
): LiquidityRegime {
  if (structuralScore >= 70 && (liquidityUsd ?? 0) > 1_000_000) {
    return "Structural";
  }
  if (structuralScore >= 45) {
    return "Healthy";
  }
  if (structuralScore >= 20) {
    return "Thin";
  }
  return "Fragile";
}

export function inferVolatilityRegime(
  priceChange24hPct: number | null,
): VolatilityRegime {
  if (priceChange24hPct === null) return null;
  const abs = Math.abs(priceChange24hPct);
  if (abs < 5) return "Low";
  if (abs < 20) return "Medium";
  return "High";
}
