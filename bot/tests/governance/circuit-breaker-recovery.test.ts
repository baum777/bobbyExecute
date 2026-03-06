/**
 * Wave 6: Circuit breaker time-based recovery.
 */
import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "../../src/governance/circuit-breaker.js";
import { FakeClock } from "../../src/core/clock.js";

describe("Circuit breaker time-based recovery (Wave 6)", () => {
  it("recovers after recoveryTimeMs when unhealthy", () => {
    const clock = new FakeClock(new Date("2026-01-01T00:00:00Z"));
    const cb = new CircuitBreaker(["a"], { failureThreshold: 1, recoveryTimeMs: 5000 }, clock);

    cb.reportHealth("a", false, 100);
    expect(cb.isHealthy("a")).toBe(false);

    clock.advance(4000);
    expect(cb.isHealthy("a")).toBe(false);

    clock.advance(1500);
    expect(cb.isHealthy("a")).toBe(true);
  });

  it("success after recovery clears unhealthy state", () => {
    const clock = new FakeClock(new Date("2026-01-01T00:00:00Z"));
    const cb = new CircuitBreaker(["a"], { failureThreshold: 1, recoveryTimeMs: 5000 }, clock);

    cb.reportHealth("a", false, 100);
    expect(cb.isHealthy("a")).toBe(false);

    clock.advance(6000);
    expect(cb.isHealthy("a")).toBe(true);

    cb.reportHealth("a", true, 50);
    expect(cb.isHealthy("a")).toBe(true);
  });
});
