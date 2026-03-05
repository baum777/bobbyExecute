import { describe, it, expect } from "vitest";
import { relativeDelta, computeDataQuality, computeCompletenessScore } from "../src/normalize/data.quality.js";
import { normalizeToken } from "../src/normalize/normalizer.js";
import type { TokenSourceSnapshotV1 } from "@bobby/contracts";

function makeSnap(source: "dexscreener" | "dexpaprika", overrides: Partial<TokenSourceSnapshotV1> = {}): TokenSourceSnapshotV1 {
  return {
    token_ref: { symbol: "SOL", name: "Solana", contract_address: "So11111111111111111111111111111111", source },
    source, price_usd: 150.0, volume_24h: 1_000_000, liquidity_usd: 5_000_000,
    fdv: 50_000_000_000, market_cap_usd: 30_000_000_000, price_change_24h_pct: 3.5,
    fetched_at: new Date().toISOString(), ...overrides,
  };
}

describe("relativeDelta", () => {
  it("returns 0 for identical values", () => { expect(relativeDelta(100, 100)).toBe(0); });
  it("returns correct delta", () => { expect(relativeDelta(100, 80)).toBeCloseTo(0.2, 4); });
  it("returns 0 when both zero", () => { expect(relativeDelta(0, 0)).toBe(0); });
});

describe("computeCompletenessScore", () => {
  it("returns presentRatio*90 + sourceBonus for multi-source", () => {
    const snaps = [makeSnap("dexscreener"), makeSnap("dexpaprika")];
    const score = computeCompletenessScore(snaps, 2);
    expect(score).toBe(100);
  });

  it("returns presentRatio*90 without bonus for single source", () => {
    const snaps = [makeSnap("dexscreener")];
    const score = computeCompletenessScore(snaps, 1);
    expect(score).toBe(90);
  });

  it("reduces score for null fields", () => {
    const snaps = [makeSnap("dexscreener", { price_usd: null, volume_24h: null })];
    const score = computeCompletenessScore(snaps, 1);
    expect(score).toBeLessThan(90);
  });
});

describe("computeDataQuality", () => {
  it("detects discrepancy above threshold", () => {
    const snaps = [makeSnap("dexscreener", { price_usd: 150 }), makeSnap("dexpaprika", { price_usd: 100 })];
    const q = computeDataQuality(snaps, 0.20);
    expect(q.discrepancies.some((d) => d.field === "price_usd")).toBe(true);
  });

  it("includes multiple sources in sources_used", () => {
    const snaps = [makeSnap("dexscreener"), makeSnap("dexpaprika")];
    const q = computeDataQuality(snaps, 0.20);
    expect(q.sources_used).toContain("dexscreener");
    expect(q.sources_used).toContain("dexpaprika");
  });
});

describe("normalizeToken", () => {
  it("merges multiple sources by averaging", () => {
    const snaps = [makeSnap("dexscreener", { price_usd: 100 }), makeSnap("dexpaprika", { price_usd: 200 })];
    const norm = normalizeToken("So11111111111111111111111111111111", snaps, 0.20);
    expect(norm.price_usd).toBe(150);
    expect(norm.data_quality.sources_used).toHaveLength(2);
  });
});
