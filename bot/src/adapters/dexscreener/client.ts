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
import type {
  DexScreenerTokenResponse,
  DexScreenerPairInfo,
  DexScreenerLatestBoostedResponse,
  DexScreenerTopBoostedResponse,
} from "./types.js";

const BASE_URL = "https://api.dexscreener.com/latest";

export interface DexScreenerClientConfig {
  baseUrl?: string;
  apiKey?: string; // For future use if API requires auth
}

export class DexScreenerClient {
  private readonly baseUrl: string;

  constructor(config: DexScreenerClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? BASE_URL;
  }

  /**
   * Get token pairs by token address
   * GET /latest/dex/tokens/{tokenAddress}
   * 
   * Returns all pairs matching the token address across all DEXes
   */
  async getTokenPairs(tokenAddress: string): Promise<DexScreenerTokenResponse> {
    const url = `${this.baseUrl}/dex/tokens/${tokenAddress}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`DexScreener error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  /**
   * Get specific pair by chain and pair address
   * GET /latest/dex/pairs/{chainId}/{pairId}
   * 
   * Returns detailed information about a specific trading pair
   */
  async getPair(chainId: string, pairId: string): Promise<{ pair: DexScreenerPairInfo | null }> {
    const url = `${this.baseUrl}/dex/pairs/${chainId}/${pairId}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`DexScreener error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  /**
   * Search for pairs matching query
   * GET /latest/dex/search?q={query}
   * 
   * Search tokens/pairs by symbol, name, or address
   */
  async search(query: string): Promise<DexScreenerTokenResponse> {
    const url = `${this.baseUrl}/dex/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`DexScreener error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  /**
   * Get latest boosted tokens
   * GET /token-boosts/latest/v1
   * 
   * Returns most recently boosted tokens
   */
  async getLatestBoosted(): Promise<DexScreenerLatestBoostedResponse> {
    const url = `${this.baseUrl}/token-boosts/latest/v1`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`DexScreener error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  /**
   * Get top boosted tokens
   * GET /token-boosts/top/v1
   * 
   * Returns highest boosted tokens by total amount
   */
  async getTopBoosted(): Promise<DexScreenerTopBoostedResponse> {
    const url = `${this.baseUrl}/token-boosts/top/v1`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`DexScreener error: ${res.status} ${res.statusText}`);
    }
    return res.json();
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
}
