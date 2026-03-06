/**
 * Circuit breaker for adapter health tracking.
 * EXTRACTED from OrchestrAI_Labs packages/agent-runtime/src/providers/provider-router.ts
 * Simplified for trading adapters (DexPaprika, Moralis, RPC).
 */
import { SystemClock, type Clock } from "../core/clock.js";

export interface AdapterHealth {
  adapterId: string;
  healthy: boolean;
  lastCheckedAt: number;
  /** Age in ms since last successful request. 0 when last report was success. */
  freshnessAgeMs?: number;
  consecutiveFailures: number;
  averageLatencyMs: number;
}

interface AdapterHealthInternal extends AdapterHealth {
  lastSuccessAt?: number;
  /** When adapter went unhealthy (for time-based recovery). */
  unhealthySince?: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeMs: number;
  /** Called after each reportHealth with updated health. */
  onHealthChange?: (adapterId: string, health: AdapterHealth) => void;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeMs: 60000,
};

export class CircuitBreaker {
  private health: Map<string, AdapterHealthInternal> = new Map();
  private readonly clock: Clock;
  private readonly config: CircuitBreakerConfig;

  constructor(
    adapterIds: string[],
    config?: Partial<CircuitBreakerConfig>,
    clock?: Clock
  ) {
    this.clock = clock ?? new SystemClock();
    this.config = { ...DEFAULT_CONFIG, ...config };

    for (const id of adapterIds) {
      this.health.set(id, {
        adapterId: id,
        healthy: true,
        lastCheckedAt: 0,
        freshnessAgeMs: 0,
        consecutiveFailures: 0,
        averageLatencyMs: 0,
      });
    }
  }

  reportHealth(adapterId: string, success: boolean, latencyMs: number): void {
    const current = this.health.get(adapterId);
    if (!current) return;

    const now = this.clock.now().getTime();

    if (success) {
      current.consecutiveFailures = 0;
      current.healthy = true;
      current.lastSuccessAt = now;
      current.unhealthySince = undefined;
    } else {
      current.consecutiveFailures++;
      if (current.consecutiveFailures >= this.config.failureThreshold) {
        current.healthy = false;
        current.unhealthySince = now;
      }
    }

    const alpha = 0.3;
    current.averageLatencyMs =
      alpha * latencyMs + (1 - alpha) * current.averageLatencyMs;
    current.lastCheckedAt = now;
    current.freshnessAgeMs = (current.lastSuccessAt ?? 0) > 0 ? now - (current.lastSuccessAt ?? 0) : 0;

    this.health.set(adapterId, current);
    const { lastSuccessAt: _, ...publicHealth } = current;
    this.config.onHealthChange?.(adapterId, { ...publicHealth });
  }

  isHealthy(adapterId: string): boolean {
    const h = this.health.get(adapterId);
    if (!h) return false;
    if (h.healthy) return true;
    if (h.unhealthySince === undefined) return false;
    const elapsed = this.clock.now().getTime() - h.unhealthySince;
    if (elapsed >= this.config.recoveryTimeMs) {
      return true;
    }
    return false;
  }

  getHealth(): AdapterHealth[] {
    const now = this.clock.now().getTime();
    return Array.from(this.health.values()).map((h) => {
      const freshnessAgeMs = (h.lastSuccessAt ?? 0) > 0 ? now - h.lastSuccessAt! : 0;
      const { lastSuccessAt: _, ...rest } = h;
      return { ...rest, freshnessAgeMs };
    });
  }

  hasAnyHealthy(adapterIds: string[]): boolean {
    return adapterIds.some((id) => this.isHealthy(id));
  }

  /** Throws if no healthy adapters available (fail-closed). */
  requireHealthy(adapterIds: string[]): void {
    const healthy = adapterIds.filter((id) => this.isHealthy(id));
    if (healthy.length === 0) {
      throw new Error(
        `No healthy adapters available. All of [${adapterIds.join(", ")}] are unhealthy.`
      );
    }
  }
}
