import type { NormalizedTokenV1, StructuralMetricsV1 } from "@bobby/contracts";
import { inferLiquidityRegime, inferVolatilityRegime } from "./regime.infer.js";

export function computeStructuralMetrics(token: NormalizedTokenV1): StructuralMetricsV1 {
  const logLiquidity = safeLog(token.liquidity_usd);
  const logVolume = safeLog(token.volume_24h);
  const v2lRatio = computeV2L(token.volume_24h, token.liquidity_usd);

  const structuralScore = computeStructuralScore(logLiquidity, logVolume, v2lRatio);
  const liquidityRegime = inferLiquidityRegime(structuralScore, token.liquidity_usd);
  const volatilityRegime = inferVolatilityRegime(token.price_change_24h_pct);

  return {
    contract_address: token.contract_address,
    log_liquidity: round(logLiquidity, 4),
    log_volume: round(logVolume, 4),
    v2l_ratio: round(v2lRatio, 4),
    structural_score: round(structuralScore, 2),
    liquidity_regime: liquidityRegime,
    volatility_regime: volatilityRegime,
  };
}

function safeLog(value: number | null): number {
  if (value === null || value <= 0) return 0;
  return Math.log10(value);
}

function computeV2L(volume: number | null, liquidity: number | null): number {
  if (!volume || !liquidity || liquidity === 0) return 0;
  return volume / liquidity;
}

function computeStructuralScore(
  logLiq: number,
  logVol: number,
  v2l: number,
): number {
  const liqComponent = Math.min(logLiq / 8, 1) * 40;
  const volComponent = Math.min(logVol / 8, 1) * 30;
  const v2lComponent = Math.min(v2l / 2, 1) * 30;
  const raw = liqComponent + volComponent + v2lComponent;
  return clamp(raw, 0, 100);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}
