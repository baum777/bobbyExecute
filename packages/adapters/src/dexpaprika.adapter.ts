import type { TokenSourceSnapshotV1 } from "@bobby/contracts";
import { HttpClient, type HttpClientConfig } from "./http/http.client.js";

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

export class DexPaprikaAdapter {
  private readonly client: HttpClient;

  constructor(clientConfig?: HttpClientConfig) {
    this.client = new HttpClient({
      name: "dexpaprika",
      defaultTimeoutMs: 8000,
      ...clientConfig,
    });
  }

  getBreakerState() {
    return this.client.getBreakerState();
  }

  async fetchSolanaTrending(limit: number): Promise<DexPaprikaToken[]> {
    const resp = await this.client.request<DexPaprikaToken[]>({
      url: `${BASE_URL}/networks/solana/tokens/trending`,
      query: { limit },
    });
    return (resp.data ?? []).slice(0, limit);
  }

  async fetchSolanaTopVolume(limit: number): Promise<DexPaprikaToken[]> {
    const resp = await this.client.request<DexPaprikaToken[]>({
      url: `${BASE_URL}/networks/solana/tokens/top-volume`,
      query: { limit },
    });
    return (resp.data ?? []).slice(0, limit);
  }

  async fetchTokenOrPairDetails(id: string): Promise<DexPaprikaToken | null> {
    const resp = await this.client.request<DexPaprikaToken>({
      url: `${BASE_URL}/networks/solana/tokens/${id}`,
    });
    return resp.data ?? null;
  }

  tokenToSnapshot(token: DexPaprikaToken, fetchedAt: string): TokenSourceSnapshotV1 {
    const contractAddress = token.address ?? "";
    return {
      token_ref: {
        symbol: token.symbol ?? "UNKNOWN",
        name: token.name ?? "Unknown",
        contract_address: contractAddress,
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
