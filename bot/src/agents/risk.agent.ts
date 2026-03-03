/**
 * Risk agent - evaluates trade intent against guardrails.
 * PROPOSED - applies governance rules.
 */
import type { TradeIntent } from "../core/contracts/trade.js";
import type { MarketSnapshot } from "../core/contracts/market.js";
import type { WalletSnapshot } from "../core/contracts/wallet.js";

export interface GuardrailsConfig {
  maxSlippagePercent?: number;
  allowlistMints?: string[];
  denylistMints?: string[];
}

export async function createRiskHandler(
  config: GuardrailsConfig = {}
): Promise<
  (
    intent: TradeIntent,
    market: MarketSnapshot,
    wallet: WalletSnapshot
  ) => Promise<{ allowed: boolean; reason?: string }>
> {
  const maxSlippage = config.maxSlippagePercent ?? 5;
  const allowlist = new Set(config.allowlistMints ?? []);
  const denylist = new Set(config.denylistMints ?? []);

  return async (intent, _market, _wallet) => {
    if (intent.slippagePercent > maxSlippage) {
      return {
        allowed: false,
        reason: `Slippage ${intent.slippagePercent}% exceeds max ${maxSlippage}%`,
      };
    }
    if (allowlist.size > 0 && !allowlist.has(intent.tokenIn)) {
      return { allowed: false, reason: `Token ${intent.tokenIn} not in allowlist` };
    }
    if (denylist.has(intent.tokenIn)) {
      return { allowed: false, reason: `Token ${intent.tokenIn} is denylisted` };
    }
    return { allowed: true };
  };
}
