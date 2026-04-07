/**
 * Execution agent - executes swap via DEX adapter.
 * Wires getQuote, optional RPC verification, executeSwap.
 */
import type { TradeIntent } from "../core/contracts/trade.js";
import type { ExecutionReport } from "../core/contracts/trade.js";
import type { RpcClient } from "../adapters/rpc-verify/client.js";
import type { IncidentRecorder } from "../observability/incidents.js";
import { getQuote } from "../adapters/dex-execution/quotes.js";
import type { QuoteResult } from "../adapters/dex-execution/types.js";
import { deriveLiveExecutionAttemptId, executeSwap, type SwapDeps } from "../adapters/dex-execution/swap.js";
import { verifyBeforeTrade } from "../adapters/rpc-verify/verify.js";
import { isLiveTradingEnabled } from "../config/safety.js";
import type { Signer } from "../adapters/signer/index.js";
import {
  evaluateMicroLiveIntent,
  getMicroLiveControlSnapshot,
  finalizeMicroLiveIntent,
  type LiveExecutionAttempt,
} from "../runtime/live-control.js";
import type {
  ExecutionEvidenceRecord,
  ExecutionEvidenceRepository,
  ExecutionEvidenceKind,
} from "../persistence/execution-repository.js";

export interface ExecutionHandlerDeps {
  rpcClient?: RpcClient;
  walletAddress?: string;
  signer?: Signer;
  buildSwapTransaction?: SwapDeps["buildSwapTransaction"];
  verifyTransaction?: SwapDeps["verifyTransaction"];
  quoteFetcher?: (intent: TradeIntent) => Promise<QuoteResult>;
  swapExecutor?: (intent: TradeIntent, quote?: QuoteResult, deps?: SwapDeps) => Promise<ExecutionReport>;
  executionEvidenceRepository?: ExecutionEvidenceRepository;
  incidentRecorder?: IncidentRecorder;
}

