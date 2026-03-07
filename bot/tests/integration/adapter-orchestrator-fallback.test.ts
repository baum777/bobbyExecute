/**
 * Adapter orchestrator fallback tests - Normalized planning package P7.
 * Primary fail -> secondary -> fallback; all fail -> error.
 */
import { describe, expect, it } from "vitest";
import {
  fetchMarketWithFallback,
  type MarketAdapterFetch,
} from "../../src/adapters/orchestrator/adapter-orchestrator.js";
import type { MarketSnapshot } from "../../src/core/contracts/market.js";

describe("Adapter orchestrator fallback (P7)", () => {
  it("returns primary result when primary succeeds", async () => {
    const primary: MarketAdapterFetch = {
      id: "primary",
      fetch: async () => ({
        traceId: "t1",
        timestamp: "2026-03-07T12:00:00.000Z",
        source: "dexpaprika",
        poolId: "p1",
        baseToken: "SOL",
        quoteToken: "USD",
        priceUsd: 150,
        volume24h: 1000,
        liquidity: 50000,
        freshnessMs: 0,
      }),
    };
    const result = await fetchMarketWithFallback([primary], 30_000);
    expect("error" in result).toBe(false);
    expect((result as MarketSnapshot).poolId).toBe("p1");
    expect((result as MarketSnapshot).priceUsd).toBe(150);
  });

  it("falls back to secondary when primary fails", async () => {
    const primary: MarketAdapterFetch = {
      id: "primary",
      fetch: async () => {
        throw new Error("Primary failed");
      },
    };
    const secondary: MarketAdapterFetch = {
      id: "secondary",
      fetch: async () => ({
        traceId: "t2",
        timestamp: "2026-03-07T12:00:00.000Z",
        source: "dexscreener",
        poolId: "p1",
        baseToken: "SOL",
        quoteToken: "USD",
        priceUsd: 151,
        volume24h: 1100,
        liquidity: 51000,
        freshnessMs: 100,
      }),
    };
    const result = await fetchMarketWithFallback([primary, secondary], 30_000);
    expect("error" in result).toBe(false);
    expect((result as MarketSnapshot).source).toBe("dexscreener");
    expect((result as MarketSnapshot).priceUsd).toBe(151);
  });

  it("returns error when all adapters fail", async () => {
    const adapters: MarketAdapterFetch[] = [
      { id: "a1", fetch: async () => { throw new Error("Fail 1"); } },
      { id: "a2", fetch: async () => { throw new Error("Fail 2"); } },
    ];
    const result = await fetchMarketWithFallback(adapters, 30_000);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toContain("All adapters failed");
  });
});
