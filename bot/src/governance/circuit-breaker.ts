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
  consecutiveFailures: number;
  averageLatencyMs: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeMs: 60000,
};

export class CircuitBreaker {
  private health: Map<string, AdapterHealth> = new Map();
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
        consecutiveFailures: 0,
        averageLatencyMs: 0,
      });
    }
  }

  reportHealth(adapterId: string, success: boolean, latencyMs: number): void {
    const current = this.health.get(adapterId);
    if (!current) return;

    if (success) {
      current.consecutiveFailures = 0;
      current.healthy = true;
    } else {
      current.consecutiveFailures++;
      if (
        current.consecutiveFailures >= this.config.failureThreshold
      ) {
        current.healthy = false;
      }
    }

    const alpha = 0.3;
    current.averageLatencyMs =
      alpha * latencyMs + (1 - alpha) * current.averageLatencyMs;
    current.lastCheckedAt = this.clock.now().getTime();

    this.health.set(adapterId, current);
  }

  isHealthy(adapterId: string): boolean {
    const h = this.health.get(adapterId);
    return h?.healthy ?? false;
  }

  getHealth(): AdapterHealth[] {
    return Array.from(this.health.values());
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
