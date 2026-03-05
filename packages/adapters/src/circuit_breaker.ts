export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  errorRateThreshold: number;
  p95LatencyThresholdMs: number;
  rollingWindowMs: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 1,
  errorRateThreshold: 0.30,
  p95LatencyThresholdMs: 3500,
  rollingWindowMs: 5 * 60 * 1000,
};

interface RollingEntry {
  timestamp: number;
  success: boolean;
  durationMs: number;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly rolling: RollingEntry[] = [];

  constructor(
    public readonly name: string,
    config: Partial<CircuitBreakerConfig> = {},
  ) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  getState(): CircuitState {
    if (this.state === "open") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.state = "half-open";
        this.halfOpenAttempts = 0;
      }
    }
    return this.state;
  }

  getStats(): { errorRate5m: number; p95LatencyMs: number; totalRequests: number } {
    this.pruneRolling();
    if (this.rolling.length === 0) {
      return { errorRate5m: 0, p95LatencyMs: 0, totalRequests: 0 };
    }
    const failures = this.rolling.filter((e) => !e.success).length;
    const errorRate5m = failures / this.rolling.length;
    const durations = this.rolling.map((e) => e.durationMs).sort((a, b) => a - b);
    const p95Index = Math.min(Math.floor(durations.length * 0.95), durations.length - 1);
    const p95LatencyMs = durations[p95Index];
    return { errorRate5m, p95LatencyMs, totalRequests: this.rolling.length };
  }

  canExecute(): boolean {
    const currentState = this.getState();
    switch (currentState) {
      case "closed":
        return true;
      case "open":
        return false;
      case "half-open":
        return this.halfOpenAttempts < this.config.halfOpenMaxAttempts;
    }
  }

  recordSuccess(durationMs: number): void {
    this.addRollingEntry(true, durationMs);
    this.state = "closed";
    this.halfOpenAttempts = 0;
  }

  recordFailure(durationMs: number): void {
    this.addRollingEntry(false, durationMs);
    this.lastFailureTime = Date.now();
    if (this.state === "half-open") {
      this.state = "open";
      return;
    }
    this.evaluateOpen();
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitOpenError(this.name, this.state);
    }
    if (this.state === "half-open") {
      this.halfOpenAttempts++;
    }
    const start = Date.now();
    try {
      const result = await fn();
      this.recordSuccess(Date.now() - start);
      return result;
    } catch (err) {
      this.recordFailure(Date.now() - start);
      throw err;
    }
  }

  private addRollingEntry(success: boolean, durationMs: number): void {
    this.rolling.push({ timestamp: Date.now(), success, durationMs });
    this.pruneRolling();
  }

  private pruneRolling(): void {
    const cutoff = Date.now() - this.config.rollingWindowMs;
    while (this.rolling.length > 0 && this.rolling[0].timestamp < cutoff) {
      this.rolling.shift();
    }
  }

  private evaluateOpen(): void {
    const stats = this.getStats();
    if (
      stats.errorRate5m > this.config.errorRateThreshold ||
      stats.p95LatencyMs > this.config.p95LatencyThresholdMs
    ) {
      this.state = "open";
    }
  }
}

export class CircuitOpenError extends Error {
  constructor(
    public readonly breakerName: string,
    public readonly breakerState: CircuitState,
  ) {
    super(`Circuit breaker "${breakerName}" is ${breakerState}`);
    this.name = "CircuitOpenError";
  }
}
