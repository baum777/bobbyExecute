/**
 * Wave 7: Adapter integration - CB + adapters + fallback cache wiring.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  createAdaptersWithCircuitBreaker,
  ADAPTER_IDS,
} from "../../src/adapters/adapters-with-cb.js";

describe("Adapter integration (Wave 7)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("all three adapters wired to circuit breaker", () => {
    const { circuitBreaker, dexpaprika, moralis, dexscreener } =
      createAdaptersWithCircuitBreaker({ resilience: { maxRetries: 0 } });

    expect(dexpaprika).toBeDefined();
    expect(moralis).toBeDefined();
    expect(dexscreener).toBeDefined();
    expect(ADAPTER_IDS).toContain("dexpaprika");
    expect(ADAPTER_IDS).toContain("moralis");
    expect(ADAPTER_IDS).toContain("dexscreener");

    const health = circuitBreaker.getHealth();
    expect(health.length).toBe(3);
  });

  it("adapter failure propagates to circuit breaker", async () => {
    const fivexx = {
      ok: false,
      status: 500,
      headers: { get: () => null },
    } as unknown as Response;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fivexx);

    const { circuitBreaker, dexpaprika } = createAdaptersWithCircuitBreaker({
      circuitBreakerConfig: { failureThreshold: 2 },
      resilience: { maxRetries: 0 },
    });

    await expect(dexpaprika.getToken("x")).rejects.toThrow();
    expect(circuitBreaker.isHealthy("dexpaprika")).toBe(true);

    await expect(dexpaprika.getToken("y")).rejects.toThrow();
    expect(circuitBreaker.isHealthy("dexpaprika")).toBe(false);
  });

  it("onHealthChange callback receives updates", async () => {
    const updates: Array<{ adapterId: string; healthy: boolean }> = [];
    const fivexx = { ok: false, status: 500, headers: { get: () => null } } as unknown as Response;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fivexx);

    const { circuitBreaker, dexpaprika } = createAdaptersWithCircuitBreaker({
      circuitBreakerConfig: {
        failureThreshold: 1,
        onHealthChange: (id, h) => updates.push({ adapterId: id, healthy: h.healthy }),
      },
      resilience: { maxRetries: 0 },
    });

    await expect(dexpaprika.getToken("x")).rejects.toThrow();
    expect(updates.some((u) => u.adapterId === "dexpaprika" && !u.healthy)).toBe(true);
  });

  it("fallback cache returns stale on adapter failure when useFallbackCache=true", async () => {
    const fetchFn = globalThis.fetch as ReturnType<typeof vi.fn>;
    const cached = { id: "tok", name: "Token" };
    fetchFn
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(cached) })
      .mockResolvedValue({ ok: false, status: 500, headers: { get: () => null } } as unknown as Response);

    const { dexpaprika } = createAdaptersWithCircuitBreaker({
      useFallbackCache: true,
      resilience: { maxRetries: 0 },
    });

    const first = await dexpaprika.getToken("tok");
    expect(first).toEqual(cached);

    const second = await dexpaprika.getToken("tok");
    expect(second).toEqual(cached);
  });
});
