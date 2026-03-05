import type { TokenSourceSnapshotV1 } from "@bobby/contracts";
import { HttpClient, type HttpClientConfig } from "./http.client.js";

const BASE_URL = "https://api.dexpaprika.com";

export interface DexPaprikaToken {
  id: string;
  name: string;
  symbol: string;
  address?: string;
  chain?: string;
  price_usd?: number;
  volume_24h_usd?: number;
  liquidity_usd?: number;
  fdv?: number;
  market_cap_usd?: number;
  price_change_24h_pct?: number;
  tx_count_24h?: number;
}

export interface AdapterResult<T> {
  ok: boolean;
  data: T | null;
  error?: string;
  source: string;
}

export class DexPaprikaAdapter {
  private readonly client: HttpClient;

  constructor(clientConfig?: HttpClientConfig) {
    this.client = new HttpClient({ name: "dexpaprika", defaultTimeoutMs: 8000, ...clientConfig });
  }

  getBreakerState() { return this.client.getBreakerState(); }
  getBreakerStats() { return this.client.getBreakerStats(); }

  async fetchPairsMix(target: number): Promise<{ trending: AdapterResult<DexPaprikaToken[]>; volume: AdapterResult<DexPaprikaToken[]> }> {
    const half = Math.ceil(target / 2);
    const [trending, volume] = await Promise.all([
      this.fetchSolanaTrending(half),
      this.fetchSolanaTopVolume(half),
    ]);
    return { trending, volume };
  }

  async fetchSolanaTrending(limit: number): Promise<AdapterResult<DexPaprikaToken[]>> {
    try {
      const resp = await this.client.requestJson<DexPaprikaToken[]>({
        url: `${BASE_URL}/networks/solana/tokens/trending`,
        query: { limit },
      });
      return { ok: true, data: (resp.data ?? []).slice(0, limit), source: "dexpaprika" };
    } catch (err) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err), source: "dexpaprika" };
    }
  }

  async fetchSolanaTopVolume(limit: number): Promise<AdapterResult<DexPaprikaToken[]>> {
    try {
      const resp = await this.client.requestJson<DexPaprikaToken[]>({
        url: `${BASE_URL}/networks/solana/tokens/top-volume`,
        query: { limit },
      });
      return { ok: true, data: (resp.data ?? []).slice(0, limit), source: "dexpaprika" };
    } catch (err) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err), source: "dexpaprika" };
    }
  }

  async fetchPairDetails(pairId: string): Promise<AdapterResult<DexPaprikaToken | null>> {
    try {
      const resp = await this.client.requestJson<DexPaprikaToken>({
        url: `${BASE_URL}/networks/solana/tokens/${pairId}`,
      });
      return { ok: true, data: resp.data ?? null, source: "dexpaprika" };
    } catch (err) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err), source: "dexpaprika" };
    }
  }

  resolveContractAddress(token: DexPaprikaToken): string | null {
    return token.address || null;
  }

  tokenToSnapshot(token: DexPaprikaToken, fetchedAt: string): TokenSourceSnapshotV1 {
    return {
      token_ref: {
        symbol: token.symbol ?? "UNKNOWN",
        name: token.name ?? "Unknown",
        contract_address: token.address ?? "",
        source: "dexpaprika",
        pair_id: token.id,
      },
      source: "dexpaprika",
      price_usd: token.price_usd ?? null,
      volume_24h: token.volume_24h_usd ?? null,
      liquidity_usd: token.liquidity_usd ?? null,
      fdv: token.fdv ?? null,
      market_cap_usd: token.market_cap_usd ?? null,
      price_change_24h_pct: token.price_change_24h_pct ?? null,
      tx_count_24h: token.tx_count_24h ?? null,
      fetched_at: fetchedAt,
      raw: token as unknown as Record<string, unknown>,
    };
  }
}
