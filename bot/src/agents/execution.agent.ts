/**
 * Execution agent - executes swap via DEX adapter.
 * PROPOSED - delegates to dex-execution/swap.
 */
import type { TradeIntent } from "../core/contracts/trade.js";
import type { ExecutionReport } from "../core/contracts/trade.js";
import { executeSwap } from "../adapters/dex-execution/swap.js";

export async function createExecutionHandler(): Promise<
  (intent: TradeIntent) => Promise<ExecutionReport>
> {
  return async (intent) => executeSwap(intent);
}
