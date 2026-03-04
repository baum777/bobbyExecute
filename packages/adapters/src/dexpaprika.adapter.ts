import { AdapterPairV1Schema, type AdapterPairV1 } from "@reducedmode/contracts";
import { HttpClient } from "./http/http.client.js";

interface DexPaprikaResponse {
  data?: Array<Record<string, unknown>>;
}

export interface DexPaprikaAdapter {
  fetchSolanaTrending(limit: number): Promise<AdapterPairV1[]>;
  fetchSolanaTopVolume(limit: number): Promise<AdapterPairV1[]>;
  fetchTokenOrPairDetails(id: string): Promise<AdapterPairV1 | null>;
}

interface MetricsLike {
  counter(name: string, value?: number, labels?: Record<string, string>): void;
  histogram(name: string, value: number, labels?: Record<string, string>): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
}

export class DexPaprikaAdapterImpl implements DexPaprikaAdapter {
  private readonly baseUrl = "https://api.dexpaprika.com/v1";
  private readonly httpClient: HttpClient;
  private cache: AdapterPairV1[] = buildSeedPairs(40);

  constructor(httpClient?: HttpClient, private readonly metrics?: MetricsLike) {
    this.httpClient = httpClient ?? new HttpClient();
  }

  async fetchSolanaTrending(limit: number): Promise<AdapterPairV1[]> {
    return this.fetchWithFallback(
      `${this.baseUrl}/solana/trending`,
      `${this.baseUrl}/solana/featured`,
      limit,
      0,
    );
  }

  async fetchSolanaTopVolume(limit: number): Promise<AdapterPairV1[]> {
    return this.fetchWithFallback(
      `${this.baseUrl}/solana/top-volume`,
      `${this.baseUrl}/solana/volumes`,
      limit,
      Math.max(1, limit),
    );
  }

  async fetchTokenOrPairDetails(id: string): Promise<AdapterPairV1 | null> {
    try {
      const res = await this.httpClient.request<DexPaprikaResponse>({
        url: `${this.baseUrl}/solana/details/${id}`,
      });
      const mapped = this.mapRows(res.data.data ?? [], 1)[0];
      return mapped ?? null;
    } catch {
      this.httpClient.onFailure();
      return this.cache.find((x) => x.pair_id === id || x.contract_address === id) ?? null;
    }
  }

  resolveContractAddress(pair: Pick<AdapterPairV1, "contract_address">): string | null {
    if (!pair.contract_address || pair.contract_address.trim().length === 0) return null;
    return pair.contract_address;
  }

  breakerState() {
    return this.httpClient.breakerSnapshot();
  }

  private async fetchWithFallback(
    primaryUrl: string,
    alternateUrl: string,
    limit: number,
    fallbackOffset: number,
  ): Promise<AdapterPairV1[]> {
    const startedAt = Date.now();
    const normalizedLimit = Math.max(1, limit);
    try {
      const primary = await this.httpClient.request<DexPaprikaResponse>({
        url: primaryUrl,
        query: { limit: normalizedLimit },
      });
      const mappedPrimary = this.mapRows(primary.data.data ?? [], normalizedLimit);
      if (mappedPrimary.length > 0) {
        this.cache = mappedPrimary;
        this.metrics?.counter("adapters.requests", 1, { source: "dexpaprika", status: "ok" });
        this.metrics?.histogram("adapters.latency_ms", Date.now() - startedAt, { source: "dexpaprika" });
        this.metrics?.gauge("adapters.response_count", mappedPrimary.length, { source: "dexpaprika" });
        return mappedPrimary;
      }
      throw new Error("DexPaprika primary response empty");
    } catch {
      this.httpClient.onFailure();
      try {
        const alt = await this.httpClient.request<DexPaprikaResponse>({
          url: alternateUrl,
          query: { limit: normalizedLimit },
        });
        const mappedAlt = this.mapRows(alt.data.data ?? [], normalizedLimit);
        if (mappedAlt.length > 0) {
          this.cache = mappedAlt;
          this.metrics?.counter("adapters.requests", 1, { source: "dexpaprika", status: "recovered" });
          this.metrics?.histogram("adapters.latency_ms", Date.now() - startedAt, { source: "dexpaprika" });
          this.metrics?.gauge("adapters.response_count", mappedAlt.length, { source: "dexpaprika" });
          return mappedAlt;
        }
        throw new Error("DexPaprika alternate response empty");
      } catch {
        this.httpClient.onFailure();
        const fallback = sliceWithWrap(this.cache, normalizedLimit, fallbackOffset);
        this.metrics?.counter("adapters.requests", 1, { source: "dexpaprika", status: "cache_fallback" });
        this.metrics?.histogram("adapters.latency_ms", Date.now() - startedAt, { source: "dexpaprika" });
        this.metrics?.gauge("adapters.response_count", fallback.length, {
          source: "dexpaprika",
        });
        return fallback;
      }
    }
  }

  private mapRows(rows: Array<Record<string, unknown>>, limit: number): AdapterPairV1[] {
    return rows
      .slice(0, limit)
      .map((row, index) => this.toPair(row, index))
      .filter((v): v is AdapterPairV1 => v !== null);
  }

  private toPair(row: Record<string, unknown>, index: number): AdapterPairV1 | null {
    const pairCandidate: AdapterPairV1 = {
      source: "dexpaprika",
      pair_id: (row.pairId as string | undefined) ?? `DP-PAIR-${index}`,
      contract_address: (row.contractAddress as string | undefined) ?? null,
      base_symbol: (row.symbol as string | undefined) ?? `DP${index}`,
      quote_symbol: (row.quoteSymbol as string | undefined) ?? "USDC",
      price_usd: toNumberOrNull(row.priceUsd),
      liquidity_usd: toNumberOrNull(row.liquidityUsd),
      volume_24h_usd: toNumberOrNull(row.volume24hUsd),
      txns_24h: toIntOrNull(row.txns24h),
      fetched_at: new Date().toISOString(),
      raw: row,
    };
    const parsed = AdapterPairV1Schema.safeParse(pairCandidate);
    return parsed.success ? parsed.data : null;
  }
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function toIntOrNull(value: unknown): number | null {
  const numberValue = toNumberOrNull(value);
  if (numberValue === null) return null;
  return Math.max(0, Math.round(numberValue));
}

function buildSeedPairs(count: number): AdapterPairV1[] {
  const out: AdapterPairV1[] = [];
  for (let i = 1; i <= count; i += 1) {
    out.push(
      AdapterPairV1Schema.parse({
        source: "dexpaprika",
        pair_id: `DP-PAIR-${i}`,
        contract_address: `DPContract${String(i).padStart(4, "0")}`,
        base_symbol: `DP${i}`,
        quote_symbol: "USDC",
        price_usd: Number((0.015 + i * 0.004).toFixed(6)),
        liquidity_usd: 4_500 + i * 650,
        volume_24h_usd: 1_800 + i * 550,
        txns_24h: 45 + i * 2,
        fetched_at: new Date().toISOString(),
        raw: { seed: true, index: i },
      }),
    );
  }
  return out;
}

function sliceWithWrap(items: AdapterPairV1[], limit: number, offset: number): AdapterPairV1[] {
  if (items.length === 0) return [];
  const start = Math.max(0, offset % items.length);
  const firstChunk = items.slice(start, start + limit);
  if (firstChunk.length === limit) return firstChunk;
  const missing = limit - firstChunk.length;
  return [...firstChunk, ...items.slice(0, missing)];
}
