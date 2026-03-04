export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 1,
};

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private readonly config: CircuitBreakerConfig;

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

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = "closed";
    this.halfOpenAttempts = 0;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === "half-open") {
      this.state = "open";
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = "open";
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitOpenError(this.name, this.state);
    }

    if (this.state === "half-open") {
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
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
