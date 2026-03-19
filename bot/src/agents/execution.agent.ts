/**
 * Execution agent - executes swap via DEX adapter.
 * Wires getQuote, optional RPC verification, executeSwap.
 */
import type { VersionedTransaction } from "@solana/web3.js";
import type { TradeIntent } from "../core/contracts/trade.js";
import type { ExecutionReport } from "../core/contracts/trade.js";
import type { RpcClient } from "../adapters/rpc-verify/client.js";
import { getQuote } from "../adapters/dex-execution/quotes.js";
import type { QuoteResult } from "../adapters/dex-execution/types.js";
import { executeSwap, type SwapDeps } from "../adapters/dex-execution/swap.js";
import { verifyBeforeTrade } from "../adapters/rpc-verify/verify.js";
import { isLiveTradingEnabled } from "../config/safety.js";
import {
  evaluateMicroLiveIntent,
  finalizeMicroLiveIntent,
  type LiveExecutionAttempt,
} from "../runtime/live-control.js";

export interface ExecutionHandlerDeps {
  rpcClient?: RpcClient;
  walletAddress?: string;
  signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  buildSwapTransaction?: SwapDeps["buildSwapTransaction"];
  verifyTransaction?: SwapDeps["verifyTransaction"];
  quoteFetcher?: (intent: TradeIntent) => Promise<QuoteResult>;
  swapExecutor?: (intent: TradeIntent, quote?: QuoteResult, deps?: SwapDeps) => Promise<ExecutionReport>;
}

/**
 * Creates execution handler. When deps provided with rpcClient and walletAddress:
 * - Runs verifyBeforeTrade before swap (fail-closed if passed=false).
 * - Fetches quote, passes to executeSwap.
 * - For live mode, SwapDeps derived from deps.
 */
