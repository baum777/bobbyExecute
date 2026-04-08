/**
 * Wallet/portfolio contracts - normalized from direct RPC or legacy wallet providers.
 * Wallet snapshots remain non-authoritative and are normalized before runtime use.
 */
import { z } from "zod";

export const TokenBalanceSchema = z.object({
  mint: z.string(),
  symbol: z.string(),
  decimals: z.number().int().nonnegative(),
  amount: z.string(),
  amountUsd: z.number().optional(),
});

export const WalletSnapshotSchema = z.object({
  traceId: z.string(),
  timestamp: z.string().datetime(),
  source: z.enum(["rpc", "moralis"]),
  walletAddress: z.string(),
  balances: z.array(TokenBalanceSchema),
  totalUsd: z.number().optional(),
  rawPayloadHash: z.string().optional(),
});

export type TokenBalance = z.infer<typeof TokenBalanceSchema>;
export type WalletSnapshot = z.infer<typeof WalletSnapshotSchema>;
