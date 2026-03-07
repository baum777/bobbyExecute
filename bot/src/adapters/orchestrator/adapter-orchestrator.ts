/**
 * Adapter orchestrator - primary → secondary → fallback.
 * Normalized planning package P3: deterministic fallback path.
 * All adapters fail → returns { error }. Stale data → skip, try next.
 */
import type { MarketSnapshot } from "../../core/contracts/market.js";
import type { CircuitBreaker } from "../../governance/circuit-breaker.js";

export interface MarketAdapterFetch {
  /** Adapter ID for circuit breaker */
  id: string;
  /** Fetch market data. Throws on failure. */
  fetch: () => Promise<MarketSnapshot>;
}

export interface AdapterOrchestratorConfig {
  /** Ordered adapters: primary, secondary, fallback */
  adapters: MarketAdapterFetch[];
  circuitBreaker: CircuitBreaker;
  /** Max staleness in ms. Skip adapter result if freshnessMs > this. */
  maxStalenessMs: number;
}

/**
 * Fetch market data via primary → secondary → fallback.
 * Returns MarketSnapshot from first successful adapter with fresh data.
 * All fail or all stale → { error: string }.
 */
export async function fetchMarketData(
  config: AdapterOrchestratorConfig
): Promise<MarketSnapshot | { error: string }> {
  const { adapters, circuitBreaker, maxStalenessMs } = config;
  let lastError: string | undefined;

  for (const adapter of adapters) {
    if (!circuitBreaker.isHealthy(adapter.id)) continue;

    try {
      const snapshot = await adapter.fetch();
      const freshnessMs = snapshot.freshnessMs ?? 0;
      if (freshnessMs > maxStalenessMs) {
        lastError = `Adapter ${adapter.id}: data stale (${freshnessMs}ms > ${maxStalenessMs}ms)`;
        continue;
      }
      return snapshot;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      circuitBreaker.reportHealth(adapter.id, false, 0);
    }
  }

  return {
    error: lastError ?? "All adapters failed or stale",
  };
}

/** Alias for tests */
export type MarketAdapter = MarketAdapterFetch;

/**
 * Simplified fetch for tests - no circuit breaker required.
 * When circuitBreaker omitted, uses pass-through (all healthy).
 */
export async function fetchMarketWithFallback(
  adapters: MarketAdapterFetch[],
  _poolId: string,
  maxStalenessMs: number,
  circuitBreaker?: CircuitBreaker
): Promise<MarketSnapshot | { error: string }> {
  const cb = circuitBreaker ?? createPassThroughCircuitBreaker(adapters.map((a) => a.id));
  return fetchMarketData({
    adapters,
    circuitBreaker: cb,
    maxStalenessMs,
  });
}

function createPassThroughCircuitBreaker(adapterIds: string[]): CircuitBreaker {
  return {
    isHealthy: () => true,
    reportHealth: () => {},
    getHealth: () =>
      adapterIds.map((id) => ({
        adapterId: id,
        healthy: true,
        lastCheckedAt: 0,
        consecutiveFailures: 0,
        averageLatencyMs: 0,
      })),
    requireHealthy: () => {},
  } as unknown as CircuitBreaker;
}
