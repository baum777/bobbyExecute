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
import { CircuitBreaker } from "../../src/governance/circuit-breaker.js";

const freshSnapshot = (overrides: Partial<MarketSnapshot> = {}): MarketSnapshot => ({
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
  ...overrides,
});

describe("Adapter orchestrator fallback (P7)", () => {
  it("returns primary result when primary succeeds", async () => {
    const primary: MarketAdapterFetch = {
      id: "primary",
      fetch: async () => freshSnapshot(),
    };
    const result = await fetchMarketWithFallback([primary], "pool-1", 30_000);
    expect("error" in result).toBe(false);
    expect((result as MarketSnapshot).poolId).toBe("p1");
    expect((result as MarketSnapshot).priceUsd).toBe(150);
  });

  it("falls back to secondary when primary fails and preserves explicit health truth", async () => {
    const circuitBreaker = new CircuitBreaker(["primary", "secondary"], { failureThreshold: 2 });
    const primary: MarketAdapterFetch = {
      id: "primary",
      fetch: async () => {
        throw new Error("Primary failed");
      },
    };
    const secondary: MarketAdapterFetch = {
      id: "secondary",
      fetch: async () => freshSnapshot({ traceId: "t2", source: "dexscreener", priceUsd: 151, freshnessMs: 100 }),
    };
    const result = await fetchMarketWithFallback([primary, secondary], "pool-1", 30_000, circuitBreaker);
    expect("error" in result).toBe(false);
    expect((result as MarketSnapshot).source).toBe("dexscreener");
    expect((result as MarketSnapshot).priceUsd).toBe(151);

    const health = circuitBreaker.getHealth();
    expect(health.find((entry) => entry.adapterId === "primary")?.consecutiveFailures).toBe(1);
    expect(health.find((entry) => entry.adapterId === "secondary")?.healthy).toBe(true);
  });

  it("rejects stale fallback data and marks stale adapter unhealthy when failures persist", async () => {
    const circuitBreaker = new CircuitBreaker(["primary", "fallback"], { failureThreshold: 1 });
    const primary: MarketAdapterFetch = {
      id: "primary",
      fetch: async () => freshSnapshot({ freshnessMs: 45_000 }),
    };
    const fallback: MarketAdapterFetch = {
      id: "fallback",
      fetch: async () => freshSnapshot({ traceId: "fresh-fallback", source: "dexscreener", priceUsd: 149 }),
    };

    const result = await fetchMarketWithFallback([primary, fallback], "pool-1", 15_000, circuitBreaker);
    expect("error" in result).toBe(false);
    expect((result as MarketSnapshot).traceId).toBe("fresh-fallback");
    expect(circuitBreaker.getHealth().find((entry) => entry.adapterId === "primary")?.healthy).toBe(false);
  });

  it("returns aggregated fail-closed error when all adapters fail or remain unavailable", async () => {
    const circuitBreaker = new CircuitBreaker(["a1", "a2"], { failureThreshold: 1 });
    const adapters: MarketAdapterFetch[] = [
      { id: "a1", fetch: async () => { throw new Error("Fail 1"); } },
      { id: "a2", fetch: async () => freshSnapshot({ freshnessMs: 60_000 }) },
    ];
    const result = await fetchMarketWithFallback(adapters, "pool-1", 15_000, circuitBreaker);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toContain("All adapters failed");
    expect((result as { error: string }).error).toContain("Fail 1");
    expect((result as { error: string }).error).toContain("data stale");
    expect(circuitBreaker.getHealth().every((entry) => entry.healthy === false)).toBe(true);
  });
});
