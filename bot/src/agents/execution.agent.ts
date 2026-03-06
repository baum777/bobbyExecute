/**
 * Execution agent - executes swap via DEX adapter.
 * Wires getQuote, optional RPC verification, executeSwap.
 */
import type { VersionedTransaction } from "@solana/web3.js";
import type { TradeIntent } from "../core/contracts/trade.js";
import type { ExecutionReport } from "../core/contracts/trade.js";
import type { RpcClient } from "../adapters/rpc-verify/client.js";
import { getQuote } from "../adapters/dex-execution/quotes.js";
import { executeSwap, type SwapDeps } from "../adapters/dex-execution/swap.js";
import { verifyBeforeTrade } from "../adapters/rpc-verify/verify.js";

export interface ExecutionHandlerDeps {
  rpcClient?: RpcClient;
  walletAddress?: string;
  signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
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
  return async (intent) => {
    const needsQuote = !!(
      deps?.rpcClient?.sendRawTransaction &&
      deps?.walletAddress &&
      deps?.signTransaction
    );
    const quote = needsQuote ? await getQuote(intent) : undefined;

    if (deps?.rpcClient && deps?.walletAddress) {
      const verify = await verifyBeforeTrade(
        deps.rpcClient,
        intent,
        deps.walletAddress,
        intent.traceId,
        intent.timestamp
      );
      if (!verify.passed) {
        return {
          traceId: intent.traceId,
          timestamp: intent.timestamp,
          tradeIntentId: intent.idempotencyKey,
          success: false,
          error: verify.reason ?? "Pre-trade verification failed",
        };
      }
    }

    const swapDeps: SwapDeps | undefined =
      deps?.rpcClient?.sendRawTransaction && deps?.walletAddress && deps?.signTransaction
        ? {
            rpcClient: { sendRawTransaction: deps.rpcClient.sendRawTransaction.bind(deps.rpcClient) },
            walletPublicKey: deps.walletAddress,
            signTransaction: deps.signTransaction,
          }
        : undefined;

    return executeSwap(intent, quote, swapDeps);
  };
}
