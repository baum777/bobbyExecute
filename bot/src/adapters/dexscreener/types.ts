/**
 * DexScreener API Response Types
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: adapters/dexscreener | Last Updated: 2026-03-05
 * 
 * Based on DexScreener API v1.0
 * https://docs.dexscreener.com/api/reference
 */

export interface DexScreenerTokenInfo {
  address: string;
  name: string;
  symbol: string;
}

export interface DexScreenerLiquidity {
  usd: number;
  base: number;
  quote: number;
}

export interface DexScreenerPairInfo {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: DexScreenerTokenInfo;
  quoteToken: DexScreenerTokenInfo;
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity?: DexScreenerLiquidity;
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
}

export interface DexScreenerTokenResponse {
  schemaVersion: string;
  pairs: DexScreenerPairInfo[] | null;
}

export interface DexScreenerLatestBoostedResponse {
  schemaVersion: string;
  boosted: Array<{
    chainId: string;
    url: string;
    pairAddress: string;
    amount: number;
    totalAmount: number;
    tokenAddress: string;
    header: string;
    description: string;
  }>;
}

export interface DexScreenerTopBoostedResponse {
  schemaVersion: string;
  boosted: Array<{
    chainId: string;
    pairAddress: string;
    tokenAddress: string;
    amount: number;
    header: string;
    description: string;
    links: Array<{ type: string; label: string; url: string }>;
  }>;
}

/**
 * Boosted token with order info (for top boosts endpoint)
 */
export interface DexScreenerBoostedToken {
  chainId: string;
  pairAddress: string;
  tokenAddress: string;
  amount: number;
  header: string;
  description: string;
  links: Array<{
    type: string;
    label: string;
    url: string;
  }>;
}

/**
 * API Error Response
 */
export interface DexScreenerError {
  statusCode: number;
  error: string;
  message: string;
}
