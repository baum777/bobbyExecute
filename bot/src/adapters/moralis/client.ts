/**
 * Moralis API client - wallet/portfolio layer.
 * PROPOSED - fetches wallet balances, token transfers.
 */
import { sha256 } from "../../core/determinism/hash.js";
import {
  resilientFetch,
  type ResilientFetchOptions,
} from "../http-resilience.js";
import { validateFreshness } from "../freshness.js";

const BASE_URL = "https://solana-gateway.moralis.io";
const DEFAULT_MAX_STALENESS_MS = 30_000;
const MORALIS_API_KEY_HEADER = "X-Api-Key";

export interface MoralisClientConfig {
  baseUrl?: string;
  apiKey?: string;
  chain?: string;
  resilience?: ResilientFetchOptions;
  maxStalenessMs?: number;
}

export class MoralisClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly chain: string;
  private readonly resilience: ResilientFetchOptions | undefined;
  private readonly maxStalenessMs: number;

  constructor(config: MoralisClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? BASE_URL;
    this.apiKey = config.apiKey ?? "";
    this.chain = config.chain ?? "solana";
    this.resilience = config.resilience;
    this.maxStalenessMs = config.maxStalenessMs ?? DEFAULT_MAX_STALENESS_MS;
  }

  private headers(): Record<string, string> {
    const apiKey = this.apiKey.trim();
    if (!apiKey) {
      throw new Error(
        "Moralis API key missing: set MORALIS_API_KEY to use Moralis requests."
      );
    }

    return {
      "Content-Type": "application/json",
      [MORALIS_API_KEY_HEADER]: apiKey,
    };
  }

  private async _fetch(url: string): Promise<Response> {
    return resilientFetch(url, { headers: this.headers() }, {
      ...this.resilience,
      adapterId: this.resilience?.adapterId ?? "moralis",
    });
  }

  /** EVM: GET /wallets/{address}/tokens */
  async getTokenBalances(address: string): Promise<unknown> {
    if (this.chain === "solana") {
      const url = `${this.baseUrl}/account/mainnet/${address}/tokens`;
      const res = await this._fetch(url);
      if (!res.ok) throw new Error(`Moralis error: ${res.status} ${res.statusText}`);
      const raw = await res.json();
      validateFreshness(raw, this.maxStalenessMs);
      return raw;
    }

    const url = `${this.baseUrl}/wallets/${address}/tokens?chain=${this.chain}`;
    const res = await this._fetch(url);
    if (!res.ok) throw new Error(`Moralis error: ${res.status} ${res.statusText}`);
    const raw = await res.json();
    validateFreshness(raw, this.maxStalenessMs);
    return raw;
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
