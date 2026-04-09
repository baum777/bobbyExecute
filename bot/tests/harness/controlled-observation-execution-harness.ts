import { PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { createExecutionHandler, type ExecutionHandlerDeps } from "../../src/agents/execution.agent.js";
import type { RpcClient } from "../../src/adapters/rpc-verify/client.js";
import type { Signer } from "../../src/adapters/signer/index.js";
import type { JournalEntry } from "../../src/core/contracts/journal.js";
import type {
  ExecutionReport,
  RpcVerificationReport,
  TradeIntent,
} from "../../src/core/contracts/trade.js";
import { InMemoryJournalWriter, type JournalWriter } from "../../src/journal-writer/writer.js";

export interface ControlledObservationExecutionHarnessInput {
  intent: TradeIntent;
  rpcClient?: Pick<RpcClient, "getTokenInfo" | "getBalance" | "sendRawTransaction" | "getTransactionReceipt">;
  walletAddress?: string;
  signer?: Signer;
  quoteFetcher?: ExecutionHandlerDeps["quoteFetcher"];
  buildSwapTransaction?: ExecutionHandlerDeps["buildSwapTransaction"];
  verifyTransaction?: ExecutionHandlerDeps["verifyTransaction"];
}

export interface ControlledObservationExecutionHarnessResult {
  traceId: string;
  blocked: boolean;
  blockedReason: string | null;
  executionReport: ExecutionReport | null;
  verificationReport: RpcVerificationReport | null;
  journalEntries: JournalEntry[];
}

function cloneEntry(entry: JournalEntry): JournalEntry {
  return JSON.parse(JSON.stringify(entry)) as JournalEntry;
}

function buildDeterministicQuoteFetcher() {
  return async (intent: TradeIntent) => ({
    quoteId: intent.idempotencyKey,
    amountOut: intent.minAmountOut,
    minAmountOut: intent.minAmountOut,
    fetchedAt: intent.timestamp,
    slippageBps: Math.round(intent.slippagePercent * 100),
    rawQuotePayload: {
      harness: true,
      routePlan: [],
      traceId: intent.traceId,
      idempotencyKey: intent.idempotencyKey,
    },
  });
}

function buildDeterministicSwapTransaction(input: {
  quoteResponse: Record<string, unknown>;
  userPublicKey: string;
}): Promise<{ swapTransaction: string }> {
  const message = new TransactionMessage({
    payerKey: new PublicKey(input.userPublicKey),
    recentBlockhash: "11111111111111111111111111111111",
    instructions: [],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  return Promise.resolve({
    swapTransaction: Buffer.from(tx.serialize()).toString("base64"),
  });
}

function buildDeterministicVerification(signature: string): Promise<unknown> {
  return Promise.resolve({
    signature,
    status: "confirmed",
  });
}

function extractVerificationReport(report: ExecutionReport): RpcVerificationReport | null {
  if (typeof report.artifacts !== "object" || report.artifacts === null) {
    return null;
  }

  const verification = (report.artifacts as Record<string, unknown>).verification;
  if (typeof verification !== "object" || verification === null) {
    return null;
  }

  const rawVerification = verification as Record<string, unknown>;
  return {
    traceId: report.traceId,
    timestamp: report.timestamp,
    passed: rawVerification.confirmed === true,
    checks: {},
    reason:
      typeof rawVerification.lastError === "string"
        ? rawVerification.lastError
        : undefined,
    verificationMode: "rpc",
  };
}

function buildJournalEntry(input: {
  traceId: string;
  timestamp: string;
  stage: string;
  input: unknown;
  output: unknown;
  blocked?: boolean;
  reason?: string;
}): JournalEntry {
  return {
    traceId: input.traceId,
    timestamp: input.timestamp,
    stage: input.stage,
    input: input.input,
    output: input.output,
    blocked: input.blocked,
    reason: input.reason,
  };
}

function appendToWriter(writer: JournalWriter, entry: JournalEntry): Promise<void> {
  return writer.append(cloneEntry(entry));
}

function missingDependencyNames(input: ControlledObservationExecutionHarnessInput): string[] {
  return [
    input.rpcClient ? null : "rpcClient",
    input.walletAddress ? null : "walletAddress",
    input.signer ? null : "signer",
  ].filter((value): value is string => value !== null);
}

export async function runControlledObservationExecutionHarness(
  input: ControlledObservationExecutionHarnessInput
): Promise<ControlledObservationExecutionHarnessResult> {
  const journal = new InMemoryJournalWriter();
  const appendJournal = async (entry: JournalEntry): Promise<void> => {
    await appendToWriter(journal, entry);
  };

  const requestEntry = buildJournalEntry({
    traceId: input.intent.traceId,
    timestamp: input.intent.timestamp,
    stage: "controlled-observation.execution.request",
    input: {
      executionMode: input.intent.executionMode,
      idempotencyKey: input.intent.idempotencyKey,
      tokenIn: input.intent.tokenIn,
      tokenOut: input.intent.tokenOut,
      hasRpcClient: input.rpcClient !== undefined,
      hasWalletAddress: input.walletAddress !== undefined,
      hasSigner: input.signer !== undefined,
    },
    output: {
      accepted: true,
    },
  });
  await appendJournal(requestEntry);

  const missingDependencies = missingDependencyNames(input);
  if (missingDependencies.length > 0) {
    const blockedReason = `MISSING_EXECUTION_ADAPTER_DEPENDENCIES:${missingDependencies.join(",")}`;
    await appendJournal(
      buildJournalEntry({
        traceId: input.intent.traceId,
        timestamp: input.intent.timestamp,
        stage: "controlled-observation.execution.result",
        input: {
          executionMode: input.intent.executionMode,
          missingDependencies,
        },
        output: {
          blocked: true,
          blockedReason,
          executionMode: null,
          txSignature: null,
        },
        blocked: true,
        reason: blockedReason,
      })
    );

    return {
      traceId: input.intent.traceId,
      blocked: true,
      blockedReason,
      executionReport: null,
      verificationReport: null,
      journalEntries: journal.list(),
    };
  }

  const executionHandler = await createExecutionHandler({
    rpcClient: input.rpcClient,
    walletAddress: input.walletAddress,
    signer: input.signer,
    quoteFetcher: input.quoteFetcher ?? buildDeterministicQuoteFetcher(),
    buildSwapTransaction: input.buildSwapTransaction ?? buildDeterministicSwapTransaction,
    verifyTransaction: input.verifyTransaction ?? buildDeterministicVerification,
  });

  try {
    const executionReport = await executionHandler(input.intent);
    const verificationReport = extractVerificationReport(executionReport);
    const blocked = executionReport.success !== true;
    const blockedReason = executionReport.error ?? null;

    await appendJournal(
      buildJournalEntry({
        traceId: input.intent.traceId,
        timestamp: input.intent.timestamp,
        stage: "controlled-observation.execution.result",
        input: {
          executionMode: input.intent.executionMode,
          idempotencyKey: input.intent.idempotencyKey,
        },
        output: {
          blocked,
          blockedReason,
          success: executionReport.success,
          executionMode: executionReport.executionMode ?? null,
          txSignature: executionReport.txSignature ?? null,
        },
        blocked,
        reason: blockedReason ?? undefined,
      })
    );

    return {
      traceId: input.intent.traceId,
      blocked,
      blockedReason,
      executionReport,
      verificationReport,
      journalEntries: journal.list(),
    };
  } catch (error) {
    const blockedReason = error instanceof Error ? error.message : String(error);
    await appendJournal(
      buildJournalEntry({
        traceId: input.intent.traceId,
        timestamp: input.intent.timestamp,
        stage: "controlled-observation.execution.result",
        input: {
          executionMode: input.intent.executionMode,
          idempotencyKey: input.intent.idempotencyKey,
        },
        output: {
          blocked: true,
          blockedReason,
          executionMode: null,
          txSignature: null,
        },
        blocked: true,
        reason: blockedReason,
      })
    );

    return {
      traceId: input.intent.traceId,
      blocked: true,
      blockedReason,
      executionReport: null,
      verificationReport: null,
      journalEntries: journal.list(),
    };
  }
}
