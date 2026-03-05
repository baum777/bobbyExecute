import { CircuitBreaker, CircuitOpenError, type CircuitBreakerConfig } from "./circuit_breaker.js";

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  factor: number;
  jitterPercent: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 500,
  factor: 2.0,
  jitterPercent: 20,
  maxDelayMs: 10_000,
};

export interface RateLimitConfig {
  maxTokens: number;
  refillRatePerSecond: number;
}

export interface HttpClientConfig {
  retry?: Partial<RetryConfig>;
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  rateLimit?: Partial<RateLimitConfig>;
  defaultTimeoutMs?: number;
  name?: string;
}

export interface HttpRequestOptions {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  query?: Record<string, string | number>;
  body?: unknown;
  timeoutMs?: number;
}

export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
  durationMs: number;
}

export class HttpClient {
  private readonly retryConfig: RetryConfig;
  private readonly breaker: CircuitBreaker;
  private readonly defaultTimeoutMs: number;
  public readonly name: string;
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(config: HttpClientConfig = {}) {
    this.name = config.name ?? "default";
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry };
    this.breaker = new CircuitBreaker(this.name, config.circuitBreaker);
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 10_000;
    this.maxTokens = config.rateLimit?.maxTokens ?? 10;
    this.refillRate = config.rateLimit?.refillRatePerSecond ?? 2;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  getBreaker(): CircuitBreaker {
    return this.breaker;
  }

  getBreakerState() {
    return this.breaker.getState();
  }

  getBreakerStats() {
    return this.breaker.getStats();
  }

  async requestJson<T>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    await this.acquireToken();
    return this.breaker.execute(() => this.withRetry(() => this.doFetch<T>(options)));
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.retryConfig.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || attempt === this.retryConfig.maxAttempts - 1) throw err;
        await sleep(this.computeBackoff(attempt));
      }
    }
    throw lastError;
  }

  private computeBackoff(attempt: number): number {
    const base = this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.factor, attempt);
    const clamped = Math.min(base, this.retryConfig.maxDelayMs);
    const jitter = clamped * (this.retryConfig.jitterPercent / 100) * Math.random();
    return clamped + jitter;
  }

  private async doFetch<T>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const { url, method = "GET", headers = {}, query, body, timeoutMs } = options;
    const finalUrl = query ? appendQuery(url, query) : url;
    const controller = new AbortController();
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeout);
    const start = Date.now();
    try {
      const response = await fetch(finalUrl, {
        method,
        headers: { Accept: "application/json", ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const durationMs = Date.now() - start;
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => { responseHeaders[k] = v; });

      if (!response.ok) {
        const errCls = response.status >= 500 || response.status === 429 ? HttpRetryableError : HttpClientError;
        throw new errCls(`HTTP ${response.status}: ${response.statusText}`, response.status);
      }
      const data = (await response.json()) as T;
      return { data, status: response.status, headers: responseHeaders, durationMs };
    } finally {
      clearTimeout(timer);
    }
  }

  private async acquireToken(): Promise<void> {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
    if (this.tokens >= 1) { this.tokens -= 1; return; }
    const waitMs = ((1 - this.tokens) / this.refillRate) * 1000;
    await sleep(waitMs);
    this.tokens = 0;
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof HttpRetryableError) return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendQuery(url: string, query: Record<string, string | number>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
  return u.toString();
}

export class HttpRetryableError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "HttpRetryableError";
  }
}

export class HttpClientError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "HttpClientError";
  }
}

export { CircuitBreaker, CircuitOpenError };
