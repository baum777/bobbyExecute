import { describe, it, expect } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "../src/http/circuitBreaker.js";

describe("CircuitBreaker", () => {
  it("starts in closed state", () => {
    const breaker = new CircuitBreaker("test");
    expect(breaker.getState()).toBe("closed");
  });

  it("opens after failure threshold", () => {
    const breaker = new CircuitBreaker("test", { failureThreshold: 3 });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe("closed");
    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");
  });

  it("rejects execution when open", async () => {
    const breaker = new CircuitBreaker("test", { failureThreshold: 1 });
    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");

    await expect(
      breaker.execute(async () => "ok"),
    ).rejects.toThrow(CircuitOpenError);
  });

  it("resets to closed after success", () => {
    const breaker = new CircuitBreaker("test", { failureThreshold: 5 });
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    expect(breaker.getState()).toBe("closed");
  });
});
