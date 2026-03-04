export interface TokenRef {
  chain: "solana";
  token: string; // mint
  symbol?: string;
  name?: string;
}
