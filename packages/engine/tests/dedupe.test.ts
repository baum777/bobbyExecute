import { describe, it, expect } from "vitest";
import { dedupeByContractAddress, enforceRatioBalance } from "../src/universe/dedupe.balance.js";
import { resolveContractAddress } from "../src/universe/contract.resolver.js";
import type { TokenSourceSnapshotV1 } from "@bobby/contracts";

function makeSnapshot(ca: string, source: "dexscreener" | "dexpaprika"): TokenSourceSnapshotV1 {
  return {
    token_ref: {
      symbol: "TOK",
      name: "Token",
      contract_address: ca,
      source,
    },
    source,
    price_usd: 1.0,
    volume_24h: 1000,
    liquidity_usd: 5000,
    fdv: 100000,
    market_cap_usd: 50000,
    price_change_24h_pct: 5.0,
    fetched_at: new Date().toISOString(),
  };
}

describe("dedupeByContractAddress", () => {
  it("deduplicates snapshots by contract address", () => {
    const snapshots: TokenSourceSnapshotV1[] = [
      makeSnapshot("So11111111111111111111111111111111", "dexscreener"),
      makeSnapshot("So11111111111111111111111111111111", "dexpaprika"),
      makeSnapshot("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "dexscreener"),
    ];

    const result = dedupeByContractAddress(snapshots);
    expect(result.preDedupe).toBe(3);
    expect(result.postDedupe).toBe(2);
    expect(result.deduped.get("So11111111111111111111111111111111")?.length).toBe(2);
  });

  it("returns empty map for empty input", () => {
    const result = dedupeByContractAddress([]);
    expect(result.postDedupe).toBe(0);
  });
});

describe("enforceRatioBalance", () => {
  it("enforces soft 50/50 ratio", () => {
    const trending = new Set(["A111111111111111111111111111111111", "B111111111111111111111111111111111", "C111111111111111111111111111111111"]);
    const volume = new Set(["D111111111111111111111111111111111", "E111111111111111111111111111111111", "F111111111111111111111111111111111"]);
    const all = [...trending, ...volume];

    const result = enforceRatioBalance(trending, volume, all, 0.5, 4);
    expect(result.finalCAs.length).toBe(4);
    expect(result.trendingCount).toBeGreaterThanOrEqual(1);
    expect(result.volumeCount).toBeGreaterThanOrEqual(1);
  });

  it("relaxes ratio when enforcing would drop coverage", () => {
    const trending = new Set(["A111111111111111111111111111111111", "B111111111111111111111111111111111"]);
    const volume = new Set<string>();
    const all = [...trending];

    const result = enforceRatioBalance(trending, volume, all, 0.5, 10);
    expect(result.finalCAs.length).toBe(2);
  });
});

describe("resolveContractAddress", () => {
  it("resolves valid Solana address", () => {
    const snap = makeSnapshot("So11111111111111111111111111111111", "dexscreener");
    expect(resolveContractAddress(snap)).toBe("So11111111111111111111111111111111");
  });

  it("returns null for empty address", () => {
    const snap = makeSnapshot("", "dexscreener");
    expect(resolveContractAddress(snap)).toBeNull();
  });

  it("returns null for invalid address", () => {
    const snap = makeSnapshot("not-a-valid-address!", "dexscreener");
    expect(resolveContractAddress(snap)).toBeNull();
  });
});
