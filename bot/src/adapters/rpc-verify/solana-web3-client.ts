/**
 * M4: Solana RPC client via @solana/web3.js.
 * Real onchain verification for verifyBeforeTrade/verifyAfterTrade.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import type { RpcClient, RpcClientConfig, TokenInfo, BalanceResult } from "./client.js";

export class SolanaWeb3RpcClient implements RpcClient {
  private readonly connection: Connection;
  private readonly config: RpcClientConfig;

  constructor(config: RpcClientConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl);
  }

  async getTokenInfo(mint: string): Promise<TokenInfo> {
    try {
      const pk = new PublicKey(mint);
      const info = await this.connection.getAccountInfo(pk);
      return {
        mint,
        decimals: 9,
        exists: info !== null,
      };
    } catch {
      return { mint, decimals: 0, exists: false };
    }
  }

  async getBalance(address: string, _mint?: string): Promise<BalanceResult> {
    try {
      const pk = new PublicKey(address);
      const lamports = await this.connection.getBalance(pk);
      return {
        address,
        balance: lamports.toString(),
        decimals: 9,
      };
    } catch (err) {
      throw new Error(`RPC getBalance failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async getTransactionReceipt(signature: string): Promise<unknown> {
    try {
      const status = await this.connection.getSignatureStatus(signature);
      return status?.value
        ? { status: status.value.confirmationStatus ?? "confirmed", slot: status.value.slot }
        : { status: "unknown", slot: null };
    } catch (err) {
      throw new Error(
        `RPC getTransactionReceipt failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async sendRawTransaction(tx: Uint8Array | Buffer): Promise<string> {
    try {
      const buf = Buffer.isBuffer(tx) ? tx : Buffer.from(tx);
      return await this.connection.sendRawTransaction(buf, { skipPreflight: false });
    } catch (err) {
      throw new Error(
        `RPC sendRawTransaction failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
