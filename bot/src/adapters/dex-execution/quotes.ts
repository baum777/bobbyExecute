/**
 * Quote fetching - simulates swap for minOut calculation.
 * PROPOSED - integrates with DEX routing (Jupiter, 1inch, etc.).
 */
import type { TradeIntent } from "../../core/contracts/trade.js";
import type { QuoteResult } from "./types.js";

/**
 * Stub quote service for paper-trade.
 * Production would call Jupiter API or similar.
 */
export async function getQuote(intent: TradeIntent): Promise<QuoteResult> {
  const amountIn = BigInt(intent.amountIn);
  const slippageBps = Math.round(intent.slippagePercent * 100);
  const minOutMultiplier = (10000 - slippageBps) / 10000;
  const simulatedOut = Number(amountIn) * 0.95 * minOutMultiplier;

  return {
    quoteId: `quote-${intent.idempotencyKey}`,
    amountOut: String(Math.floor(simulatedOut)),
    minAmountOut: intent.minAmountOut,
    slippageBps,
  };
}
