import { describe, it, expect } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "../src/circuit_breaker.js";

describe("CircuitBreaker", () => {
  it("starts in closed state", () => {
    const b = new CircuitBreaker("test");
    expect(b.getState()).toBe("closed");
  });

  it("opens when error rate exceeds threshold", () => {
    const b = new CircuitBreaker("test", { errorRateThreshold: 0.30, rollingWindowMs: 60_000 });
    b.recordSuccess(50);
    for (let i = 0; i < 4; i++) b.recordFailure(100);
    expect(b.getStats().errorRate5m).toBeGreaterThan(0.30);
    expect(b.getState()).toBe("open");
  });

  it("opens when p95 latency exceeds threshold", () => {
    const b = new CircuitBreaker("test", { p95LatencyThresholdMs: 1000, rollingWindowMs: 60_000 });
    for (let i = 0; i < 20; i++) b.recordSuccess(1500);
    expect(b.getStats().p95LatencyMs).toBeGreaterThan(1000);
  });

  it("rejects execution when open", async () => {
    const b = new CircuitBreaker("test", { errorRateThreshold: 0.10, rollingWindowMs: 60_000 });
    for (let i = 0; i < 5; i++) b.recordFailure(100);
    expect(b.getState()).toBe("open");
    await expect(b.execute(async () => "ok")).rejects.toThrow(CircuitOpenError);
  });

  it("resets to closed after success in half-open", async () => {
    const b = new CircuitBreaker("test", { errorRateThreshold: 0.10, resetTimeoutMs: 0, rollingWindowMs: 60_000 });
    for (let i = 0; i < 5; i++) b.recordFailure(100);
    expect(b.getState()).toBe("half-open");
    await b.execute(async () => "ok");
    expect(b.getState()).toBe("closed");
  });

  it("exposes stats with totalRequests", () => {
    const b = new CircuitBreaker("test");
    b.recordSuccess(50);
    b.recordSuccess(80);
    b.recordFailure(200);
    const stats = b.getStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.errorRate5m).toBeCloseTo(1/3, 2);
  });
});
