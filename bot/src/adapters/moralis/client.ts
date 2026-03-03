/**
 * Moralis API client - wallet/portfolio layer.
 * PROPOSED - fetches wallet balances, token transfers.
 */
import { sha256 } from "../../core/determinism/hash.js";

const BASE_URL = "https://deep-index.moralis.io/api/v2.2";

export interface MoralisClientConfig {
  baseUrl?: string;
  apiKey?: string;
  chain?: string;
}

export class MoralisClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly chain: string;

  constructor(config: MoralisClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? BASE_URL;
    this.apiKey = config.apiKey ?? "";
    this.chain = config.chain ?? "solana";
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) {
      h["X-API-Key"] = this.apiKey;
    }
    return h;
  }

  /** EVM: GET /wallets/{address}/tokens */
  async getTokenBalances(address: string): Promise<unknown> {
    const url = `${this.baseUrl}/wallets/${address}/tokens?chain=${this.chain}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`Moralis error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /** Returns raw response + hash for audit. */
  async getBalancesWithHash(address: string): Promise<{
    raw: unknown;
    rawPayloadHash: string;
  }> {
    const raw = await this.getTokenBalances(address);
    const rawPayloadHash = sha256(JSON.stringify(raw));
    return { raw, rawPayloadHash };
  }
}
