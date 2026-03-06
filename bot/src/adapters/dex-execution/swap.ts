/**
 * Swap execution - Jupiter swap API.
 * M0: LIVE_TRADING must be explicitly enabled; default is paper mode.
 */
import { VersionedTransaction } from "@solana/web3.js";
import type { TradeIntent } from "../../core/contracts/trade.js";
import type { ExecutionReport } from "../../core/contracts/trade.js";
import type { QuoteResult } from "./types.js";
import { isLiveTradingEnabled, assertLiveTradingRequiresRealRpc } from "../../config/safety.js";
import { getQuote } from "./quotes.js";
import { resilientFetch } from "../http-resilience.js";

const JUPITER_SWAP_BASE = process.env.JUPITER_SWAP_URL ?? "https://api.jup.ag/swap/v1";

export interface SwapDeps {
  rpcClient: { sendRawTransaction(tx: Uint8Array | Buffer): Promise<string> };
  walletPublicKey: string;
  /** Keypair for signing. If absent, live swap will fail. */
  signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
}

/**
 * Execute swap.
 * Paper/dryRun: returns success without network calls.
 * Live: requires quote (or fetches), SwapDeps, calls Jupiter swap API, signs, submits via RPC.
 */
export async function executeSwap(
  intent: TradeIntent,
  quote?: QuoteResult,
  deps?: SwapDeps
): Promise<ExecutionReport> {
  const liveAllowed = isLiveTradingEnabled();

  if (!liveAllowed || intent.dryRun) {
    const actualOut = quote ? quote.amountOut : intent.minAmountOut;
    return {
      traceId: intent.traceId,
      timestamp: intent.timestamp,
      tradeIntentId: intent.idempotencyKey,
      success: true,
      actualAmountOut: actualOut,
      dryRun: true,
    };
  }

  assertLiveTradingRequiresRealRpc();

  if (!deps?.rpcClient?.sendRawTransaction || !deps?.signTransaction) {
    throw new Error(
      "Real swap execution requires SwapDeps (rpcClient, signTransaction). Set LIVE_TRADING=false or dryRun: true for paper-trade."
    );
  }

  const resolvedQuote = quote ?? (await getQuote(intent));
  const rawQuote = resolvedQuote.rawQuotePayload as Record<string, unknown>;
  if (!rawQuote || typeof rawQuote !== "object") {
    throw new Error("Quote missing rawQuotePayload required for Jupiter swap");
  }

  const swapBody = {
    quoteResponse: rawQuote,
    userPublicKey: deps.walletPublicKey,
  };

  const res = await resilientFetch(`${JUPITER_SWAP_BASE}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(swapBody),
  }, { adapterId: "jupiter-swap" });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jupiter swap failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const swapResp = (await res.json()) as { swapTransaction: string };
  const txB64 = swapResp.swapTransaction;
  if (!txB64 || typeof txB64 !== "string") {
    throw new Error("Jupiter swap response missing swapTransaction");
  }

  const txBuf = Buffer.from(txB64, "base64");
  const tx = VersionedTransaction.deserialize(txBuf);
  const signedTx = await deps.signTransaction(tx);
  const serialized = signedTx.serialize();

  const signature = await deps.rpcClient.sendRawTransaction(serialized);

  return {
    traceId: intent.traceId,
    timestamp: intent.timestamp,
    tradeIntentId: intent.idempotencyKey,
    success: true,
    txSignature: signature,
    actualAmountOut: resolvedQuote.amountOut,
    dryRun: false,
  };
}
