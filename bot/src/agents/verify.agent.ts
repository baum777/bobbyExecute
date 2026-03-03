/**
 * Verify agent - RPC truth layer verification.
 * PROPOSED - verifies before/after trade.
 */
import type { TradeIntent } from "../core/contracts/trade.js";
import type { ExecutionReport } from "../core/contracts/trade.js";
import type { RpcVerificationReport } from "../core/contracts/trade.js";
import type { RpcClient } from "../adapters/rpc-verify/client.js";
import { verifyBeforeTrade, verifyAfterTrade } from "../adapters/rpc-verify/verify.js";

export function createVerifyHandler(
  client: RpcClient,
  walletAddress: string
): (
  intent: TradeIntent,
  report: ExecutionReport
) => Promise<RpcVerificationReport> {
  return async (intent, report) => {
    const ts = new Date().toISOString();
    const traceId = intent.traceId;

    const before = await verifyBeforeTrade(client, intent, walletAddress, traceId, ts);
    if (!before.passed) return before;

    return verifyAfterTrade(client, intent, report, traceId, ts);
  };
}