export async function createExecutionHandler(
  deps?: ExecutionHandlerDeps
): Promise<(intent: TradeIntent) => Promise<ExecutionReport>> {
  const quoteFetcher = deps?.quoteFetcher ?? getQuote;
  const swapExecutor = deps?.swapExecutor ?? executeSwap;

  return async (intent) => {
    const rpcClient = deps?.rpcClient;
    const walletAddress = deps?.walletAddress;
    const signTransaction = deps?.signTransaction;
    const sendRawTransaction = rpcClient?.sendRawTransaction;

    const liveIntent = intent.executionMode === "live";
    const hasVerifyDeps = !!(rpcClient && walletAddress);
    const hasLiveSwapDeps = !!(sendRawTransaction && walletAddress && signTransaction);
    const hasAnyLiveDeps = !!(rpcClient || walletAddress || signTransaction);
    let microLiveAttempt: LiveExecutionAttempt | undefined;

    const finalize = (report: ExecutionReport): ExecutionReport => {
      if (liveIntent && microLiveAttempt) {
        finalizeMicroLiveIntent(microLiveAttempt, {
          success: report.success,
          failureCode: report.failureCode,
        });
        microLiveAttempt = undefined;
      }
      return report;
    };

    if (liveIntent) {
      const decision = evaluateMicroLiveIntent(intent);
      if (!decision.allowed) {
        return finalize({
          traceId: intent.traceId,
          timestamp: intent.timestamp,
          tradeIntentId: intent.idempotencyKey,
          success: false,
          error: decision.refusal?.detail ?? "Live intent rejected by micro-live guardrails.",
          dryRun: false,
          executionMode: "live",
          paperExecution: false,
          failClosed: true,
          failureStage: decision.refusal?.stage ?? "preflight",
          failureCode: decision.refusal?.code ?? "micro_live_blocked",
          artifacts: {
            mode: "live",
            failClosed: true,
            stage: decision.refusal?.stage ?? "preflight",
            liveControl: decision.refusal,
          },
        });
      }
      microLiveAttempt = decision.attempt;
    }

    if (liveIntent && hasAnyLiveDeps && !hasLiveSwapDeps) {
      return finalize({
        traceId: intent.traceId,
        timestamp: intent.timestamp,
        tradeIntentId: intent.idempotencyKey,
        success: false,
        error: "Live execution requires rpcClient, walletAddress, and signTransaction.",
        dryRun: false,
        executionMode: "live",
        paperExecution: false,
        failClosed: true,
        failureStage: "preflight",
        failureCode: "live_dependency_incomplete",
        artifacts: {
          mode: "live",
          failClosed: true,
          stage: "preflight",
          dependencyState: {
            hasRpcClient: !!rpcClient,
            hasWalletAddress: !!walletAddress,
            hasSendRawTransaction: !!sendRawTransaction,
            hasSignTransaction: !!signTransaction,
          },
        },
      });
    }

    if (hasVerifyDeps) {
      const verify = await verifyBeforeTrade(
        rpcClient!,
        intent,
        walletAddress!,
        intent.traceId,
        intent.timestamp
      );
      if (!verify.passed) {
        const executionMode = intent.executionMode ?? (intent.dryRun ? "dry" : "paper");
        return finalize({
          traceId: intent.traceId,
          timestamp: intent.timestamp,
          tradeIntentId: intent.idempotencyKey,
          success: false,
          error: verify.reason ?? "Pre-trade verification failed",
          dryRun: executionMode === "dry",
          executionMode,
          paperExecution: executionMode === "paper",
        });
      }
    }

    if (liveIntent && !isLiveTradingEnabled()) {
      return finalize(await swapExecutor(intent, undefined, undefined));
    }

    const swapRpcClient = rpcClient?.getTransactionReceipt
      ? {
          sendRawTransaction: sendRawTransaction!,
          getTransactionReceipt: rpcClient.getTransactionReceipt.bind(rpcClient),
        }
      : {
          sendRawTransaction: sendRawTransaction!,
        };

    const swapDeps: SwapDeps | undefined = hasLiveSwapDeps
      ? {
          rpcClient: swapRpcClient,
          walletPublicKey: walletAddress!,
          signTransaction: signTransaction!,
          buildSwapTransaction: deps?.buildSwapTransaction,
          verifyTransaction: deps?.verifyTransaction,
        }
      : undefined;

    let quote: QuoteResult | undefined;
    if (liveIntent) {
      try {
        quote = await quoteFetcher(intent);
      } catch (error) {
        return finalize({
          traceId: intent.traceId,
          timestamp: intent.timestamp,
          tradeIntentId: intent.idempotencyKey,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          dryRun: false,
          executionMode: "live",
          paperExecution: false,
          failClosed: true,
          failureStage: "quote",
          failureCode: "live_quote_failed",
          artifacts: {
            mode: "live",
            failClosed: true,
            stage: "quote",
            quote: { fetched: false },
          },
        });
      }
    }

    try {
      const result = await swapExecutor(intent, quote, swapDeps);
      if (!liveIntent) {
        return result;
      }

      if (result.success) {
        const hasTx = typeof result.txSignature === "string" && result.txSignature.trim().length > 0;
        const verificationConfirmed =
          typeof result.artifacts === "object" &&
          result.artifacts !== null &&
          "verification" in result.artifacts &&
          typeof (result.artifacts as Record<string, unknown>).verification === "object" &&
          (result.artifacts as Record<string, unknown>).verification !== null &&
          (result.artifacts as { verification: { confirmed?: boolean } }).verification.confirmed === true;
        if (!hasTx || !verificationConfirmed) {
          return finalize({
            traceId: intent.traceId,
            timestamp: intent.timestamp,
            tradeIntentId: intent.idempotencyKey,
            success: false,
            error: "Live success rejected: missing concrete tx signature or confirmation evidence.",
            dryRun: false,
            executionMode: "live",
            paperExecution: false,
            failClosed: true,
            failureStage: !hasTx ? "send" : "verification",
            failureCode: !hasTx ? "live_send_ambiguous" : "live_verification_failed",
            artifacts: {
              mode: "live",
              failClosed: true,
              stage: !hasTx ? "send" : "verification",
              priorResult: result.artifacts ?? {},
            },
          });
        }
      } else {
        return finalize({
          ...result,
          executionMode: "live",
          dryRun: false,
          paperExecution: false,
          failClosed: result.failClosed ?? true,
          artifacts: result.artifacts ?? {
            mode: "live",
            failClosed: true,
            stage: result.failureStage ?? "unknown",
          },
        });
      }

      return finalize(result);
    } catch (error) {
      return finalize({
        traceId: intent.traceId,
        timestamp: intent.timestamp,
        tradeIntentId: intent.idempotencyKey,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        dryRun: false,
        executionMode: "live",
        paperExecution: false,
        failClosed: true,
        failureStage: "swap_build",
        failureCode: "live_swap_build_failed",
        artifacts: {
          mode: "live",
          failClosed: true,
          stage: "swap_build",
          quote: {
            quoteId: quote?.quoteId,
            fetchedAt: quote?.fetchedAt,
          },
        },
      });
    }
  };
}
