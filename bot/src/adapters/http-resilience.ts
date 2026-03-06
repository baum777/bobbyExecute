/**
 * HTTP Resilience Layer - M2.
 * Shared fetch wrapper: timeout, retries, exponential backoff, 429 handling, circuit breaker hooks.
 */
import type { CircuitBreaker } from "../governance/circuit-breaker.js";

export interface ResilientFetchOptions {
  /** Timeout in ms. Default 10000. */
  timeoutMs?: number;
  /** Max retries (excluding first attempt). Default 3. */
  maxRetries?: number;
  /** Circuit breaker. When set, requireHealthy before fetch, reportHealth after. */
  circuitBreaker?: CircuitBreaker;
  /** Adapter ID for circuit breaker. Required if circuitBreaker set. */
  adapterId?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout, retries, exponential backoff, 429 handling.
 * Optional circuit breaker: requireHealthy before, reportHealth after.
 */
export async function resilientFetch(
  url: string,
  init?: RequestInit,
  options?: ResilientFetchOptions
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const cb = options?.circuitBreaker;
  const adapterId = options?.adapterId ?? "http";

  if (cb && adapterId) {
    cb.requireHealthy([adapterId]);
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;

      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        const delayMs = retryAfter
          ? Math.min(parseInt(retryAfter, 10) * 1000, MAX_BACKOFF_MS)
          : Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
        if (attempt < maxRetries) {
          await sleep(delayMs);
          continue;
        }
        cb?.reportHealth(adapterId, false, latencyMs);
        throw new Error(`Rate limited (429) after ${maxRetries + 1} attempts`);
      }

      if (res.status >= 500 && res.status < 600) {
        if (attempt < maxRetries) {
          const delayMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
          await sleep(delayMs);
          continue;
        }
        cb?.reportHealth(adapterId, false, latencyMs);
        return res;
      }

      if (!res.ok) {
        cb?.reportHealth(adapterId, false, latencyMs);
        return res;
      }

      cb?.reportHealth(adapterId, true, latencyMs);
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries && (lastError.name === "AbortError" || lastError.message.includes("fetch"))) {
        const delayMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
        await sleep(delayMs);
        continue;
      }

      cb?.reportHealth(adapterId, false, latencyMs);
      throw lastError;
    }
  }

  throw lastError ?? new Error("resilientFetch failed");
}
