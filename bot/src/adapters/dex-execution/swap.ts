/**
 * Swap execution - Jupiter swap API.
 * M0: LIVE_TRADING must be explicitly enabled; default is paper mode.
 */
import { VersionedTransaction } from "@solana/web3.js";
import type { TradeIntent } from "../../core/contracts/trade.js";
import type { ExecutionReport } from "../../core/contracts/trade.js";
import type { QuoteResult } from "./types.js";
import { hashDecision } from "../../core/determinism/hash.js";
import { isLiveTradingEnabled, assertLiveTradingRequiresRealRpc } from "../../config/safety.js";
import { getQuote } from "./quotes.js";
import { resilientFetch } from "../http-resilience.js";
import { buildJupiterAuthHeaders } from "./jupiter-auth.js";
import { SignerError, type Signer } from "../signer/index.js";

const JUPITER_SWAP_BASE = process.env.JUPITER_SWAP_URL ?? "https://api.jup.ag/swap/v1";
const DEFAULT_QUOTE_MAX_AGE_MS = 15_000;
const DEFAULT_VERIFY_MAX_ATTEMPTS = 3;
const DEFAULT_VERIFY_RETRY_MS = 500;
const DEFAULT_VERIFY_TIMEOUT_MS = 4_000;

type LiveFailureCode =
  | "live_dependency_incomplete"
  | "live_quote_failed"
  | "live_quote_invalid"
  | "live_quote_stale"
  | "live_swap_build_failed"
  | "live_swap_payload_invalid"
  | "live_signer_disabled"
  | "live_signer_timeout"
  | "live_signer_unavailable"
  | "live_signer_auth_failed"
  | "live_signer_response_invalid"
  | "live_signer_wallet_mismatch"
  | "live_signing_unavailable"
  | "live_send_failed"
  | "live_send_ambiguous"
  | "live_verification_failed"
  | "live_verification_timeout";

type LiveFailureStage =
  | "preflight"
  | "quote"
  | "swap_build"
  | "payload_validate"
  | "signing"
  | "send"
  | "verification";

export interface SwapDeps {
  rpcClient: {
    sendRawTransaction(tx: Uint8Array | Buffer): Promise<string>;
    getTransactionReceipt?(signature: string): Promise<unknown>;
  };
  walletPublicKey: string;
  /** Signing boundary for live transactions. If absent, live swap will fail. */
  signer?: Signer;
  /** Optional custom swap payload builder for testability or alternate providers. */
  buildSwapTransaction?: (input: { quoteResponse: Record<string, unknown>; userPublicKey: string }) => Promise<{ swapTransaction: string }>;
  /** Optional verifier override for post-send confirmation. */
  verifyTransaction?: (signature: string) => Promise<unknown>;
}

export function deriveLiveExecutionAttemptId(intent: TradeIntent): string {
  return `live-attempt:${hashDecision({
    traceId: intent.traceId,
    timestamp: intent.timestamp,
    idempotencyKey: intent.idempotencyKey,
    tokenIn: intent.tokenIn,
    tokenOut: intent.tokenOut,
    amountIn: intent.amountIn,
    minAmountOut: intent.minAmountOut,
    slippagePercent: intent.slippagePercent,
    executionMode: intent.executionMode ?? (intent.dryRun ? "dry" : "paper"),
  })}`;
}

