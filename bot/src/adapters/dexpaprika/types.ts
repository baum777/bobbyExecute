/**
 * DexPaprika raw API response types.
 * PROPOSED - minimal types for mapping.
 */
export interface DexPaprikaTokenSummary {
  price_usd?: number;
  "24h"?: { volume?: number; volume_usd?: number };
}

export interface DexPaprikaTokenResponse {
  id: string;
  name: string;
  symbol: string;
  chain: string;
  decimals: number;
  summary?: DexPaprikaTokenSummary;
  last_updated?: string;
}

export interface DexPaprikaPoolItem {
  id: string;
  name?: string;
  base_token?: { id: string; symbol: string };
  quote_token?: { id: string; symbol: string };
  price_usd?: number;
  liquidity_usd?: number;
  volume_24h_usd?: number;
  last_updated?: string;
}
