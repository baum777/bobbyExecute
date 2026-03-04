import pino from "pino";
import { CircuitBreaker, type CircuitBreakerSnapshot } from "./circuitBreaker.js";
import { TokenBucket } from "./rateLimit.js";
import { isRetriableStatus, withRetry } from "./retry.js";

export interface HttpRequestOptions {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
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
  retry: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitterMs: number;
  };
  breaker: {
    failureThreshold: number;
    cooldownMs: number;
    halfOpenMaxSuccesses: number;
  };
  rateLimit: {
    capacity: number;
    refillRatePerSec: number;
  };
  defaultTimeoutMs: number;
}

const DEFAULT_CONFIG: HttpClientConfig = {
  retry: {
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 1000,
    jitterMs: 50,
  },
  breaker: {
    failureThreshold: 3,
    cooldownMs: 10_000,
    halfOpenMaxSuccesses: 1,
  },
  rateLimit: {
    capacity: 20,
    refillRatePerSec: 10,
  },
  defaultTimeoutMs: 8_000,
};

export class HttpClient {
  private readonly logger = pino({ name: "http-client" });
  private readonly breaker = new CircuitBreaker(DEFAULT_CONFIG.breaker);
  private readonly bucket = new TokenBucket(DEFAULT_CONFIG.rateLimit);
  private readonly config: HttpClientConfig;

  constructor(config?: Partial<HttpClientConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      retry: {
        ...DEFAULT_CONFIG.retry,
        ...(config?.retry ?? {}),
      },
      breaker: {
        ...DEFAULT_CONFIG.breaker,
        ...(config?.breaker ?? {}),
      },
      rateLimit: {
        ...DEFAULT_CONFIG.rateLimit,
        ...(config?.rateLimit ?? {}),
      },
    };
  }

  async request<T>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    if (!this.breaker.canRequest()) {
      throw new Error("Circuit breaker open");
    }

    await this.bucket.take(1);
    const startedAt = Date.now();

    const response = await withRetry(this.config.retry, async () => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? this.config.defaultTimeoutMs,
      );
      try {
        const targetUrl = withQuery(options.url, options.query);
        const headers = {
          ...(options.headers ?? {}),
          ...(options.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {}),
        };
        const res = await fetch(targetUrl, {
          method: options.method ?? "GET",
          headers,
          signal: controller.signal,
        });
        const text = await res.text();
        const json = text.length === 0 ? ({} as T) : (JSON.parse(text) as T);
        if (!res.ok) {
          if (isRetriableStatus(res.status)) {
            throw new Error(`Retriable status ${res.status}`);
          }
          throw new Error(`HTTP status ${res.status}`);
        }
        const mappedHeaders: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          mappedHeaders[key] = value;
        });
        return {
          data: json,
          status: res.status,
          headers: mappedHeaders,
          durationMs: Date.now() - startedAt,
        };
      } finally {
        clearTimeout(timeout);
      }
    });

    this.breaker.onSuccess();
    this.logger.debug({
      url: options.url,
      method: options.method ?? "GET",
      status: response.status,
      durationMs: response.durationMs,
    });
    return response;
  }

  onFailure(): void {
    this.breaker.onFailure();
  }

  breakerSnapshot(): CircuitBreakerSnapshot {
    return this.breaker.snapshot();
  }
}

function withQuery(
  url: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  if (!query || Object.keys(query).length === 0) return url;
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    queryParams.set(key, String(value));
  }
  return `${url}?${queryParams.toString()}`;
}
