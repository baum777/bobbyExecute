/**
 * Quote fetching - Jupiter Quote API v6.
 * Integrates with Jupiter for swap route quotes.
 */
import type { TradeIntent } from "../../core/contracts/trade.js";
import type { QuoteResult } from "./types.js";
import { resilientFetch } from "../http-resilience.js";

const JUPITER_QUOTE_BASE = process.env.JUPITER_QUOTE_URL ?? "https://api.jup.ag/swap/v1";

/** Token symbol -> SPL mint address (Solana mainnet). */
const TOKEN_MINTS: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

/** Decimals per token for human amount -> raw conversion. */
const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
  USDC: 6,
};

/** Jupiter Quote API response shape (subset we use). */
interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  [key: string]: unknown;
}

function toRawAmount(amount: string, token: string): string {
  const decimals = TOKEN_DECIMALS[token] ?? 9;
  const num = Number(amount);
  if (Number.isNaN(num) || !Number.isFinite(num)) return amount;
  if (num >= 10 ** decimals) return amount;
  return String(Math.floor(num * 10 ** decimals));
}

/**
 * Fetches a quote from Jupiter Quote API.
 * Maps response to QuoteResult and attaches rawQuotePayload.
 */
export async function getQuote(intent: TradeIntent): Promise<QuoteResult> {
  const inputMint = TOKEN_MINTS[intent.tokenIn] ?? intent.tokenIn;
  const outputMint = TOKEN_MINTS[intent.tokenOut] ?? intent.tokenOut;
  const amountRaw = toRawAmount(intent.amountIn, intent.tokenIn);
  const slippageBps = Math.round(intent.slippagePercent * 100);

  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amountRaw,
    slippageBps: String(slippageBps),
  });

  const url = `${JUPITER_QUOTE_BASE}/quote?${params.toString()}`;
  const res = await resilientFetch(url, undefined, {
    adapterId: "jupiter-quote",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jupiter quote failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const raw = (await res.json()) as JupiterQuoteResponse;
  return {
    quoteId: intent.idempotencyKey,
    amountOut: raw.outAmount,
    minAmountOut: raw.otherAmountThreshold ?? raw.outAmount,
    slippageBps,
    rawQuotePayload: raw,
  };
}
