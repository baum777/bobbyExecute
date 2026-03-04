import { describe, it, expect } from "vitest";
import { computeStructuralMetrics } from "../src/structural/structural.metrics.js";
import { inferLiquidityRegime, inferVolatilityRegime } from "../src/structural/regime.infer.js";
import type { NormalizedTokenV1 } from "@bobby/contracts";

function makeNormalized(overrides: Partial<NormalizedTokenV1> = {}): NormalizedTokenV1 {
  return {
    contract_address: "So11111111111111111111111111111111",
    symbol: "SOL",
    name: "Solana",
    price_usd: 150,
    volume_24h: 1_000_000,
    liquidity_usd: 5_000_000,
    fdv: 50_000_000_000,
    market_cap_usd: 30_000_000_000,
    price_change_24h_pct: 3.5,
    source_snapshots: [],
    data_quality: {
      completeness: 100,
      freshness: 95,
      cross_source_confidence: 0.9,
      discrepancy_rate: 0.05,
      sources_used: ["dexscreener"],
      discrepancies: [],
    },
    ...overrides,
  };
}

describe("computeStructuralMetrics", () => {
  it("clamps structural_score between 0 and 100", () => {
    const high = makeNormalized({ liquidity_usd: 100_000_000, volume_24h: 50_000_000 });
    const metrics = computeStructuralMetrics(high);
    expect(metrics.structural_score).toBeGreaterThanOrEqual(0);
    expect(metrics.structural_score).toBeLessThanOrEqual(100);
  });

  it("returns 0 score for null values", () => {
    const zero = makeNormalized({ liquidity_usd: null, volume_24h: null });
    const metrics = computeStructuralMetrics(zero);
    expect(metrics.structural_score).toBe(0);
    expect(metrics.log_liquidity).toBe(0);
    expect(metrics.log_volume).toBe(0);
  });

  it("computes v2l_ratio correctly", () => {
    const token = makeNormalized({ volume_24h: 2_000_000, liquidity_usd: 1_000_000 });
    const metrics = computeStructuralMetrics(token);
    expect(metrics.v2l_ratio).toBe(2);
  });
});

describe("inferLiquidityRegime", () => {
  it("returns Structural for high score and high liquidity", () => {
    expect(inferLiquidityRegime(75, 5_000_000)).toBe("Structural");
  });

  it("returns Healthy for medium score", () => {
    expect(inferLiquidityRegime(50, 500_000)).toBe("Healthy");
  });

  it("returns Thin for low score", () => {
    expect(inferLiquidityRegime(25, 100_000)).toBe("Thin");
  });

  it("returns Fragile for very low score", () => {
    expect(inferLiquidityRegime(10, 10_000)).toBe("Fragile");
  });
});

describe("inferVolatilityRegime", () => {
  it("returns null for null input", () => {
    expect(inferVolatilityRegime(null)).toBeNull();
  });

  it("returns Low for small changes", () => {
    expect(inferVolatilityRegime(2)).toBe("Low");
  });

  it("returns Medium for moderate changes", () => {
    expect(inferVolatilityRegime(15)).toBe("Medium");
  });

  it("returns High for large changes", () => {
    expect(inferVolatilityRegime(30)).toBe("High");
  });
});
