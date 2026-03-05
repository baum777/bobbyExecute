import { describe, it, expect } from "vitest";
import { buildReasoningBullets } from "../src/output/reasoning.bullets.js";
import type { NormalizedTokenV1, StructuralMetricsV1, RiskBreakdownV1, DivergenceV1 } from "@bobby/contracts";

function makeNorm(): NormalizedTokenV1 {
  return {
    contract_address: "CA1111111111111111111111111111111111", symbol: "TOK", name: "Token",
    price_usd: 1, volume_24h: 1000, liquidity_usd: 5000, fdv: 100000, market_cap_usd: 50000, price_change_24h_pct: 5,
    source_snapshots: [],
    data_quality: { completeness: 85, freshness: 90, cross_source_confidence: 0.8, discrepancy_rate: 0.1, sources_used: ["dexscreener"], discrepancies: [] },
  };
}

describe("buildReasoningBullets", () => {
  it("produces exactly 3 bullets", () => {
    const structural: StructuralMetricsV1 = { contract_address: "CA", log_liquidity: 5, log_volume: 4, v2l_ratio: 0.5, structural_score: 55, liquidity_regime: "Healthy", volatility_regime: "Medium" };
    const risk: RiskBreakdownV1 = { contract_address: "CA", overall_risk_score: 40, structural_component: 10, social_component: 0, divergence_component: 5, data_quality_component: 25, weight_profile: { profile: "balanced", structural_weight: 0.25, social_weight: 0, divergence_weight: 0.2, data_quality_weight: 0.55 }, flags: ["thin_liquidity"] };
    const divergence: DivergenceV1 = { contract_address: "CA", divergences: [], divergence_count: 1, classification_override: null };

    const result = buildReasoningBullets(makeNorm(), structural, risk, divergence, { market_structure: "Stable", narrative_dominance: "Mixed", liquidity_regime: "Healthy" });
    expect(result.bullets).toHaveLength(3);
  });

  it("bullet 1 references completeness and cross_source_confidence", () => {
    const structural: StructuralMetricsV1 = { contract_address: "CA", log_liquidity: 5, log_volume: 4, v2l_ratio: 0.5, structural_score: 55, liquidity_regime: "Healthy", volatility_regime: "Medium" };
    const risk: RiskBreakdownV1 = { contract_address: "CA", overall_risk_score: 40, structural_component: 10, social_component: 0, divergence_component: 5, data_quality_component: 25, weight_profile: { profile: "balanced", structural_weight: 0.25, social_weight: 0, divergence_weight: 0.2, data_quality_weight: 0.55 }, flags: [] };
    const divergence: DivergenceV1 = { contract_address: "CA", divergences: [], divergence_count: 0, classification_override: null };

    const result = buildReasoningBullets(makeNorm(), structural, risk, divergence, null);
    expect(result.bullets[0]).toContain("completeness=");
    expect(result.bullets[0]).toContain("cross_source_confidence=");
  });

  it("bullet 2 references structural_score and liquidity_regime", () => {
    const structural: StructuralMetricsV1 = { contract_address: "CA", log_liquidity: 5, log_volume: 4, v2l_ratio: 0.5, structural_score: 55, liquidity_regime: "Healthy", volatility_regime: "Medium" };
    const risk: RiskBreakdownV1 = { contract_address: "CA", overall_risk_score: 40, structural_component: 10, social_component: 0, divergence_component: 5, data_quality_component: 25, weight_profile: { profile: "balanced", structural_weight: 0.25, social_weight: 0, divergence_weight: 0.2, data_quality_weight: 0.55 }, flags: [] };
    const divergence: DivergenceV1 = { contract_address: "CA", divergences: [], divergence_count: 0, classification_override: null };

    const result = buildReasoningBullets(makeNorm(), structural, risk, divergence, null);
    expect(result.bullets[1]).toContain("structural_score=");
    expect(result.bullets[1]).toContain("liquidity_regime=");
    expect(result.bullets[1]).toContain("volume_to_liquidity_ratio=");
  });

  it("bullet 3 references overall_risk and divergence_count", () => {
    const structural: StructuralMetricsV1 = { contract_address: "CA", log_liquidity: 5, log_volume: 4, v2l_ratio: 0.5, structural_score: 55, liquidity_regime: "Healthy", volatility_regime: "Medium" };
    const risk: RiskBreakdownV1 = { contract_address: "CA", overall_risk_score: 40, structural_component: 10, social_component: 0, divergence_component: 5, data_quality_component: 25, weight_profile: { profile: "balanced", structural_weight: 0.25, social_weight: 0, divergence_weight: 0.2, data_quality_weight: 0.55 }, flags: [] };
    const divergence: DivergenceV1 = { contract_address: "CA", divergences: [], divergence_count: 2, classification_override: "Fragile Expansion" };

    const result = buildReasoningBullets(makeNorm(), structural, risk, divergence, { market_structure: "Fragile Expansion", narrative_dominance: "Mixed", liquidity_regime: "Healthy" });
    expect(result.bullets[2]).toContain("overall_risk=");
    expect(result.bullets[2]).toContain("divergence_count=");
    expect(result.bullets[2]).toContain("ecosystem=");
  });
});
