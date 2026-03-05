import type { TokenSourceSnapshotV1 } from "@bobby/contracts";
import { HttpClient, type HttpClientConfig } from "./http.client.js";

const BASE_URL = "https://api.dexscreener.com";

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string;
  txns: { h24: { buys: number; sells: number } };
  volume: { h24: number };
  priceChange: { h24: number };
  liquidity: { usd: number };
  fdv: number;
  marketCap: number;
}

export interface AdapterResult<T> {
  ok: boolean;
  data: T | null;
  error?: string;
  source: string;
}

export class DexScreenerAdapter {
  private readonly client: HttpClient;

  constructor(clientConfig?: HttpClientConfig) {
    this.client = new HttpClient({ name: "dexscreener", defaultTimeoutMs: 8000, ...clientConfig });
  }

  getBreakerState() { return this.client.getBreakerState(); }
  getBreakerStats() { return this.client.getBreakerStats(); }

  async fetchTrendingPairs(target: number): Promise<AdapterResult<DexScreenerPair[]>> {
    try {
      const resp = await this.client.requestJson<DexScreenerPair[]>({
        url: `${BASE_URL}/token-boosts/top/v1`,
        query: { chainId: "solana" },
      });
      const solanaPairs = (resp.data ?? []).filter((p) => p.chainId === "solana");
      return { ok: true, data: solanaPairs.slice(0, target), source: "dexscreener" };
    } catch (err) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err), source: "dexscreener" };
    }
  }

  async fetchPairDetails(pairId: string): Promise<AdapterResult<DexScreenerPair | null>> {
    try {
      const resp = await this.client.requestJson<{ pairs?: DexScreenerPair[] }>({
        url: `${BASE_URL}/latest/dex/pairs/solana/${pairId}`,
      });
      return { ok: true, data: resp.data.pairs?.[0] ?? null, source: "dexscreener" };
    } catch (err) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err), source: "dexscreener" };
    }
  }

  resolveContractAddressFromPair(pair: DexScreenerPair): string | null {
    return pair.baseToken?.address || null;
  }

  pairToSnapshot(pair: DexScreenerPair, fetchedAt: string): TokenSourceSnapshotV1 {
    return {
      token_ref: {
        symbol: pair.baseToken?.symbol ?? "UNKNOWN",
        name: pair.baseToken?.name ?? "Unknown",
        contract_address: pair.baseToken?.address ?? "",
        source: "dexscreener",
        pair_id: pair.pairAddress,
      },
      source: "dexscreener",
      price_usd: safeNum(pair.priceUsd),
      volume_24h: pair.volume?.h24 ?? null,
      liquidity_usd: pair.liquidity?.usd ?? null,
      fdv: pair.fdv ?? null,
      market_cap_usd: pair.marketCap ?? null,
      price_change_24h_pct: pair.priceChange?.h24 ?? null,
      tx_count_24h: pair.txns?.h24 ? pair.txns.h24.buys + pair.txns.h24.sells : null,
      fetched_at: fetchedAt,
      raw: pair as unknown as Record<string, unknown>,
    };
  }
}

function safeNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
