/**
 * M3: Circuit Breaker Integration - consecutive failures open breaker; requireHealthy blocks when open.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createAdaptersWithCircuitBreaker,
  ADAPTER_IDS,
} from "@bot/adapters/adapters-with-cb.js";

describe("Circuit Breaker Integration (M3)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("consecutive failures open breaker; requireHealthy blocks when open", async () => {
    const { circuitBreaker, dexpaprika } = createAdaptersWithCircuitBreaker({
      circuitBreakerConfig: { failureThreshold: 2 },
      resilience: { maxRetries: 0 },
    });

    const fivexx = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: { get: () => null },
    } as unknown as Response;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fivexx);

    await expect(dexpaprika.getToken("token1")).rejects.toThrow(/DexPaprika error: 500/);
    expect(circuitBreaker.isHealthy("dexpaprika")).toBe(true);

    await expect(dexpaprika.getToken("token2")).rejects.toThrow(/DexPaprika error: 500/);
    expect(circuitBreaker.isHealthy("dexpaprika")).toBe(false);

    await expect(dexpaprika.getToken("token3")).rejects.toThrow(/No healthy adapters available/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("success resets consecutive failures", async () => {
    const { circuitBreaker, dexpaprika } = createAdaptersWithCircuitBreaker({
      circuitBreakerConfig: { failureThreshold: 2 },
      resilience: { maxRetries: 0 },
    });

    const fetchFn = globalThis.fetch as ReturnType<typeof vi.fn>;
    const fivexx = {
      ok: false,
      status: 500,
      statusText: "Error",
      headers: { get: () => null },
    } as unknown as Response;
    fetchFn
      .mockResolvedValueOnce(fivexx)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "t1" }) });

    await expect(dexpaprika.getToken("x")).rejects.toThrow(/500/);
    expect(circuitBreaker.isHealthy("dexpaprika")).toBe(true);

    const result = await dexpaprika.getToken("x");
    expect(result).toEqual({ id: "t1" });
    expect(circuitBreaker.isHealthy("dexpaprika")).toBe(true);
  });

  it("exports ADAPTER_IDS", () => {
    expect(ADAPTER_IDS).toEqual(["dexpaprika", "moralis", "dexscreener"]);
  });
});
