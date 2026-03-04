export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
  halfOpenMaxSuccesses: number;
}

export interface CircuitBreakerSnapshot {
  state: CircuitState;
  failures: number;
  openedAt: number | null;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private openedAt: number | null = null;
  private halfOpenSuccesses = 0;

  constructor(private readonly options: CircuitBreakerOptions) {}

  canRequest(now = Date.now()): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (this.openedAt === null) return false;
      if (now - this.openedAt >= this.options.cooldownMs) {
        this.state = "half_open";
        this.halfOpenSuccesses = 0;
        return true;
      }
      return false;
    }
    return true;
  }

  onSuccess(): void {
    if (this.state === "half_open") {
      this.halfOpenSuccesses += 1;
      if (this.halfOpenSuccesses >= this.options.halfOpenMaxSuccesses) {
        this.reset();
      }
      return;
    }
    this.failures = 0;
  }

  onFailure(now = Date.now()): void {
    if (this.state === "half_open") {
      this.trip(now);
      return;
    }

    this.failures += 1;
    if (this.failures >= this.options.failureThreshold) {
      this.trip(now);
    }
  }

  snapshot(): CircuitBreakerSnapshot {
    return {
      state: this.state,
      failures: this.failures,
      openedAt: this.openedAt,
    };
  }

  private trip(now: number): void {
    this.state = "open";
    this.openedAt = now;
    this.halfOpenSuccesses = 0;
  }

  private reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.openedAt = null;
    this.halfOpenSuccesses = 0;
  }
}
