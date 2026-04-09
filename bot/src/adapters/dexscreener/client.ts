/**
 * DexScreener API Client
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: adapters/dexscreener | Last Updated: 2026-03-05
 * 
 * Provides access to DexScreener API endpoints for token and pair data.
 * All methods include SHA-256 hash generation for audit trail integrity.
 * 
 * API Documentation: https://docs.dexscreener.com/api/reference
 */
import { sha256 } from "../../core/determinism/hash.js";
import {
  resilientFetch,
  type ResilientFetchOptions,
} from "../http-resilience.js";
import { validateFreshness } from "../freshness.js";
import type {
  DexScreenerTokenResponse,
  DexScreenerPairInfo,
  DexScreenerLatestBoostedResponse,
  DexScreenerTopBoostedResponse,
} from "./types.js";

const BASE_URL = "https://api.dexscreener.com/latest";
const DEFAULT_MAX_STALENESS_MS = 30_000;

export interface DexScreenerClientConfig {
  baseUrl?: string;
  apiKey?: string; // For future use if API requires auth
  resilience?: ResilientFetchOptions;
  maxStalenessMs?: number;
}

export class DexScreenerClient {
  private readonly baseUrl: string;
  private readonly resilience: ResilientFetchOptions | undefined;
  private readonly maxStalenessMs: number;

  constructor(config: DexScreenerClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? BASE_URL;
    this.resilience = config.resilience;
    this.maxStalenessMs = config.maxStalenessMs ?? DEFAULT_MAX_STALENESS_MS;
  }

  private async _fetch(url: string): Promise<Response> {
    return resilientFetch(url, undefined, {
      ...this.resilience,
      adapterId: this.resilience?.adapterId ?? "dexscreener",
    });
  }

  private getApiBaseUrl(): string {
    return this.baseUrl.replace(/\/latest$/, "");
  }

  private validateResponseFreshness(raw: DexScreenerTokenResponse): void {
    const pairs = raw?.pairs;
    if (Array.isArray(pairs)) {
      pairs.forEach((p) => validateFreshness(p, this.maxStalenessMs));
    }
  }

  /**
   * Get token pairs by token address
   * GET /latest/dex/tokens/{tokenAddress}
   * 
   * Returns all pairs matching the token address across all DEXes
   */
  async getTokenPairs(tokenAddress: string): Promise<DexScreenerTokenResponse> {
    return this.getTokenPairsV1("solana", tokenAddress);
  }

  /**
   * Get token pairs for a token on a specific chain.
   * GET /token-pairs/v1/{chainId}/{tokenAddress}
   */
  async getTokenPairsV1(chainId: string, tokenAddress: string): Promise<DexScreenerTokenResponse> {
    const url = `${this.getApiBaseUrl()}/token-pairs/v1/${chainId}/${tokenAddress}`;
    const res = await this._fetch(url);
    if (!res.ok) {
      throw new Error(`DexScreener error: ${res.status} ${res.statusText}`);
    }
    const raw = this.normalizeTokenPairsResponse(await res.json());
    this.validateResponseFreshness(raw);
    return raw;
  }

  /**
   * Batch token lookup for one or more addresses.
   * GET /latest/dex/tokens/v1/{chainId}/{tokenAddresses}
   */
  async getTokensV1(chainId: string, tokenAddresses: readonly string[]): Promise<DexScreenerTokenResponse> {
    const tokenList = tokenAddresses.map((token) => token.trim()).filter(Boolean).join(",");
    const url = `${this.baseUrl}/dex/tokens/v1/${chainId}/${tokenList}`;
    const res = await this._fetch(url);
    if (!res.ok) {
      throw new Error(`DexScreener error: ${res.status} ${res.statusText}`);
    }
    const raw = (await res.json()) as DexScreenerTokenResponse;
    this.validateResponseFreshness(raw);
    return raw;
  }

  /**
   * Get specific pair by chain and pair address
   * GET /latest/dex/pairs/{chainId}/{pairId}
   * 
   * Returns detailed information about a specific trading pair
   */
  async getPair(chainId: string, pairId: string): Promise<{ pair: DexScreenerPairInfo | null }> {
    return this.getPairLatest(chainId, pairId);
  }

  /**
   * Get specific pair by chain and pair address.
   * GET /latest/dex/pairs/{chainId}/{pairId}
   */
  async getPairLatest(chainId: string, pairId: string): Promise<{ pair: DexScreenerPairInfo | null }> {
    const url = `${this.baseUrl}/dex/pairs/${chainId}/${pairId}`;
    const res = await this._fetch(url);
    if (!res.ok) {
      throw new Error(`DexScreener error: ${res.status} ${res.statusText}`);
    }
    const raw = (await res.json()) as { pair: DexScreenerPairInfo | null };
    if (raw.pair) validateFreshness(raw.pair, this.maxStalenessMs);
    return raw;
  }

