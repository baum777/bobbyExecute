/**
 * Moralis raw API response types.
 * PROPOSED - minimal types for wallet balances.
 */
export interface MoralisTokenBalance {
  token_address: string;
  symbol: string;
  decimals: number;
  balance: string;
  usd_value?: number;
  name?: string;
}

export interface MoralisWalletTokensResponse {
  result?: MoralisTokenBalance[];
}