function readIntEnv(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  const parsed = raw == null ? Number.NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

function createLiveArtifacts(intent: TradeIntent): Record<string, unknown> {
  return {
    attemptId: deriveLiveExecutionAttemptId(intent),
    mode: "live",
    failClosed: true,
    startedAt: intent.timestamp,
    intent: {
      traceId: intent.traceId,
      timestamp: intent.timestamp,
      tradeIntentId: intent.idempotencyKey,
      tokenIn: intent.tokenIn,
      tokenOut: intent.tokenOut,
      amountIn: intent.amountIn,
      minAmountOut: intent.minAmountOut,
      slippagePercent: intent.slippagePercent,
    },
  };
}

function makeLiveFailure(
  intent: TradeIntent,
  stage: LiveFailureStage,
  code: LiveFailureCode,
  reason: string,
  artifacts: Record<string, unknown>
): ExecutionReport {
  return {
    traceId: intent.traceId,
    timestamp: intent.timestamp,
    tradeIntentId: intent.idempotencyKey,
    success: false,
    error: reason,
    dryRun: false,
    executionMode: "live",
    paperExecution: false,
    failClosed: true,
    failureStage: stage,
    failureCode: code,
    artifacts,
  };
}

function isPositiveNumericString(value: unknown): boolean {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }
  if (!/^\d+(\.\d+)?$/.test(value)) {
    return false;
  }
  return Number(value) > 0;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyReceipt(
  receipt: unknown
): "confirmed" | "rejected" | "pending" | "unknown" {
  if (receipt == null) {
    return "pending";
  }
  if (typeof receipt !== "object") {
    return "unknown";
  }

  const obj = receipt as Record<string, unknown>;

  if ("err" in obj && obj.err != null) {
    return "rejected";
  }

  const statusCandidate = (obj.status ?? obj.confirmationStatus) as unknown;
  if (typeof statusCandidate === "string") {
    const lowered = statusCandidate.toLowerCase();
    if (["confirmed", "finalized", "success", "ok"].includes(lowered)) {
      return "confirmed";
    }
    if (["failed", "error", "rejected", "dropped"].includes(lowered)) {
      return "rejected";
    }
    if (["processed", "pending"].includes(lowered)) {
      return "pending";
    }
  }

  const valueCandidate = obj.value as Record<string, unknown> | undefined;
  const metaCandidate = valueCandidate?.meta as Record<string, unknown> | undefined;
  if (metaCandidate && "err" in metaCandidate && metaCandidate.err != null) {
    return "rejected";
  }

  return "unknown";
}

function normalizeLiveSuccessArtifacts(
  artifacts: Record<string, unknown>,
  txSignature: string,
  actualAmountOut: string
): Record<string, unknown> {
  const completedAt =
    typeof artifacts.startedAt === "string" && artifacts.startedAt.length > 0
      ? artifacts.startedAt
      : new Date().toISOString();
  return {
    ...artifacts,
    completedAt,
    send: {
      ...((artifacts.send as Record<string, unknown> | undefined) ?? {}),
      txSignature,
      ambiguous: false,
    },
    output: {
      txSignature,
      actualAmountOut,
    },
  };
}

function assertSignedTransactionMatchesWallet(tx: VersionedTransaction, walletPublicKey: string): void {
  const payerKey = tx.message.staticAccountKeys[0]?.toBase58();
  if (payerKey !== walletPublicKey) {
    throw new SignerError(
      "SIGNER_WALLET_MISMATCH",
      "Signed transaction payer did not match the requested walletAddress."
    );
  }
}

function mapSignerFailureCode(code: string): LiveFailureCode {
  switch (code) {
    case "SIGNER_DISABLED":
      return "live_signer_disabled";
    case "SIGNER_TIMEOUT":
      return "live_signer_timeout";
    case "SIGNER_AUTH_FAILED":
      return "live_signer_auth_failed";
    case "SIGNER_WALLET_MISMATCH":
      return "live_signer_wallet_mismatch";
    case "SIGNER_BAD_RESPONSE":
    case "SIGNER_REQUEST_INVALID":
      return "live_signer_response_invalid";
    case "SIGNER_UNAVAILABLE":
    default:
      return "live_signer_unavailable";
  }
}

function getSignerFailureCode(error: unknown): LiveFailureCode | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string") {
    return undefined;
  }

  return mapSignerFailureCode(code);
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
  const executionMode = intent.executionMode ?? (liveAllowed ? "live" : "dry");

  if (intent.dryRun) {
    const actualOut = quote ? quote.amountOut : intent.minAmountOut;
    return {
      traceId: intent.traceId,
      timestamp: intent.timestamp,
      tradeIntentId: intent.idempotencyKey,
      success: true,
      actualAmountOut: actualOut,
      dryRun: true,
      executionMode: "dry",
      paperExecution: false,
    };
  }

  if (executionMode === "live" && !liveAllowed) {
    return {
      traceId: intent.traceId,
      timestamp: intent.timestamp,
      tradeIntentId: intent.idempotencyKey,
      success: false,
      error: "Live execution disabled (LIVE_TRADING not enabled)",
      dryRun: false,
      executionMode: "live",
      paperExecution: false,
      failClosed: true,
      failureStage: "preflight",
      failureCode: "live_dependency_incomplete",
    };
  }

  if (executionMode !== "live") {
    const actualOut = quote ? quote.amountOut : intent.minAmountOut;
    return {
      traceId: intent.traceId,
      timestamp: intent.timestamp,
      tradeIntentId: intent.idempotencyKey,
      success: true,
      actualAmountOut: actualOut,
      dryRun: executionMode === "dry",
      executionMode,
      paperExecution: executionMode === "paper",
    };
  }

  assertLiveTradingRequiresRealRpc();
  const artifacts = createLiveArtifacts(intent);
  artifacts.preflight = {
    liveAllowed,
    hasRpcClient: !!deps?.rpcClient,
    hasSendRawTransaction: !!deps?.rpcClient?.sendRawTransaction,
    hasSigner: !!deps?.signer,
    hasWalletPublicKey: !!deps?.walletPublicKey,
  };

  if (!deps?.rpcClient?.sendRawTransaction || !deps?.signer) {
    return makeLiveFailure(
      intent,
      "preflight",
      "live_dependency_incomplete",
      "Real swap execution requires rpcClient.sendRawTransaction and signer.",
      artifacts
    );
  }

  const quoteMaxAgeMs = readIntEnv("LIVE_QUOTE_MAX_AGE_MS", DEFAULT_QUOTE_MAX_AGE_MS);
  let resolvedQuote: QuoteResult;
  try {
    resolvedQuote = quote ?? (await getQuote(intent));
  } catch (error) {
    return makeLiveFailure(
      intent,
      "quote",
      "live_quote_failed",
      error instanceof Error ? error.message : String(error),
      {
        ...artifacts,
        quote: {
          fetched: false,
        },
      }
    );
  }

  if (!resolvedQuote || typeof resolvedQuote !== "object") {
    return makeLiveFailure(intent, "quote", "live_quote_invalid", "Quote missing or malformed.", artifacts);
  }

  if (!isPositiveNumericString(resolvedQuote.amountOut) || !isPositiveNumericString(resolvedQuote.minAmountOut)) {
    return makeLiveFailure(intent, "quote", "live_quote_invalid", "Quote amountOut/minAmountOut invalid.", {
      ...artifacts,
      quote: {
        amountOut: resolvedQuote.amountOut,
        minAmountOut: resolvedQuote.minAmountOut,
      },
    });
  }

  const fetchedAtMs = resolvedQuote.fetchedAt ? Date.parse(resolvedQuote.fetchedAt) : Number.NaN;
  if (!Number.isFinite(fetchedAtMs)) {
    return makeLiveFailure(intent, "quote", "live_quote_invalid", "Quote missing fetchedAt timestamp.", {
      ...artifacts,
      quote: {
        fetchedAt: resolvedQuote.fetchedAt,
      },
    });
  }

  const quoteAgeMs = Date.now() - fetchedAtMs;
  if (quoteAgeMs > quoteMaxAgeMs) {
    return makeLiveFailure(intent, "quote", "live_quote_stale", `Quote stale (${quoteAgeMs}ms > ${quoteMaxAgeMs}ms).`, {
      ...artifacts,
      quote: {
        fetchedAt: resolvedQuote.fetchedAt,
        ageMs: quoteAgeMs,
        maxAgeMs: quoteMaxAgeMs,
      },
    });
  }

  const rawQuote = resolvedQuote.rawQuotePayload as Record<string, unknown>;
  if (!rawQuote || typeof rawQuote !== "object") {
    return makeLiveFailure(intent, "quote", "live_quote_invalid", "Quote missing rawQuotePayload required for swap build.", {
      ...artifacts,
      quote: {
        fetchedAt: resolvedQuote.fetchedAt,
        ageMs: quoteAgeMs,
      },
    });
  }

  const swapBody: { quoteResponse: Record<string, unknown>; userPublicKey: string } = {
    quoteResponse: rawQuote,
    userPublicKey: deps.walletPublicKey,
  };

  let swapResp: { swapTransaction: string };
  try {
    if (deps.buildSwapTransaction) {
      swapResp = await deps.buildSwapTransaction(swapBody);
    } else {
      const res = await resilientFetch(
        `${JUPITER_SWAP_BASE}/swap`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildJupiterAuthHeaders(),
          },
          body: JSON.stringify(swapBody),
        },
        { adapterId: "jupiter-swap" }
      );

      if (!res.ok) {
        const body = await res.text();
        return makeLiveFailure(intent, "swap_build", "live_swap_build_failed", `Jupiter swap failed (${res.status}): ${body.slice(0, 200)}`, {
          ...artifacts,
          quote: {
            fetchedAt: resolvedQuote.fetchedAt,
            ageMs: quoteAgeMs,
            maxAgeMs: quoteMaxAgeMs,
          },
          swapBuild: {
            provider: "jupiter",
            ok: false,
            status: res.status,
          },
        });
      }
      swapResp = (await res.json()) as { swapTransaction: string };
    }
  } catch (error) {
    return makeLiveFailure(
      intent,
      "swap_build",
      "live_swap_build_failed",
      error instanceof Error ? error.message : String(error),
      {
        ...artifacts,
        quote: {
          fetchedAt: resolvedQuote.fetchedAt,
          ageMs: quoteAgeMs,
          maxAgeMs: quoteMaxAgeMs,
        },
      }
    );
  }

  const txB64 = swapResp.swapTransaction;
  if (!txB64 || typeof txB64 !== "string") {
    return makeLiveFailure(intent, "payload_validate", "live_swap_payload_invalid", "Swap response missing swapTransaction payload.", {
      ...artifacts,
      quote: {
        fetchedAt: resolvedQuote.fetchedAt,
        ageMs: quoteAgeMs,
        maxAgeMs: quoteMaxAgeMs,
      },
      swapBuild: {
        provider: deps.buildSwapTransaction ? "custom" : "jupiter",
        ok: true,
        hasSwapTransaction: false,
      },
    });
  }

  let tx: VersionedTransaction;
  try {
    const txBuf = Buffer.from(txB64, "base64");
    tx = VersionedTransaction.deserialize(txBuf);
  } catch (error) {
    return makeLiveFailure(intent, "payload_validate", "live_swap_payload_invalid", error instanceof Error ? error.message : String(error), {
      ...artifacts,
      quote: {
        fetchedAt: resolvedQuote.fetchedAt,
        ageMs: quoteAgeMs,
        maxAgeMs: quoteMaxAgeMs,
      },
      swapBuild: {
        provider: deps.buildSwapTransaction ? "custom" : "jupiter",
        ok: true,
        hasSwapTransaction: true,
      },
    });
  }

  let signedTx: VersionedTransaction;
  try {
    const signingResult = await deps.signer.sign({
      purpose: "live_swap",
      walletAddress: deps.walletPublicKey,
      keyId: deps.signer.keyId,
      transactions: [
        {
          id: "swap-transaction",
          kind: "transaction",
          encoding: "base64",
          payload: txB64,
        },
      ],
    });

    const signedItem = signingResult.signedTransactions.find((item) => item.id === "swap-transaction");
    if (!signedItem) {
      throw new SignerError(
        "SIGNER_BAD_RESPONSE",
        "Remote signer response did not include the swap transaction."
      );
    }

    try {
      const signedTxBuf = Buffer.from(signedItem.signedPayload, "base64");
      signedTx = VersionedTransaction.deserialize(signedTxBuf);
      assertSignedTransactionMatchesWallet(signedTx, deps.walletPublicKey);
    } catch (error) {
      throw new SignerError(
        "SIGNER_BAD_RESPONSE",
        error instanceof Error ? error.message : String(error),
        error
      );
    }
  } catch (error) {
    const failureCode = getSignerFailureCode(error) ?? "live_signing_unavailable";
    return makeLiveFailure(intent, "signing", failureCode, error instanceof Error ? error.message : String(error), {
      ...artifacts,
      quote: {
        fetchedAt: resolvedQuote.fetchedAt,
        ageMs: quoteAgeMs,
        maxAgeMs: quoteMaxAgeMs,
      },
      swapBuild: {
        provider: deps.buildSwapTransaction ? "custom" : "jupiter",
        ok: true,
        hasSwapTransaction: true,
      },
      signing: {
        attempted: true,
        completed: false,
        failureCode,
      },
    });
  }

  const serialized = signedTx.serialize();
  if (!(serialized instanceof Uint8Array) || serialized.length === 0) {
    return makeLiveFailure(intent, "payload_validate", "live_swap_payload_invalid", "Signed transaction payload is empty.", {
      ...artifacts,
      quote: {
        fetchedAt: resolvedQuote.fetchedAt,
        ageMs: quoteAgeMs,
        maxAgeMs: quoteMaxAgeMs,
      },
      signing: {
        attempted: true,
        completed: true,
        payloadBytes: serialized.length,
      },
    });
  }

  let signature: string;
  try {
    signature = await deps.rpcClient.sendRawTransaction(serialized);
  } catch (error) {
    return makeLiveFailure(intent, "send", "live_send_failed", error instanceof Error ? error.message : String(error), {
      ...artifacts,
      quote: {
        fetchedAt: resolvedQuote.fetchedAt,
        ageMs: quoteAgeMs,
        maxAgeMs: quoteMaxAgeMs,
      },
      signing: {
        attempted: true,
        completed: true,
        payloadBytes: serialized.length,
      },
      send: {
        attempted: true,
      },
    });
  }

  if (typeof signature !== "string" || signature.trim().length === 0) {
    return makeLiveFailure(intent, "send", "live_send_ambiguous", "RPC send returned empty/ambiguous transaction reference.", {
      ...artifacts,
      quote: {
        fetchedAt: resolvedQuote.fetchedAt,
        ageMs: quoteAgeMs,
        maxAgeMs: quoteMaxAgeMs,
      },
      signing: {
        attempted: true,
        completed: true,
        payloadBytes: serialized.length,
      },
      send: {
        attempted: true,
        ambiguous: true,
      },
    });
  }

  const maxAttempts = readIntEnv("LIVE_VERIFY_MAX_ATTEMPTS", DEFAULT_VERIFY_MAX_ATTEMPTS);
  const retryMs = readIntEnv("LIVE_VERIFY_RETRY_MS", DEFAULT_VERIFY_RETRY_MS, 0);
  const timeoutMs = readIntEnv("LIVE_VERIFY_TIMEOUT_MS", DEFAULT_VERIFY_TIMEOUT_MS);
  const verifyFn =
    deps.verifyTransaction ??
    (deps.rpcClient.getTransactionReceipt
      ? (sig: string) => deps.rpcClient.getTransactionReceipt!(sig)
      : undefined);
  if (!verifyFn) {
    return makeLiveFailure(
      intent,
      "verification",
      "live_verification_failed",
      "No transaction verification function available for live execution.",
      {
        ...artifacts,
        send: {
          attempted: true,
          txSignature: signature,
        },
        verification: {
          attempted: false,
          maxAttempts,
          timeoutMs,
          retryMs,
        },
      }
    );
  }

  let timedOut = false;
  let lastError: string | undefined;
  let attempts = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    try {
      const receipt = await withTimeout(verifyFn(signature), timeoutMs);
      const receiptState = classifyReceipt(receipt);
      if (receiptState === "confirmed") {
        return {
          traceId: intent.traceId,
          timestamp: intent.timestamp,
          tradeIntentId: intent.idempotencyKey,
          success: true,
          txSignature: signature,
          actualAmountOut: resolvedQuote.amountOut,
          dryRun: false,
          executionMode: "live",
          paperExecution: false,
          failClosed: false,
          artifacts: normalizeLiveSuccessArtifacts(
            {
              ...artifacts,
              quote: {
                fetchedAt: resolvedQuote.fetchedAt,
                ageMs: quoteAgeMs,
                maxAgeMs: quoteMaxAgeMs,
              },
              swapBuild: {
                provider: deps.buildSwapTransaction ? "custom" : "jupiter",
                ok: true,
                hasSwapTransaction: true,
              },
              signing: {
                attempted: true,
                completed: true,
                payloadBytes: serialized.length,
              },
              verification: {
                attempted: true,
                confirmed: true,
                attempts,
                maxAttempts,
                timeoutMs,
                retryMs,
                receiptState,
              },
            },
            signature,
            resolvedQuote.amountOut
          ),
        };
      }
      if (receiptState === "rejected") {
        return makeLiveFailure(intent, "verification", "live_verification_failed", "Transaction receipt indicates failure.", {
          ...artifacts,
          send: {
            attempted: true,
            txSignature: signature,
          },
          verification: {
            attempted: true,
            confirmed: false,
            attempts,
            maxAttempts,
            timeoutMs,
            retryMs,
            receiptState,
          },
        });
      }
      lastError = `verification unresolved (${receiptState})`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;
      if (/timeout/i.test(message)) {
        timedOut = true;
      }
    }

    if (attempt < maxAttempts) {
      await sleep(retryMs);
    }
  }

  if (timedOut) {
    return makeLiveFailure(intent, "verification", "live_verification_timeout", lastError ?? "Verification timed out.", {
      ...artifacts,
      send: {
        attempted: true,
        txSignature: signature,
      },
      verification: {
        attempted: true,
        confirmed: false,
        timedOut: true,
        attempts,
        maxAttempts,
        timeoutMs,
        retryMs,
        lastError,
      },
    });
  }

  return makeLiveFailure(intent, "verification", "live_verification_failed", lastError ?? "Verification unresolved.", {
    ...artifacts,
    send: {
      attempted: true,
      txSignature: signature,
    },
    verification: {
      attempted: true,
      confirmed: false,
      timedOut: false,
      attempts,
      maxAttempts,
      timeoutMs,
      retryMs,
      lastError,
    },
  });
}
