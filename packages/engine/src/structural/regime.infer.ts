import type { LiquidityRegimeV1, VolatilityRegimeV1 } from "@reducedmode/contracts";

export function inferLiquidityRegime(
  structuralScore: number,
  liquidityUsd: number | null,
  v2lRatio: number | null,
): LiquidityRegimeV1 {
  if (liquidityUsd === null || liquidityUsd <= 0) return "fragile";
  if (structuralScore >= 75 && liquidityUsd >= 100_000) return "structural";
  if (structuralScore >= 55 && liquidityUsd >= 40_000) return "healthy";
  if (v2lRatio !== null && v2lRatio > 4) return "fragile";
  if (structuralScore >= 35) return "thin";
  return "fragile";
}

export function inferVolatilityRegime(relativeDeltaPrice: number | null): VolatilityRegimeV1 {
  if (relativeDeltaPrice === null) return "unknown";
  if (relativeDeltaPrice < 0.08) return "low";
  if (relativeDeltaPrice < 0.2) return "medium";
  return "high";
}
