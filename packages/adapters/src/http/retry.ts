export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

export interface RetryAttemptMeta {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
}

export function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function computeBackoffDelay(attempt: number, config: RetryConfig): number {
  const expDelay = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * Math.max(1, config.jitterMs));
  return Math.min(config.maxDelayMs, expDelay + jitter);
}

export async function withRetry<T>(
  config: RetryConfig,
  operation: (meta: RetryAttemptMeta) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const delayMs = computeBackoffDelay(attempt, config);
    try {
      return await operation({ attempt, maxAttempts: config.maxAttempts, delayMs });
    } catch (error) {
      lastError = error;
      if (attempt >= config.maxAttempts) break;
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Retry exhausted");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
