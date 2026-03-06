/**
 * M2: HTTP Resilience Layer - tests with mocked fetch.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resilientFetch } from "@bot/adapters/http-resilience.js";
import { CircuitBreaker } from "@bot/governance/circuit-breaker.js";

describe("resilientFetch", () => {
  const url = "https://example.com/api";

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns response on first success", async () => {
    const mockRes = { ok: true, status: 200 };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRes);

    const res = await resilientFetch(url);
    expect(res).toBe(mockRes);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("passes init to fetch", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200 });
    await resilientFetch(url, { method: "POST", headers: { "X-Custom": "val" } });
    expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({
      method: "POST",
      headers: { "X-Custom": "val" },
    }));
  });

  it("retries on 429 then succeeds", async () => {
    const fetchFn = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchFn
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (k: string) => (k === "Retry-After" ? "0" : null) },
      } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await resilientFetch(url, undefined, { maxRetries: 2 });
    expect(res.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx then succeeds", async () => {
    const fetchFn = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchFn
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => null },
      } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await resilientFetch(url, undefined, { maxRetries: 2 });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx three times then returns last 5xx response", async () => {
    const fetchFn = globalThis.fetch as ReturnType<typeof vi.fn>;
    const fivexx = {
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      headers: { get: () => null },
    } as unknown as Response;
    fetchFn.mockResolvedValue(fivexx);

    const res = await resilientFetch(url, undefined, { maxRetries: 2 });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("retries on AbortError then succeeds", async () => {
    const err = new DOMException("aborted", "AbortError");
    const fetchFn = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchFn.mockRejectedValueOnce(err).mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await resilientFetch(url, undefined, { maxRetries: 2 });
    expect(res.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("returns non-ok response to caller after 5xx retries exhausted", async () => {
    const fivexx = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: { get: () => null },
    } as unknown as Response;
    const fetchFn = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchFn.mockResolvedValue(fivexx);

    const res = await resilientFetch(url, undefined, { maxRetries: 1 });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("calls circuit breaker requireHealthy and reportHealth on success", async () => {
    const cb = new CircuitBreaker(["my-adapter"]);
    const requireSpy = vi.spyOn(cb, "requireHealthy");
    const reportSpy = vi.spyOn(cb, "reportHealth");
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200 });

    await resilientFetch(url, undefined, {
      circuitBreaker: cb,
      adapterId: "my-adapter",
    });
    expect(requireSpy).toHaveBeenCalledWith(["my-adapter"]);
    expect(reportSpy).toHaveBeenCalledWith("my-adapter", true, expect.any(Number));
  });

  it("reports failure to circuit breaker on non-ok response", async () => {
    const cb = new CircuitBreaker(["my-adapter"]);
    const reportSpy = vi.spyOn(cb, "reportHealth");
    const fivexx = {
      ok: false,
      status: 500,
      statusText: "Error",
      headers: { get: () => null },
    } as unknown as Response;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fivexx);

    const res = await resilientFetch(url, undefined, {
      circuitBreaker: cb,
      adapterId: "my-adapter",
      maxRetries: 0,
    });
    expect(res.ok).toBe(false);
    expect(reportSpy).toHaveBeenCalledWith("my-adapter", false, expect.any(Number));
  });
});