function readVerificationArtifact(artifacts: ExecutionReport["artifacts"]): Record<string, unknown> | undefined {
  if (typeof artifacts !== "object" || artifacts === null) {
    return undefined;
  }

  const verification = (artifacts as Record<string, unknown>).verification;
  if (typeof verification !== "object" || verification === null) {
    return undefined;
  }

  return verification as Record<string, unknown>;
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBooleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
    const signer = deps?.signer;
    const sendRawTransaction = rpcClient?.sendRawTransaction;

    const liveIntent = intent.executionMode === "live";
    const hasVerifyDeps = !!(rpcClient && walletAddress);
    const hasLiveSwapDeps = !!(sendRawTransaction && walletAddress && signer);
    const hasAnyLiveDeps = !!(rpcClient || walletAddress || signer);
    let microLiveAttempt: LiveExecutionAttempt | undefined;
    let evidenceSequence = 0;

    const executionEvidenceRepository = deps?.executionEvidenceRepository;
    const incidentRecorder = deps?.incidentRecorder;

    const appendEvidence = async (record: ExecutionEvidenceRecord): Promise<void> => {
      if (!executionEvidenceRepository) {
        return;
      }
      await executionEvidenceRepository.append(record);
    };

    const recordIncident = async (input: {
      severity: "info" | "warning" | "critical";
      type: "live_guardrail_refused" | "live_execution_refused";
      message: string;
      details?: Record<string, string | number | boolean | null | undefined>;
    }): Promise<void> => {
      if (!incidentRecorder) {
        return;
      }
      await incidentRecorder.record(input);
    };

    const nextEvidenceId = (kind: ExecutionEvidenceKind): string => `${intent.traceId}:${kind}:${++evidenceSequence}`;
    const baseEvidence = {
      traceId: intent.traceId,
      tradeIntentId: intent.idempotencyKey,
      mode: intent.executionMode ?? (intent.dryRun ? "dry" : "paper"),
    } satisfies Pick<ExecutionEvidenceRecord, "traceId" | "tradeIntentId" | "mode">;

    const recordDecision = async (allowed: boolean, extras: Omit<ExecutionEvidenceRecord, "id" | "at" | "kind" | "allowed" | "traceId" | "tradeIntentId" | "mode"> & { kind: ExecutionEvidenceKind }): Promise<void> => {
      const { kind, ...rest } = extras;
      await appendEvidence({
        id: nextEvidenceId(kind),
        at: intent.timestamp,
        kind,
        allowed,
        ...baseEvidence,
        ...rest,
      });
    };

    const recordExecution = async (report: ExecutionReport): Promise<void> => {
      await appendEvidence({
        id: nextEvidenceId("execution_summary"),
        at: report.timestamp,
        kind: "execution_summary",
        success: report.success,
        failureStage: report.failureStage,
        failureCode: report.failureCode,
        message: report.error,
        ...baseEvidence,
        details: {
          txSignature: report.txSignature ?? null,
          actualAmountOut: report.actualAmountOut ?? null,
          failClosed: report.failClosed ?? null,
        },
      });
    };

    const recordAttempt = async (): Promise<void> => {
      await appendEvidence({
        id: nextEvidenceId("execution_attempt_summary"),
        at: intent.timestamp,
        kind: "execution_attempt_summary",
        allowed: true,
        ...baseEvidence,
        details: {
          attemptId: deriveLiveExecutionAttemptId(intent),
          hasVerifyDeps,
          hasLiveSwapDeps,
          hasRpcClient: !!rpcClient,
          hasWalletAddress: !!walletAddress,
          hasSendRawTransaction: !!sendRawTransaction,
          hasSigner: !!signer,
          quoteRequested: true,
        },
      });
    };

    const recordVerificationOutcome = async (report: ExecutionReport): Promise<void> => {
      const verification = readVerificationArtifact(report.artifacts);
      if (!verification) {
        return;
      }

      await appendEvidence({
        id: nextEvidenceId("verification_outcome"),
        at: report.timestamp,
        kind: "verification_outcome",
        allowed: verification.confirmed === true,
        success: report.success,
        ...baseEvidence,
        failureStage: report.failureStage,
        failureCode: report.failureCode,
        message: report.error,
        details: {
          attemptId: asStringOrNull(verification.attemptId) ?? deriveLiveExecutionAttemptId(intent),
          txSignature: report.txSignature ?? null,
          confirmed: asBooleanOrNull(verification.confirmed),
          attempted: asBooleanOrNull(verification.attempted),
          timedOut: asBooleanOrNull(verification.timedOut),
          attempts: asNumberOrNull(verification.attempts),
          maxAttempts: asNumberOrNull(verification.maxAttempts),
          retryMs: asNumberOrNull(verification.retryMs),
          timeoutMs: asNumberOrNull(verification.timeoutMs),
          receiptState: asStringOrNull(verification.receiptState),
          lastError: asStringOrNull(verification.lastError),
          missingVerificationEvidence: false,
        },
      });
    };

    const finalize = async (report: ExecutionReport): Promise<ExecutionReport> => {
      if (liveIntent && microLiveAttempt) {
        finalizeMicroLiveIntent(microLiveAttempt, {
          success: report.success,
          failureCode: report.failureCode,
        });
        microLiveAttempt = undefined;
      }
      if (liveIntent) {
        await recordExecution(report);
        await recordVerificationOutcome(report);
        if (!report.success) {
          const refusalType =
            report.failureCode != null && /^micro_live_/.test(report.failureCode)
              ? "live_guardrail_refused"
              : "live_execution_refused";
          const severity =
            report.failureCode === "micro_live_failure_threshold_reached" ||
            report.failureCode === "micro_live_config_invalid" ||
            report.failureCode === "live_verification_failed" ||
            report.failureCode === "live_verification_timeout" ||
            report.failureCode === "live_swap_build_failed"
              ? "critical"
              : "warning";
          await recordIncident({
            severity,
            type: refusalType,
            message: report.error ?? "Live execution failed",
            details: {
              failureCode: report.failureCode ?? null,
              failureStage: report.failureStage ?? null,
              tradeIntentId: report.tradeIntentId,
              executionMode: report.executionMode ?? null,
              traceId: report.traceId,
            },
          });
        }
      }
      return report;
    };

    if (liveIntent) {
      const decision = evaluateMicroLiveIntent(intent);
      if (!decision.allowed) {
        await recordDecision(false, {
          kind: "live_refusal_summary",
          failureStage: decision.refusal?.stage ?? "preflight",
          failureCode: decision.refusal?.code ?? "micro_live_blocked",
          message: decision.refusal?.detail ?? "Live intent rejected by micro-live guardrails.",
          details: {
            operatorActionRequired: decision.refusal?.operatorActionRequired ?? true,
            posture: decision.refusal?.posture ?? "live_blocked",
            refusalStage: decision.refusal?.stage ?? "preflight",
            refusalCode: decision.refusal?.code ?? "micro_live_blocked",
          },
        });
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
      const liveControlSnapshot = getMicroLiveControlSnapshot();
      await recordDecision(true, {
        kind: "decision_summary",
        message: "Live intent accepted by micro-live guardrails.",
        details: {
          posture: liveControlSnapshot.posture,
          rolloutPosture: liveControlSnapshot.rolloutPosture,
          attemptId: decision.attempt?.attemptId ?? null,
          notional: decision.attempt?.notional ?? null,
        },
      });
    }

    if (liveIntent && hasAnyLiveDeps && !hasLiveSwapDeps) {
      return finalize({
        traceId: intent.traceId,
        timestamp: intent.timestamp,
        tradeIntentId: intent.idempotencyKey,
        success: false,
        error: "Live execution requires rpcClient, walletAddress, and signer.",
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
            hasSigner: !!signer,
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
      return finalize({
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
        artifacts: {
          mode: "live",
          failClosed: true,
          stage: "preflight",
          executionAttemptId: deriveLiveExecutionAttemptId(intent),
          dependencyState: {
            liveTradingEnabled: false,
            hasRpcClient: !!rpcClient,
            hasWalletAddress: !!walletAddress,
            hasSendRawTransaction: !!sendRawTransaction,
            hasSigner: !!signer,
          },
        },
      });
    }

    const normalizedNonLiveIntent =
      liveIntent || intent.executionMode != null
        ? intent
        : {
            ...intent,
            executionMode: intent.dryRun ? "dry" : "paper",
          } as TradeIntent;

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
          signer: signer!,
          buildSwapTransaction: deps?.buildSwapTransaction,
          verifyTransaction: deps?.verifyTransaction,
      }
      : undefined;

    let quote: QuoteResult | undefined;
    if (liveIntent) {
      await recordAttempt();
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
      const result = await swapExecutor(normalizedNonLiveIntent, quote, swapDeps);
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
          await appendEvidence({
            id: nextEvidenceId("verification_outcome"),
            at: intent.timestamp,
            kind: "verification_outcome",
            allowed: false,
            success: false,
            ...baseEvidence,
            failureStage: "verification",
            failureCode: "live_verification_failed",
            message: "Live success rejected: missing concrete tx signature or confirmation evidence.",
            details: {
              attemptId: deriveLiveExecutionAttemptId(intent),
              txSignature: result.txSignature ?? null,
              confirmed: false,
              attempted: true,
              missingVerificationEvidence: true,
              hasTx,
              verificationConfirmed,
            },
          });
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