  /**
   * Search for pairs matching query
   * GET /latest/dex/search?q={query}
   * 
   * Search tokens/pairs by symbol, name, or address
   */
  async search(query: string): Promise<DexScreenerTokenResponse> {
    const url = `${this.baseUrl}/dex/search?q=${encodeURIComponent(query)}`;
    const res = await this._fetch(url);
    if (!res.ok) {
      throw new Error(`DexScreener error: ${res.status} ${res.statusText}`);
    }
    const raw = (await res.json()) as DexScreenerTokenResponse;
    this.validateResponseFreshness(raw);
    return raw;
  }

  /**
   * Get latest boosted tokens
   * GET /token-boosts/latest/v1
   * 
   * Returns most recently boosted tokens
   */
  async getLatestBoosted(): Promise<DexScreenerLatestBoostedResponse> {
    const url = `${this.baseUrl}/token-boosts/latest/v1`;
    const res = await this._fetch(url);
    if (!res.ok) {
      throw new Error(`DexScreener error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<DexScreenerLatestBoostedResponse>;
  }

  /**
   * Get top boosted tokens
   * GET /token-boosts/top/v1
   * 
   * Returns highest boosted tokens by total amount
   */
  async getTopBoosted(): Promise<DexScreenerTopBoostedResponse> {
    const url = `${this.baseUrl}/token-boosts/top/v1`;
    const res = await this._fetch(url);
    if (!res.ok) {
      throw new Error(`DexScreener error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<DexScreenerTopBoostedResponse>;
  }

  /**
   * Get token pairs with SHA-256 hash for audit trail
   * 
   * Returns raw response plus deterministic hash for integrity verification
   */
  async getTokenPairsWithHash(tokenAddress: string): Promise<{
    raw: DexScreenerTokenResponse;
    rawPayloadHash: string;
  }> {
    const raw = await this.getTokenPairs(tokenAddress);
    const rawPayloadHash = sha256(JSON.stringify(raw));
    return { raw, rawPayloadHash };
  }

  async getTokenPairsV1WithHash(chainId: string, tokenAddress: string): Promise<{
    raw: DexScreenerTokenResponse;
    rawPayloadHash: string;
  }> {
    const raw = await this.getTokenPairsV1(chainId, tokenAddress);
    const rawPayloadHash = sha256(JSON.stringify(raw));
    return { raw, rawPayloadHash };
  }

  async getTokensV1WithHash(chainId: string, tokenAddresses: readonly string[]): Promise<{
    raw: DexScreenerTokenResponse;
    rawPayloadHash: string;
  }> {
    const raw = await this.getTokensV1(chainId, tokenAddresses);
    const rawPayloadHash = sha256(JSON.stringify(raw));
    return { raw, rawPayloadHash };
  }

  /**
   * Search with SHA-256 hash for audit trail
   * 
   * Returns raw response plus deterministic hash for integrity verification
   */
  async searchWithHash(query: string): Promise<{
    raw: DexScreenerTokenResponse;
    rawPayloadHash: string;
  }> {
    const raw = await this.search(query);
    const rawPayloadHash = sha256(JSON.stringify(raw));
    return { raw, rawPayloadHash };
  }

  /**
   * Get pair with SHA-256 hash for audit trail
   */
  async getPairWithHash(chainId: string, pairId: string): Promise<{
    raw: { pair: DexScreenerPairInfo | null };
    rawPayloadHash: string;
  }> {
    const raw = await this.getPair(chainId, pairId);
    const rawPayloadHash = sha256(JSON.stringify(raw));
    return { raw, rawPayloadHash };
  }

  async getPairLatestWithHash(chainId: string, pairId: string): Promise<{
    raw: { pair: DexScreenerPairInfo | null };
    rawPayloadHash: string;
  }> {
    const raw = await this.getPairLatest(chainId, pairId);
    const rawPayloadHash = sha256(JSON.stringify(raw));
    return { raw, rawPayloadHash };
  }

  private normalizeTokenPairsResponse(payload: unknown): DexScreenerTokenResponse {
    if (Array.isArray(payload)) {
      return {
        schemaVersion: "1.0",
        pairs: payload as DexScreenerPairInfo[],
      };
    }

    if (payload != null && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      if ("pairs" in record) {
        const pairs = record.pairs;
        if (pairs === null || Array.isArray(pairs)) {
          return {
            schemaVersion: typeof record.schemaVersion === "string" && record.schemaVersion.trim() !== ""
              ? record.schemaVersion
              : "1.0",
            pairs: (pairs as DexScreenerPairInfo[] | null) ?? null,
          };
        }
      }
    }

    throw new Error("DexScreener error: unsupported token-pairs payload shape");
  }
}
