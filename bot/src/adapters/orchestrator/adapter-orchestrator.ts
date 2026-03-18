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
  const failures: string[] = [];
  let skippedUnhealthy = 0;

  for (const adapter of adapters) {
    if (!circuitBreaker.isHealthy(adapter.id)) {
      skippedUnhealthy += 1;
      failures.push(`Adapter ${adapter.id}: circuit breaker open`);
      continue;
    }

    const startedAt = Date.now();
    try {
      const snapshot = await adapter.fetch();
      const latencyMs = Math.max(Date.now() - startedAt, 0);
      const freshnessMs = snapshot.freshnessMs ?? 0;
      if (freshnessMs > maxStalenessMs) {
        circuitBreaker.reportHealth(adapter.id, false, latencyMs);
        failures.push(`Adapter ${adapter.id}: data stale (${freshnessMs}ms > ${maxStalenessMs}ms)`);
        continue;
      }
      circuitBreaker.reportHealth(adapter.id, true, latencyMs);
      return snapshot;
    } catch (err) {
      const latencyMs = Math.max(Date.now() - startedAt, 0);
      circuitBreaker.reportHealth(adapter.id, false, latencyMs);
      failures.push(
        `Adapter ${adapter.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const detail = failures.length > 0 ? failures.join("; ") : "No adapters configured";
  const prefix = skippedUnhealthy > 0 ? `All adapters unavailable (${skippedUnhealthy} open breaker)` : "All adapters failed";

  return {
    error: `${prefix}: ${detail}`,
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
