export interface TokenBucketOptions {
  capacity: number;
  refillRatePerSec: number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefillAt: number;

  constructor(private readonly options: TokenBucketOptions) {
    this.tokens = options.capacity;
    this.lastRefillAt = Date.now();
  }

  async take(count = 1): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= count) {
        this.tokens -= count;
        return;
      }
      await sleep(25);
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillAt) / 1000;
    if (elapsedSec <= 0) return;

    const refillAmount = elapsedSec * this.options.refillRatePerSec;
    this.tokens = Math.min(this.options.capacity, this.tokens + refillAmount);
    this.lastRefillAt = now;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
