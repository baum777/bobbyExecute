import { describe, it, expect } from "vitest";
import { selectWeightProfile } from "../src/risk/risk.weights.js";
import { computeRisk } from "../src/risk/risk.model.js";
import { computeRiskFlags } from "../src/risk/flags.js";
import type { NormalizedTokenV1, StructuralMetricsV1, SocialIntelV1, DivergenceV1, DataQualityV1 } from "@bobby/contracts";

function makeSocial(overrides: Partial<SocialIntelV1> = {}): SocialIntelV1 {
  return {
    contract_address: "CA1111111111111111111111111111111111",
    data_status: "disabled",
    narrative: "Unknown",
    sentiment_score: null,
    mention_count_24h: null,
    weighted_narrative_score: null,
    ...overrides,
  };
}

function makeDivergence(count: number): DivergenceV1 {
  return {
    contract_address: "CA1111111111111111111111111111111111",
    divergences: [],
    divergence_count: count,
    classification_override: count >= 2 ? "Fragile Expansion" : null,
  };
}

function makeDataQuality(overrides: Partial<DataQualityV1> = {}): DataQualityV1 {
  return {
    completeness: 90,
    freshness: 95,
    cross_source_confidence: 0.85,
    discrepancy_rate: 0.05,
    sources_used: ["dexscreener", "dexpaprika"],
    discrepancies: [],
    ...overrides,
  };
}

function makeStructural(overrides: Partial<StructuralMetricsV1> = {}): StructuralMetricsV1 {
  return {
    contract_address: "CA1111111111111111111111111111111111",
    log_liquidity: 6.5,
    log_volume: 5.8,
    v2l_ratio: 0.5,
    structural_score: 65,
    liquidity_regime: "Healthy",
    volatility_regime: "Medium",
    ...overrides,
  };
}

describe("selectWeightProfile", () => {
  it("selects structural_heavy when social disabled", () => {
    const profile = selectWeightProfile(makeSocial(), 0.1);
    expect(profile.profile).toBe("structural_heavy");
    expect(profile.social_weight).toBe(0);
  });

  it("selects risk_averse when high discrepancy rate", () => {
    const profile = selectWeightProfile(makeSocial(), 0.4);
    expect(profile.profile).toBe("risk_averse");
  });

  it("redistributes social weight when social disabled", () => {
    const profile = selectWeightProfile(makeSocial({ data_status: "disabled" }), 0.1);
    expect(profile.social_weight).toBe(0);
    expect(profile.structural_weight).toBeGreaterThan(0.35);
  });
});

describe("computeRisk", () => {
  it("produces risk score in 0..100 range", () => {
    const normalized: NormalizedTokenV1 = {
      contract_address: "CA1111111111111111111111111111111111",
      symbol: "TOK",
      name: "Token",
      price_usd: 1.0,
      volume_24h: 1000,
      liquidity_usd: 5000,
      fdv: 100000,
      market_cap_usd: 50000,
      price_change_24h_pct: 5.0,
      source_snapshots: [],
      data_quality: makeDataQuality(),
    };

    const risk = computeRisk(
      normalized,
      makeStructural(),
      makeSocial(),
      makeDivergence(0),
    );

    expect(risk.overall_risk_score).toBeGreaterThanOrEqual(0);
    expect(risk.overall_risk_score).toBeLessThanOrEqual(100);
  });

  it("increases risk with more divergences", () => {
    const normalized: NormalizedTokenV1 = {
      contract_address: "CA1111111111111111111111111111111111",
      symbol: "TOK",
      name: "Token",
      price_usd: 1.0,
      volume_24h: 1000,
      liquidity_usd: 5000,
      fdv: 100000,
      market_cap_usd: 50000,
      price_change_24h_pct: 5.0,
      source_snapshots: [],
      data_quality: makeDataQuality(),
    };

    const riskLow = computeRisk(normalized, makeStructural(), makeSocial(), makeDivergence(0));
    const riskHigh = computeRisk(normalized, makeStructural(), makeSocial(), makeDivergence(3));

    expect(riskHigh.overall_risk_score).toBeGreaterThan(riskLow.overall_risk_score);
  });
});

describe("computeRiskFlags", () => {
  it("flags multi_divergence when >= 2", () => {
    const flags = computeRiskFlags(
      makeDataQuality(),
      makeStructural(),
      makeDivergence(2),
    );
    expect(flags).toContain("multi_divergence");
  });

  it("flags fragile_liquidity", () => {
    const flags = computeRiskFlags(
      makeDataQuality(),
      makeStructural({ liquidity_regime: "Fragile" }),
      makeDivergence(0),
    );
    expect(flags).toContain("fragile_liquidity");
  });

  it("flags cross_source_anomaly for high discrepancy", () => {
    const flags = computeRiskFlags(
      makeDataQuality({ discrepancy_rate: 0.4 }),
      makeStructural(),
      makeDivergence(0),
    );
    expect(flags).toContain("cross_source_anomaly");
  });
});
