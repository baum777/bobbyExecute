/**
 * DEX execution types.
 * PROPOSED - swap and quote interfaces.
 */
export interface QuoteResult {
  quoteId: string;
  amountOut: string;
  minAmountOut: string;
  slippageBps: number;
  /** Raw Jupiter Quote API response for downstream use ( Swap, debugging ). */
  rawQuotePayload?: unknown;
}

export interface SwapResult {
  success: boolean;
  txSignature?: string;
  actualAmountOut?: string;
  error?: string;
}
