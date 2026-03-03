/**
 * RPC verification - truth layer checks before/after trades.
 * PROPOSED - verifies token mint, decimals, balance, quote inputs.
 */
import type { RpcVerificationReport } from "../../core/contracts/trade.js";
import type { TradeIntent } from "../../core/contracts/trade.js";
import type { ExecutionReport } from "../../core/contracts/trade.js";
import type { RpcClient } from "./client.js";

export async function verifyBeforeTrade(
  client: RpcClient,
  intent: TradeIntent,
  walletAddress: string,
  traceId: string,
  timestamp: string
): Promise<RpcVerificationReport> {
  const checks: RpcVerificationReport["checks"] = {};

  try {
    const tokenIn = await client.getTokenInfo(intent.tokenIn);
    checks.tokenMint = tokenIn.exists;
    checks.decimals = tokenIn.decimals > 0;

    const balance = await client.getBalance(walletAddress, intent.tokenIn);
    checks.balance = BigInt(balance.balance) >= BigInt(intent.amountIn);
    checks.quoteInputs = BigInt(intent.minAmountOut) > 0n;

    const passed =
      checks.tokenMint &&
      checks.decimals &&
      checks.balance &&
      checks.quoteInputs;

    return {
      traceId,
      timestamp,
      passed,
      checks,
      reason: passed ? undefined : "One or more pre-trade checks failed",
    };
  } catch (err) {
    return {
      traceId,
      timestamp,
      passed: false,
      checks,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function verifyAfterTrade(
  client: RpcClient,
  intent: TradeIntent,
  report: ExecutionReport,
  traceId: string,
  timestamp: string
): Promise<RpcVerificationReport> {
  const checks: RpcVerificationReport["checks"] = {};

  try {
    if (report.txSignature) {
      const receipt = await client.getTransactionReceipt(report.txSignature);
      checks.quoteInputs = receipt !== null && typeof receipt === "object";
    } else {
      checks.quoteInputs = report.success;
    }

    return {
      traceId,
      timestamp,
      passed: checks.quoteInputs ?? false,
      checks,
    };
  } catch (err) {
    return {
      traceId,
      timestamp,
      passed: false,
      checks,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
