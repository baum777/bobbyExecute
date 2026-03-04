import { AdapterPairV1Schema, type AdapterPairV1 } from "@reducedmode/contracts";
import { HttpClient } from "./http/http.client.js";

interface DexScreenerSearchResponse {
  pairs?: Array<Record<string, unknown>>;
}

export interface DexScreenerAdapter {
  fetchTrendingSolanaPairs(limit: number): Promise<AdapterPairV1[]>;
  fetchPairDetails(pairId: string): Promise<AdapterPairV1 | null>;
}

interface MetricsLike {
  counter(name: string, value?: number, labels?: Record<string, string>): void;
  histogram(name: string, value: number, labels?: Record<string, string>): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
}

export class DexScreenerAdapterImpl implements DexScreenerAdapter {
  private readonly baseUrl = "https://api.dexscreener.com";
  private readonly httpClient: HttpClient;
  private cache: AdapterPairV1[] = buildSeedPairs("dexscreener", "DS", 40);

  constructor(httpClient?: HttpClient, private readonly metrics?: MetricsLike) {
    this.httpClient = httpClient ?? new HttpClient();
  }

  async fetchTrendingSolanaPairs(limit: number): Promise<AdapterPairV1[]> {
    const startedAt = Date.now();
    const normalizedLimit = Math.max(1, limit);
    const primaryUrl = `${this.baseUrl}/latest/dex/search`;
    const alternateUrl = `${this.baseUrl}/token-profiles/latest/v1`;

    try {
      const res = await this.httpClient.request<DexScreenerSearchResponse>({
        url: primaryUrl,
        query: { q: "solana", limit: normalizedLimit },
      });
      const mapped = this.mapSearch(res.data, normalizedLimit);
      if (mapped.length > 0) {
        this.cache = mapped;
        this.metrics?.counter("adapters.requests", 1, { source: "dexscreener", status: "ok" });
        this.metrics?.histogram("adapters.latency_ms", Date.now() - startedAt, { source: "dexscreener" });
        this.metrics?.gauge("adapters.response_count", mapped.length, { source: "dexscreener" });
        return mapped;
      }
      throw new Error("DexScreener primary response empty");
    } catch {
      this.httpClient.onFailure();
      try {
        const res = await this.httpClient.request<DexScreenerSearchResponse>({
          url: alternateUrl,
          query: { chainId: "solana", limit: normalizedLimit },
        });
        const mapped = this.mapSearch(res.data, normalizedLimit);
        if (mapped.length > 0) {
          this.cache = mapped;
          this.metrics?.counter("adapters.requests", 1, { source: "dexscreener", status: "recovered" });
          this.metrics?.histogram("adapters.latency_ms", Date.now() - startedAt, { source: "dexscreener" });
          this.metrics?.gauge("adapters.response_count", mapped.length, { source: "dexscreener" });
          return mapped;
        }
        throw new Error("DexScreener alternate response empty");
      } catch {
        this.httpClient.onFailure();
        this.metrics?.counter("adapters.requests", 1, { source: "dexscreener", status: "cache_fallback" });
        this.metrics?.histogram("adapters.latency_ms", Date.now() - startedAt, { source: "dexscreener" });
        this.metrics?.gauge("adapters.response_count", this.cache.slice(0, normalizedLimit).length, {
          source: "dexscreener",
        });
        return this.cache.slice(0, normalizedLimit);
      }
    }
  }

  async fetchPairDetails(pairId: string): Promise<AdapterPairV1 | null> {
    try {
      const res = await this.httpClient.request<DexScreenerSearchResponse>({
        url: `${this.baseUrl}/latest/dex/pairs/solana/${pairId}`,
      });
      const first = this.mapSearch(res.data, 1)[0];
      return first ?? null;
    } catch {
      this.httpClient.onFailure();
      return this.cache.find((p) => p.pair_id === pairId) ?? null;
    }
  }

  resolveContractAddress(pair: Pick<AdapterPairV1, "contract_address">): string | null {
    if (!pair.contract_address || pair.contract_address.trim().length === 0) return null;
    return pair.contract_address;
  }

  breakerState() {
    return this.httpClient.breakerSnapshot();
  }

  private mapSearch(response: DexScreenerSearchResponse, limit: number): AdapterPairV1[] {
    const pairs = Array.isArray(response.pairs) ? response.pairs : [];
    return pairs
      .slice(0, limit)
      .map((raw, idx) => this.toPair(raw, idx))
      .filter((v): v is AdapterPairV1 => v !== null);
  }

  private toPair(raw: Record<string, unknown>, idx: number): AdapterPairV1 | null {
    const contractAddress = tryString(raw.baseToken, "address");
    const symbol = tryString(raw.baseToken, "symbol") ?? `DS${idx}`;
    const pairId = (raw.pairAddress as string | undefined) ?? `${symbol}-pair-${idx}`;
    const pairCandidate: AdapterPairV1 = {
      source: "dexscreener",
      pair_id: pairId,
      contract_address: contractAddress ?? null,
      base_symbol: symbol,
      quote_symbol: tryString(raw.quoteToken, "symbol") ?? "USDC",
      price_usd: toNumberOrNull(raw.priceUsd),
      liquidity_usd: toNumberOrNull((raw.liquidity as { usd?: unknown } | undefined)?.usd),
      volume_24h_usd: toNumberOrNull((raw.volume as { h24?: unknown } | undefined)?.h24),
      txns_24h: toNumberOrNull((raw.txns as { h24?: { buys?: unknown; sells?: unknown } } | undefined)?.h24?.buys ?? 0) !== null
        ? Math.round(
            (toNumberOrNull((raw.txns as { h24?: { buys?: unknown; sells?: unknown } } | undefined)?.h24?.buys) ?? 0) +
              (toNumberOrNull((raw.txns as { h24?: { buys?: unknown; sells?: unknown } } | undefined)?.h24?.sells) ?? 0),
          )
        : null,
      fetched_at: new Date().toISOString(),
      raw,
    };

    const parsed = AdapterPairV1Schema.safeParse(pairCandidate);
    return parsed.success ? parsed.data : null;
  }
}

function toNumberOrNull(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim().length > 0) {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function tryString(input: unknown, key: string): string | null {
  if (!input || typeof input !== "object") return null;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function buildSeedPairs(
  source: "dexscreener" | "dexpaprika",
  prefix: "DS" | "DP",
  count: number,
): AdapterPairV1[] {
  const out: AdapterPairV1[] = [];
  for (let i = 1; i <= count; i += 1) {
    out.push(
      AdapterPairV1Schema.parse({
        source,
        pair_id: `${prefix}-PAIR-${i}`,
        contract_address: `${prefix}Contract${String(i).padStart(4, "0")}`,
        base_symbol: `${prefix}${i}`,
        quote_symbol: "USDC",
        price_usd: Number((0.01 + i * 0.005).toFixed(6)),
        liquidity_usd: 5_000 + i * 700,
        volume_24h_usd: 2_000 + i * 600,
        txns_24h: 50 + i * 2,
        fetched_at: new Date().toISOString(),
        raw: { seed: true, index: i },
      }),
    );
  }
  return out;
}
