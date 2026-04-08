/**
 * DexPaprika API client.
 * PROPOSED - DEX layer for pricing, pools, liquidity.
 */
import { sha256 } from "../../core/determinism/hash.js";
import {
  resilientFetch,
  type ResilientFetchOptions,
} from "../http-resilience.js";
import { validateFreshness } from "../freshness.js";

const BASE_URL = "https://api.dexpaprika.com";
const DEFAULT_MAX_STALENESS_MS = 30_000;

export interface DexPaprikaClientConfig {
  baseUrl?: string;
  network?: string;
  resilience?: ResilientFetchOptions;
  maxStalenessMs?: number;
}

export class DexPaprikaClient {
  private readonly baseUrl: string;
  private readonly network: string;
  private readonly resilience: ResilientFetchOptions | undefined;
  private readonly maxStalenessMs: number;

  constructor(config: DexPaprikaClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? BASE_URL;
    this.network = config.network ?? "solana";
    this.resilience = config.resilience;
    this.maxStalenessMs = config.maxStalenessMs ?? DEFAULT_MAX_STALENESS_MS;
  }

  private async _fetch(url: string): Promise<Response> {
    return resilientFetch(url, undefined, {
      ...this.resilience,
      adapterId: this.resilience?.adapterId ?? "dexpaprika",
    });
  }

  async getToken(tokenId: string): Promise<unknown> {
    const url = `${this.baseUrl}/networks/${this.network}/tokens/${tokenId}`;
    const res = await this._fetch(url);
    if (!res.ok) throw new Error(`DexPaprika error: ${res.status} ${res.statusText}`);
    const raw = await res.json();
    validateFreshness(raw, this.maxStalenessMs);
    return raw;
  }

  async getTokenPools(tokenId: string): Promise<unknown> {
    const url = `${this.baseUrl}/networks/${this.network}/tokens/${tokenId}/pools`;
    const res = await this._fetch(url);
    if (!res.ok) throw new Error(`DexPaprika error: ${res.status} ${res.statusText}`);
    const raw = await res.json();
    if (Array.isArray(raw)) {
      raw.forEach((item: unknown) => validateFreshness(item, this.maxStalenessMs));
    } else {
      validateFreshness(raw, this.maxStalenessMs);
    }
    return raw;
  }

  async getTokenPoolsWithHash(tokenId: string): Promise<{
    raw: unknown;
    rawPayloadHash: string;
  }> {
    const raw = await this.getTokenPools(tokenId);
    const rawPayloadHash = sha256(JSON.stringify(raw));
    return { raw, rawPayloadHash };
  }

  async getPools(limit = 10): Promise<unknown> {
    const url = `${this.baseUrl}/networks/${this.network}/pools?limit=${limit}`;
    const res = await this._fetch(url);
    if (!res.ok) throw new Error(`DexPaprika error: ${res.status} ${res.statusText}`);
    const raw = await res.json();
    if (Array.isArray(raw)) {
      raw.forEach((item: unknown) => validateFreshness(item, this.maxStalenessMs));
    } else {
      validateFreshness(raw, this.maxStalenessMs);
    }
    return raw;
  }

  async getPool(poolAddress: string): Promise<unknown> {
    const url = `${this.baseUrl}/networks/${this.network}/pools/${poolAddress}`;
    const res = await this._fetch(url);
    if (!res.ok) throw new Error(`DexPaprika error: ${res.status} ${res.statusText}`);
    const raw = await res.json();
    validateFreshness(raw, this.maxStalenessMs);
    return raw;
  }

  async getPoolWithHash(poolAddress: string): Promise<{
    raw: unknown;
    rawPayloadHash: string;
  }> {
    const raw = await this.getPool(poolAddress);
    const rawPayloadHash = sha256(JSON.stringify(raw));
    return { raw, rawPayloadHash };
  }

  async getPoolOhlcv(poolAddress: string): Promise<unknown> {
    const url = `${this.baseUrl}/networks/${this.network}/pools/${poolAddress}/ohlcv`;
    const res = await this._fetch(url);
    if (!res.ok) throw new Error(`DexPaprika error: ${res.status} ${res.statusText}`);
    const raw = await res.json();
    validateFreshness(raw, this.maxStalenessMs);
    return raw;
  }

  async getPoolOhlcvWithHash(poolAddress: string): Promise<{
    raw: unknown;
    rawPayloadHash: string;
  }> {
    const raw = await this.getPoolOhlcv(poolAddress);
    const rawPayloadHash = sha256(JSON.stringify(raw));
    return { raw, rawPayloadHash };
  }

  async getPoolTransactions(poolAddress: string): Promise<unknown> {
    const url = `${this.baseUrl}/networks/${this.network}/pools/${poolAddress}/transactions`;
    const res = await this._fetch(url);
    if (!res.ok) throw new Error(`DexPaprika error: ${res.status} ${res.statusText}`);
    const raw = await res.json();
    validateFreshness(raw, this.maxStalenessMs);
    return raw;
  }

  async getPoolTransactionsWithHash(poolAddress: string): Promise<{
    raw: unknown;
    rawPayloadHash: string;
  }> {
    const raw = await this.getPoolTransactions(poolAddress);
    const rawPayloadHash = sha256(JSON.stringify(raw));
    return { raw, rawPayloadHash };
  }

  /** Returns raw response + hash for audit. */
  async getTokenWithHash(tokenId: string): Promise<{
    raw: unknown;
    rawPayloadHash: string;
  }> {
    const raw = await this.getToken(tokenId);
    const rawPayloadHash = sha256(JSON.stringify(raw));
    return { raw, rawPayloadHash };
  }
}
