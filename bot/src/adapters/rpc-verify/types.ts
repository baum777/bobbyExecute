/**
 * RPC verification report types.
 * PROPOSED - chain-agnostic truth layer.
 */
export interface RpcVerifyConfig {
  rpcUrl: string;
  chain?: "solana" | "evm";
}
