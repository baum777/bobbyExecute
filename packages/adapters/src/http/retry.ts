export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  jitterFactor: 0.3,
};

export function computeBackoff(attempt: number, config: RetryConfig): number {
  const exponential = config.baseDelayMs * Math.pow(2, attempt);
  const clamped = Math.min(exponential, config.maxDelayMs);
  const jitter = clamped * config.jitterFactor * Math.random();
  return clamped + jitter;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  isRetryable: (err: unknown) => boolean = defaultIsRetryable,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === config.maxAttempts - 1) {
        throw err;
      }
      const delay = computeBackoff(attempt, config);
      await sleep(delay);
    }
  }
  throw lastError;
}

function defaultIsRetryable(err: unknown): boolean {
  if (err instanceof HttpRetryableError) return true;
  if (err instanceof Error && "status" in err) {
    const status = (err as Error & { status: number }).status;
    return status >= 500 || status === 429;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HttpRetryableError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HttpRetryableError";
  }
}
