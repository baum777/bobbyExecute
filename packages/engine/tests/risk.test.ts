import { describe, it, expect } from "vitest";
import { selectProfile, selectWeightProfile } from "../src/risk/risk.weights.js";
import { computeRisk } from "../src/risk/risk.model.js";
import { computeRiskFlags } from "../src/risk/flags.js";
import type { NormalizedTokenV1, StructuralMetricsV1, SocialIntelV1, DivergenceV1, DataQualityV1 } from "@bobby/contracts";

function makeSocial(o: Partial<SocialIntelV1> = {}): SocialIntelV1 {
  return { contract_address: "CA1111111111111111111111111111111111", data_status: "disabled", narrative: "Unknown", sentiment_score: null, mention_count_24h: null, weighted_narrative_score: null, notes: "disabled_in_v1_lean_edge", ...o };
}
function makeDivergence(count: number): DivergenceV1 {
  return { contract_address: "CA1111111111111111111111111111111111", divergences: [], divergence_count: count, classification_override: count >= 2 ? "Fragile Expansion" : null };
}
function makeDQ(o: Partial<DataQualityV1> = {}): DataQualityV1 {
  return { completeness: 90, freshness: 95, cross_source_confidence: 0.85, discrepancy_rate: 0.05, sources_used: ["dexscreener", "dexpaprika"], discrepancies: [], ...o };
}
function makeStructural(o: Partial<StructuralMetricsV1> = {}): StructuralMetricsV1 {
  return { contract_address: "CA1111111111111111111111111111111111", log_liquidity: 6.5, log_volume: 5.8, v2l_ratio: 0.5, structural_score: 65, liquidity_regime: "Healthy", volatility_regime: "Medium", ...o };
}

describe("selectProfile", () => {
  it("selects thin_fragile for Fragile liquidity", () => {
    expect(selectProfile(makeStructural({ liquidity_regime: "Fragile" }), makeSocial(), 0.1)).toBe("thin_fragile");
  });
  it("selects volatile_expansion for high vol + low structural", () => {
    expect(selectProfile(makeStructural({ volatility_regime: "High", structural_score: 30 }), makeSocial(), 0.1)).toBe("volatile_expansion");
  });
  it("selects default otherwise", () => {
    expect(selectProfile(makeStructural(), makeSocial(), 0.1)).toBe("default");
  });
});

describe("selectWeightProfile", () => {
  it("returns zero social_weight when social disabled", () => {
    const wp = selectWeightProfile(makeStructural(), makeSocial(), 0.1);
    expect(wp.social_weight).toBe(0);
  });
});

describe("computeRisk", () => {
  it("produces risk score in 0..100 range", () => {
    const norm: NormalizedTokenV1 = { contract_address: "CA1111111111111111111111111111111111", symbol: "TOK", name: "Token", price_usd: 1, volume_24h: 1000, liquidity_usd: 5000, fdv: 100000, market_cap_usd: 50000, price_change_24h_pct: 5, source_snapshots: [], data_quality: makeDQ() };
    const risk = computeRisk(norm, makeStructural(), makeSocial(), makeDivergence(0));
    expect(risk.overall_risk_score).toBeGreaterThanOrEqual(0);
    expect(risk.overall_risk_score).toBeLessThanOrEqual(100);
  });
  it("increases risk with more divergences", () => {
    const norm: NormalizedTokenV1 = { contract_address: "CA1111111111111111111111111111111111", symbol: "TOK", name: "Token", price_usd: 1, volume_24h: 1000, liquidity_usd: 5000, fdv: 100000, market_cap_usd: 50000, price_change_24h_pct: 5, source_snapshots: [], data_quality: makeDQ() };
    const low = computeRisk(norm, makeStructural(), makeSocial(), makeDivergence(0));
    const high = computeRisk(norm, makeStructural(), makeSocial(), makeDivergence(3));
    expect(high.overall_risk_score).toBeGreaterThan(low.overall_risk_score);
  });
});

describe("computeRiskFlags", () => {
  it("flags multi_divergence when >= 2", () => {
    expect(computeRiskFlags(makeDQ(), makeStructural(), makeDivergence(2))).toContain("multi_divergence");
  });
  it("flags fragile_liquidity", () => {
    expect(computeRiskFlags(makeDQ(), makeStructural({ liquidity_regime: "Fragile" }), makeDivergence(0))).toContain("fragile_liquidity");
  });
});
