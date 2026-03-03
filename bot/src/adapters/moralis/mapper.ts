/**
 * Map Moralis responses to WalletSnapshot.
 * PROPOSED - normalizes wallet/portfolio data.
 */
import type { WalletSnapshot } from "../../core/contracts/wallet.js";
import type { MoralisTokenBalance } from "./types.js";

export function mapMoralisToWalletSnapshot(
  raw: { result?: MoralisTokenBalance[] },
  walletAddress: string,
  traceId: string,
  timestamp: string,
  rawPayloadHash?: string
): WalletSnapshot {
  const result = raw.result ?? [];
  const balances = result.map((t) => ({
    mint: t.token_address,
    symbol: t.symbol,
    decimals: t.decimals,
    amount: t.balance,
    amountUsd: t.usd_value,
  }));

  const totalUsd = balances.reduce((sum, b) => sum + (b.amountUsd ?? 0), 0);

  return {
    traceId,
    timestamp,
    source: "moralis",
    walletAddress,
    balances,
    totalUsd,
    rawPayloadHash,
  };
}
