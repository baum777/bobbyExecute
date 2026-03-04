export interface WalletRefV1 {
  schema_version: "wallet.ref.v1";
  chain: "solana";
  public_key: string;
  label?: string;
}
