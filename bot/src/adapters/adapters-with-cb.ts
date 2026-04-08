/**
 * M3: Adapter factory with Circuit Breaker integration.
 * Creates CircuitBreaker + HTTP adapters wired for fail-closed behavior.
 */
import { CircuitBreaker } from "../governance/circuit-breaker.js";
import { DexPaprikaClient } from "./dexpaprika/client.js";
import { MoralisClient } from "./moralis/client.js";
import { DexScreenerClient } from "./dexscreener/client.js";
import { createFallbackCache, withFallbackCache } from "./fallback-cache.js";
import type { ResilientFetchOptions } from "./http-resilience.js";
import type { CircuitBreakerConfig } from "../governance/circuit-breaker.js";
import type { Clock } from "../core/clock.js";

export const ADAPTER_IDS = ["dexpaprika", "moralis", "dexscreener"] as const;

const FALLBACK_CACHE_TTL_MS = 60_000;

export interface AdaptersWithCbConfig {
  /** Circuit breaker config. Default: failureThreshold 5, recoveryTimeMs 60000 */
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
  /** Optional clock for tests */
  clock?: Clock;
  /** DexPaprika baseUrl etc. */
  dexpaprika?: { baseUrl?: string; network?: string };
  /** Moralis baseUrl, apiKey, chain */
  moralis?: { baseUrl?: string; apiKey?: string; chain?: string };
  /** DexScreener baseUrl */
  dexscreener?: { baseUrl?: string };
  /** Shared resilience options (timeout, maxRetries) - circuitBreaker is set automatically */
  resilience?: Omit<ResilientFetchOptions, "circuitBreaker" | "adapterId">;
  /** Enable 60s TTL fallback cache. On adapter failure, return cached data if not expired. */
  useFallbackCache?: boolean;
}

export interface AdaptersWithCbResult {
  circuitBreaker: CircuitBreaker;
  dexpaprika: DexPaprikaClient;
  moralis: MoralisClient;
  dexscreener: DexScreenerClient;
}

/**
 * Creates CircuitBreaker and HTTP adapters with circuit breaker wired.
 * Consecutive failures open the breaker; requireHealthy blocks when open (fail-closed).
 * When useFallbackCache=true, adapter failures return cached data when available.
 * Canonical paper/runtime roles are defined separately:
 * DexScreener = primary discovery, DexPaprika = primary market, RPC = primary wallet source,
 * Moralis = fallback-only wallet/holder/search, DexCheck = optional intelligence-only.
 */
export function createAdaptersWithCircuitBreaker(
  config: AdaptersWithCbConfig = {}
): AdaptersWithCbResult {
  const cb = new CircuitBreaker([...ADAPTER_IDS], config.circuitBreakerConfig, config.clock);

  const resilience = config.resilience ?? {};
  const dexpaprikaRaw = new DexPaprikaClient({
    ...config.dexpaprika,
    resilience: { ...resilience, circuitBreaker: cb, adapterId: "dexpaprika" },
  });
  const moralisRaw = new MoralisClient({
    ...config.moralis,
    resilience: { ...resilience, circuitBreaker: cb, adapterId: "moralis" },
  });
  const dexscreenerRaw = new DexScreenerClient({
    ...config.dexscreener,
    resilience: { ...resilience, circuitBreaker: cb, adapterId: "dexscreener" },
  });

  let dexpaprika: DexPaprikaClient = dexpaprikaRaw;
  let moralis: MoralisClient = moralisRaw;
  let dexscreener: DexScreenerClient = dexscreenerRaw;

  if (config.useFallbackCache) {
    const dpCache = createFallbackCache<unknown>(FALLBACK_CACHE_TTL_MS);
    const moralisCache = createFallbackCache<unknown>(FALLBACK_CACHE_TTL_MS);
    const dsCache = createFallbackCache<unknown>(FALLBACK_CACHE_TTL_MS);

    dexpaprika = {
      ...dexpaprikaRaw,
      getToken: (id) => withFallbackCache(dpCache, `dexpaprika:token:${id}`, () => dexpaprikaRaw.getToken(id)),
      getTokenPools: (id) => withFallbackCache(dpCache, `dexpaprika:pools:${id}`, () => dexpaprikaRaw.getTokenPools(id)),
      getPools: (limit) => withFallbackCache(dpCache, `dexpaprika:pools:limit:${limit}`, () => dexpaprikaRaw.getPools(limit)),
    } as DexPaprikaClient;

    moralis = {
      ...moralisRaw,
      getTokenBalances: (addr) => withFallbackCache(moralisCache, `moralis:balances:${addr}`, () => moralisRaw.getTokenBalances(addr)),
    } as MoralisClient;

    dexscreener = {
      ...dexscreenerRaw,
      getTokenPairs: (addr) => withFallbackCache(dsCache, `dexscreener:pairs:${addr}`, () => dexscreenerRaw.getTokenPairs(addr)),
      getPair: (c, p) => withFallbackCache(dsCache, `dexscreener:pair:${c}:${p}`, () => dexscreenerRaw.getPair(c, p)),
      search: (q) => withFallbackCache(dsCache, `dexscreener:search:${q}`, () => dexscreenerRaw.search(q)),
    } as DexScreenerClient;
  }

  return { circuitBreaker: cb, dexpaprika, moralis, dexscreener };
}
