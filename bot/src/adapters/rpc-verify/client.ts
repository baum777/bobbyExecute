/**
 * RPC client - generic interface for Solana/EVM.
 * PROPOSED - truth layer for balance/token verification.
 */
export interface RpcClientConfig {
  rpcUrl: string;
  chain?: "solana" | "evm";
}

export interface TokenInfo {
  mint: string;
  decimals: number;
  owner?: string;
  exists: boolean;
}

export interface BalanceResult {
  address: string;
  balance: string;
  decimals: number;
}

export interface RpcClient {
  getTokenInfo(mint: string): Promise<TokenInfo>;
  getBalance(address: string, mint?: string): Promise<BalanceResult>;
  getTransactionReceipt(signature: string): Promise<unknown>;
}

/**
 * Stub RPC client for paper-trade / testing.
 * Production would use @solana/web3.js or ethers for actual RPC calls.
 */
export class StubRpcClient implements RpcClient {
  constructor(private readonly config: RpcClientConfig) {}

  async getTokenInfo(_mint: string): Promise<TokenInfo> {
    return {
      mint: _mint,
      decimals: 9,
      exists: true,
    };
  }

  async getBalance(address: string, mint?: string): Promise<BalanceResult> {
    return {
      address,
      balance: "1000000000",
      decimals: mint ? 9 : 9,
    };
  }

  async getTransactionReceipt(_signature: string): Promise<unknown> {
    return { status: "confirmed", slot: 12345 };
  }
}
