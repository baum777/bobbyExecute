import { describe, it, expect } from "vitest";
import { detectDivergences } from "../src/divergence/divergence.detect.js";
import type { TokenSourceSnapshotV1 } from "@bobby/contracts";

function makeSnapshot(source: "dexscreener" | "dexpaprika", price: number, volume: number): TokenSourceSnapshotV1 {
  return {
    token_ref: {
      symbol: "TOK",
      name: "Token",
      contract_address: "CA1111111111111111111111111111111111",
      source,
    },
    source,
    price_usd: price,
    volume_24h: volume,
    liquidity_usd: 100000,
    fdv: 1000000,
    market_cap_usd: 500000,
    price_change_24h_pct: 5,
    fetched_at: new Date().toISOString(),
  };
}

describe("detectDivergences", () => {
  it("detects price divergence above threshold", () => {
    const snapshots = [
      makeSnapshot("dexscreener", 100, 50000),
      makeSnapshot("dexpaprika", 70, 50000),
    ];

    const result = detectDivergences("CA1111111111111111111111111111111111", snapshots, 0.20);
    expect(result.divergences.some((d) => d.type === "price_divergence" && d.exceeded)).toBe(true);
    expect(result.divergence_count).toBeGreaterThanOrEqual(1);
  });

  it("applies Fragile Expansion override when >= 2 divergences", () => {
    const snapshots = [
      makeSnapshot("dexscreener", 100, 100000),
      makeSnapshot("dexpaprika", 50, 30000),
    ];

    const result = detectDivergences("CA1111111111111111111111111111111111", snapshots, 0.20);
    expect(result.divergence_count).toBeGreaterThanOrEqual(2);
    expect(result.classification_override).toBe("Fragile Expansion");
  });

  it("returns no divergences when sources agree", () => {
    const snapshots = [
      makeSnapshot("dexscreener", 100, 50000),
      makeSnapshot("dexpaprika", 100, 50000),
    ];

    const result = detectDivergences("CA1111111111111111111111111111111111", snapshots, 0.20);
    expect(result.divergence_count).toBe(0);
    expect(result.classification_override).toBeNull();
  });
});
