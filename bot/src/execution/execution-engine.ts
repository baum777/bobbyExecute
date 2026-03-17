/**
 * Execution engine - orchestrates quote, swap, verification.
 * Normalized planning package: dry/live separation, fail-closed on live disabled.
 */
import type { TradeIntent, ExecutionReport, RpcVerificationReport } from "../core/contracts/trade.js";
import { isLiveTradingEnabled } from "../config/safety.js";

export interface ExecutionEngineConfig {
  /** Execute handler - typically from execution.agent */
  executeFn: (intent: TradeIntent) => Promise<ExecutionReport>;
  /** Verify handler - RPC verification after execute */
  verifyFn: (intent: TradeIntent, report: ExecutionReport) => Promise<RpcVerificationReport>;
}

export interface ExecutionResult {
  report: ExecutionReport;
  verification: RpcVerificationReport;
  blocked: boolean;
  blockedReason?: string;
}

/**
 * Run execution pipeline: execute -> verify.
 * When LIVE_TRADING=false and intent.executionMode=live, blocks (fail-closed).
 */
export async function runExecution(
  config: ExecutionEngineConfig,
  intent: TradeIntent
): Promise<ExecutionResult> {
  if (intent.executionMode === "live" && !isLiveTradingEnabled()) {
    return {
      report: {
        traceId: intent.traceId,
        timestamp: intent.timestamp,
        tradeIntentId: intent.idempotencyKey,
        success: false,
        error: "Live execution disabled (LIVE_TRADING not enabled)",
        dryRun: false,
        executionMode: "live",
        paperExecution: false,
      },
      verification: {
        traceId: intent.traceId,
        timestamp: intent.timestamp,
        passed: false,
        checks: {},
        reason: "Live execution disabled",
        verificationMode: "rpc",
      },
      blocked: true,
      blockedReason: "Live execution disabled",
    };
  }

  const report = await config.executeFn(intent);
  const normalizedReport = {
    ...report,
    executionMode: report.executionMode ?? intent.executionMode,
    paperExecution: report.paperExecution ?? intent.executionMode === "paper",
  };
  const verification = await config.verifyFn(intent, normalizedReport);
  const normalizedVerification = {
    ...verification,
    verificationMode:
      verification.verificationMode ?? (intent.executionMode === "paper" ? "paper-simulated" : "rpc"),
  };

  if (!normalizedVerification.passed) {
    return {
      report: normalizedReport,
      verification: normalizedVerification,
      blocked: true,
      blockedReason: normalizedVerification.reason ?? "RPC verification failed",
    };
  }

  return {
    report: normalizedReport,
    verification: normalizedVerification,
    blocked: false,
  };
}
