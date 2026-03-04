import { withRetry, type RetryConfig, DEFAULT_RETRY_CONFIG, HttpRetryableError } from "./retry.js";
import { CircuitBreaker, type CircuitBreakerConfig } from "./circuitBreaker.js";
import { TokenBucketRateLimiter, type RateLimitConfig } from "./rateLimit.js";

export interface HttpRequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  query?: Record<string, string | number>;
  body?: unknown;
  timeoutMs?: number;
  idempotencyKey?: string;
}

export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
  durationMs: number;
}

export interface HttpClientConfig {
  retry?: Partial<RetryConfig>;
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  rateLimit?: Partial<RateLimitConfig>;
  defaultTimeoutMs?: number;
  name?: string;
}

export class HttpClient {
  private readonly retryConfig: RetryConfig;
  private readonly breaker: CircuitBreaker;
  private readonly limiter: TokenBucketRateLimiter;
  private readonly defaultTimeoutMs: number;
  public readonly name: string;

  constructor(config: HttpClientConfig = {}) {
    this.name = config.name ?? "default";
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry };
    this.breaker = new CircuitBreaker(this.name, config.circuitBreaker);
    this.limiter = new TokenBucketRateLimiter(config.rateLimit);
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 10_000;
  }

  getBreakerState() {
    return this.breaker.getState();
  }

  async request<T>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    await this.limiter.acquire();

    return this.breaker.execute(() =>
      withRetry(
        () => this.doFetch<T>(options),
        this.retryConfig,
      ),
    );
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
        headers: {
          "Accept": "application/json",
          ...headers,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const durationMs = Date.now() - start;
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      if (!response.ok) {
        if (response.status >= 500 || response.status === 429) {
          throw new HttpRetryableError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
          );
        }
        throw new HttpClientError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
        );
      }

      const data = (await response.json()) as T;
      return { data, status: response.status, headers: responseHeaders, durationMs };
    } finally {
      clearTimeout(timer);
    }
  }
}

function appendQuery(url: string, query: Record<string, string | number>): string {
  const u = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    u.searchParams.set(key, String(value));
  }
  return u.toString();
}

export class HttpClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HttpClientError";
  }
}
