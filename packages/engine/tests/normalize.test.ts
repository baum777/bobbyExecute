import { describe, it, expect } from "vitest";
import { computeRelativeDelta, computeDataQuality } from "../src/normalize/crosssource.confidence.js";
import { normalizeToken } from "../src/normalize/normalizer.js";
import type { TokenSourceSnapshotV1 } from "@bobby/contracts";

function makeSnapshot(
  source: "dexscreener" | "dexpaprika",
  overrides: Partial<TokenSourceSnapshotV1> = {},
): TokenSourceSnapshotV1 {
  return {
    token_ref: {
      symbol: "SOL",
      name: "Solana",
      contract_address: "So11111111111111111111111111111111",
      source,
    },
    source,
    price_usd: 150.0,
    volume_24h: 1_000_000,
    liquidity_usd: 5_000_000,
    fdv: 50_000_000_000,
    market_cap_usd: 30_000_000_000,
    price_change_24h_pct: 3.5,
    fetched_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeRelativeDelta", () => {
  it("returns 0 for identical values", () => {
    expect(computeRelativeDelta(100, 100)).toBe(0);
  });

  it("returns correct delta", () => {
    expect(computeRelativeDelta(100, 80)).toBeCloseTo(0.2, 4);
  });

  it("returns 0 when both values are 0", () => {
    expect(computeRelativeDelta(0, 0)).toBe(0);
  });

  it("detects large discrepancy", () => {
    const delta = computeRelativeDelta(100, 50);
    expect(delta).toBeGreaterThan(0.2);
  });
});

describe("computeDataQuality", () => {
  it("detects discrepancy above threshold", () => {
    const snapshots: TokenSourceSnapshotV1[] = [
      makeSnapshot("dexscreener", { price_usd: 150 }),
      makeSnapshot("dexpaprika", { price_usd: 100 }),
    ];

    const quality = computeDataQuality(snapshots, 0.20);
    expect(quality.discrepancies.length).toBeGreaterThan(0);
    const priceDisc = quality.discrepancies.find((d) => d.field === "price_usd");
    expect(priceDisc).toBeDefined();
    expect(priceDisc!.relative_delta).toBeGreaterThan(0.20);
  });

  it("returns full completeness when all fields present", () => {
    const snapshots = [makeSnapshot("dexscreener")];
    const quality = computeDataQuality(snapshots, 0.20);
    expect(quality.completeness).toBe(100);
  });

  it("returns lower completeness with null fields", () => {
    const snapshots = [makeSnapshot("dexscreener", { price_usd: null, volume_24h: null })];
    const quality = computeDataQuality(snapshots, 0.20);
    expect(quality.completeness).toBeLessThan(100);
  });
});

describe("normalizeToken", () => {
  it("merges multiple sources by averaging", () => {
    const snapshots: TokenSourceSnapshotV1[] = [
      makeSnapshot("dexscreener", { price_usd: 100 }),
      makeSnapshot("dexpaprika", { price_usd: 200 }),
    ];

    const norm = normalizeToken("So11111111111111111111111111111111", snapshots, 0.20);
    expect(norm.price_usd).toBe(150);
    expect(norm.data_quality.sources_used).toHaveLength(2);
  });
});
