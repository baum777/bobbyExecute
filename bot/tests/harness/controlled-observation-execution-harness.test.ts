import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import type { TradeIntent } from "../../src/core/contracts/trade.js";
import {
  armMicroLive,
  resetMicroLiveControlForTests,
} from "../../src/runtime/live-control.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";
import { runControlledObservationExecutionHarness } from "./controlled-observation-execution-harness.js";

function makeSerializedTransactionForPayer(payerBase58: string): string {
  const message = new TransactionMessage({
    payerKey: new PublicKey(payerBase58),
    recentBlockhash: "11111111111111111111111111111111",
    instructions: [],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  return Buffer.from(tx.serialize()).toString("base64");
}

function makeSigner() {
  return {
    mode: "remote" as const,
    keyId: "harness-signer",
    sign: vi.fn(async (request: {
      walletAddress: string;
      keyId?: string;
      transactions: Array<{ id: string; kind: "transaction" | "message"; encoding: "base64"; payload: string }>;
    }) => ({
      walletAddress: request.walletAddress,
      keyId: request.keyId,
      signedTransactions: request.transactions.map((item) => ({
        id: item.id,
        kind: item.kind,
        encoding: item.encoding,
        signedPayload: item.payload,
      })),
    })),
  };
}

describe("controlled-observation execution harness", () => {
  const originalEnv = {
    LIVE_TRADING: process.env.LIVE_TRADING,
    DRY_RUN: process.env.DRY_RUN,
    RPC_MODE: process.env.RPC_MODE,
    RPC_URL: process.env.RPC_URL,
    MICRO_LIVE_COOLDOWN_MS: process.env.MICRO_LIVE_COOLDOWN_MS,
    MICRO_LIVE_MAX_TRADES_PER_WINDOW: process.env.MICRO_LIVE_MAX_TRADES_PER_WINDOW,
    MICRO_LIVE_WINDOW_MS: process.env.MICRO_LIVE_WINDOW_MS,
    MICRO_LIVE_MAX_INFLIGHT: process.env.MICRO_LIVE_MAX_INFLIGHT,
  };

  afterEach(() => {
    if (originalEnv.LIVE_TRADING === undefined) {
      delete process.env.LIVE_TRADING;
    } else {
      process.env.LIVE_TRADING = originalEnv.LIVE_TRADING;
    }
    if (originalEnv.DRY_RUN === undefined) {
      delete process.env.DRY_RUN;
    } else {
      process.env.DRY_RUN = originalEnv.DRY_RUN;
    }
    if (originalEnv.RPC_MODE === undefined) {
      delete process.env.RPC_MODE;
    } else {
      process.env.RPC_MODE = originalEnv.RPC_MODE;
    }
    if (originalEnv.RPC_URL === undefined) {
      delete process.env.RPC_URL;
    } else {
      process.env.RPC_URL = originalEnv.RPC_URL;
    }
    if (originalEnv.MICRO_LIVE_COOLDOWN_MS === undefined) {
      delete process.env.MICRO_LIVE_COOLDOWN_MS;
    } else {
      process.env.MICRO_LIVE_COOLDOWN_MS = originalEnv.MICRO_LIVE_COOLDOWN_MS;
    }
    if (originalEnv.MICRO_LIVE_MAX_TRADES_PER_WINDOW === undefined) {
      delete process.env.MICRO_LIVE_MAX_TRADES_PER_WINDOW;
    } else {
      process.env.MICRO_LIVE_MAX_TRADES_PER_WINDOW = originalEnv.MICRO_LIVE_MAX_TRADES_PER_WINDOW;
    }
    if (originalEnv.MICRO_LIVE_WINDOW_MS === undefined) {
      delete process.env.MICRO_LIVE_WINDOW_MS;
    } else {
      process.env.MICRO_LIVE_WINDOW_MS = originalEnv.MICRO_LIVE_WINDOW_MS;
    }
    if (originalEnv.MICRO_LIVE_MAX_INFLIGHT === undefined) {
      delete process.env.MICRO_LIVE_MAX_INFLIGHT;
    } else {
      process.env.MICRO_LIVE_MAX_INFLIGHT = originalEnv.MICRO_LIVE_MAX_INFLIGHT;
    }
    resetMicroLiveControlForTests();
    resetKillSwitch();
    vi.useRealTimers();
  });

  it("uses the real execution seam, journals deterministically, and fails closed without leaking authority", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00.000Z"));
    process.env.LIVE_TRADING = "true";
    process.env.DRY_RUN = "false";
    process.env.RPC_MODE = "real";
    process.env.RPC_URL = "http://127.0.0.1:8899";
    process.env.MICRO_LIVE_COOLDOWN_MS = "0";
    process.env.MICRO_LIVE_MAX_TRADES_PER_WINDOW = "10";
    process.env.MICRO_LIVE_WINDOW_MS = "60000";
    process.env.MICRO_LIVE_MAX_INFLIGHT = "10";
    armMicroLive("harness-test");

    const intent: TradeIntent = {
      traceId: "harness-trace",
      timestamp: "2026-04-09T12:00:00.000Z",
      idempotencyKey: "harness-key",
      tokenIn: "SOL",
      tokenOut: "USDC",
      amountIn: "1",
      minAmountOut: "0.95",
      slippagePercent: 1,
      dryRun: false,
      executionMode: "live",
    };

    const rpcClient = {
      getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
      getBalance: async () => ({ address: "11111111111111111111111111111111", balance: "10000000000", decimals: 9 }),
      sendRawTransaction: async () => "sig-harness-key",
      getTransactionReceipt: async () => ({ status: "confirmed" }),
    };

    const result = await runControlledObservationExecutionHarness({
      intent,
      rpcClient,
      walletAddress: "11111111111111111111111111111111",
      signer: makeSigner(),
      buildSwapTransaction: async ({ userPublicKey }) => ({
        swapTransaction: makeSerializedTransactionForPayer(userPublicKey),
      }),
    });

    const repeated = await runControlledObservationExecutionHarness({
      intent,
      rpcClient,
      walletAddress: "11111111111111111111111111111111",
      signer: makeSigner(),
      buildSwapTransaction: async ({ userPublicKey }) => ({
        swapTransaction: makeSerializedTransactionForPayer(userPublicKey),
      }),
    });

    expect(repeated).toEqual(result);
    expect(result.blocked).toBe(false);
    expect(result.blockedReason).toBeNull();
    expect(result.executionReport).toMatchObject({
      success: true,
      executionMode: "live",
      paperExecution: false,
      txSignature: "sig-harness-key",
    });
    expect(result.verificationReport).toMatchObject({
      passed: true,
      verificationMode: "rpc",
    });
    expect(result.journalEntries.map((entry) => entry.stage)).toEqual([
      "controlled-observation.execution.request",
      "controlled-observation.execution.result",
    ]);
    expect(result.journalEntries).toHaveLength(2);
    expect(result).not.toHaveProperty("decisionEnvelope");
    expect(result).not.toHaveProperty("decision");
    expect(result).not.toHaveProperty("signal");
    expect(result).not.toHaveProperty("risk");

    const blocked = await runControlledObservationExecutionHarness({
      intent,
      rpcClient,
      walletAddress: "11111111111111111111111111111111",
      // signer intentionally omitted to prove fail-closed behavior.
    });

    expect(blocked.blocked).toBe(true);
    expect(blocked.blockedReason).toContain("MISSING_EXECUTION_ADAPTER_DEPENDENCIES");
    expect(blocked.executionReport).toBeNull();
    expect(blocked.verificationReport).toBeNull();
    expect(blocked.journalEntries.map((entry) => entry.stage)).toEqual([
      "controlled-observation.execution.request",
      "controlled-observation.execution.result",
    ]);
    expect(blocked).not.toHaveProperty("decisionEnvelope");
  });
});
