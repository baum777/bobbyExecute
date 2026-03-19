/**
 * Wave 5: Live execution route hardening integration tests.
 */
import { afterEach, describe, expect, it } from "vitest";
import { PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { createExecutionHandler } from "../../src/agents/execution.agent.js";
import { createRpcClient } from "../../src/adapters/rpc-verify/client.js";
import type { TradeIntent } from "../../src/core/contracts/trade.js";
import {
  armMicroLive,
  disarmMicroLive,
  resetMicroLiveControlForTests,
} from "../../src/runtime/live-control.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";

const baseIntent: TradeIntent = {
  traceId: "exec-int-trace",
  timestamp: "2026-03-06T12:00:00.000Z",
  idempotencyKey: "exec-int-key",
  tokenIn: "SOL",
  tokenOut: "USDC",
  amountIn: "1",
  minAmountOut: "0.95",
  slippagePercent: 1,
  dryRun: false,
};

const liveIntent: TradeIntent = {
  ...baseIntent,
  traceId: "exec-live-trace",
  idempotencyKey: "exec-live-key",
  executionMode: "live",
};

function makeFreshQuote(overrides: Record<string, unknown> = {}) {
  return {
    quoteId: "q-live",
    amountOut: "123",
    minAmountOut: "120",
    fetchedAt: new Date().toISOString(),
    slippageBps: 100,
    rawQuotePayload: { routePlan: [] },
    ...overrides,
  };
}

function makeSerializedTransaction(): string {
  const payer = new PublicKey("11111111111111111111111111111111");
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: "11111111111111111111111111111111",
    instructions: [],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  return Buffer.from(tx.serialize()).toString("base64");
}

describe("Execution integration (Wave 5 live route)", () => {
  afterEach(() => {
    delete process.env.LIVE_TRADING;
    delete process.env.RPC_MODE;
    delete process.env.LIVE_VERIFY_MAX_ATTEMPTS;
    delete process.env.LIVE_VERIFY_TIMEOUT_MS;
    delete process.env.LIVE_VERIFY_RETRY_MS;
    delete process.env.LIVE_QUOTE_MAX_AGE_MS;
    delete process.env.MICRO_LIVE_REQUIRE_ARM;
    delete process.env.MICRO_LIVE_MAX_NOTIONAL;
    delete process.env.MICRO_LIVE_MAX_TRADES_PER_WINDOW;
    delete process.env.MICRO_LIVE_WINDOW_MS;
    delete process.env.MICRO_LIVE_COOLDOWN_MS;
    delete process.env.MICRO_LIVE_MAX_INFLIGHT;
    delete process.env.MICRO_LIVE_FAILURES_TO_BLOCK;
    delete process.env.MICRO_LIVE_FAILURE_WINDOW_MS;
    resetMicroLiveControlForTests();
    resetKillSwitch();
  });

  it("paper mode remains unchanged", async () => {
    const handler = await createExecutionHandler();
    const result = await handler(baseIntent);

    expect(result.success).toBe(true);
    expect(result.executionMode).toBe("paper");
    expect(result.paperExecution).toBe(true);
  });

  it("live fails closed on partial dependency bundle", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    armMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: createRpcClient(),
      walletAddress: "11111111111111111111111111111111",
    });
    const result = await handler(liveIntent);

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("live_dependency_incomplete");
    expect(result.failureStage).toBe("preflight");
    expect(result.failClosed).toBe(true);
  });

  it("live fails closed when quote fetch fails", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    armMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: {
        sendRawTransaction: async () => "sig",
        getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
        getBalance: async () => ({ address: "a", balance: "10000000000", decimals: 9 }),
        getTransactionReceipt: async () => ({ status: "confirmed" }),
      },
      walletAddress: "11111111111111111111111111111111",
      signTransaction: async (tx) => tx,
      quoteFetcher: async () => {
        throw new Error("quote endpoint unavailable");
      },
    });
    const result = await handler(liveIntent);

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("live_quote_failed");
    expect(result.failureStage).toBe("quote");
    expect(result.failClosed).toBe(true);
  });

  it("live fails closed on stale quote", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.LIVE_QUOTE_MAX_AGE_MS = "1000";
    armMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: {
        sendRawTransaction: async () => "sig",
        getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
        getBalance: async () => ({ address: "a", balance: "10000000000", decimals: 9 }),
        getTransactionReceipt: async () => ({ status: "confirmed" }),
      },
      walletAddress: "11111111111111111111111111111111",
      signTransaction: async (tx) => tx,
      quoteFetcher: async () =>
        makeFreshQuote({
          fetchedAt: "2024-01-01T00:00:00.000Z",
        }),
    });
    const result = await handler(liveIntent);

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("live_quote_stale");
    expect(result.failureStage).toBe("quote");
  });

  it("live fails closed on invalid quote payload", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    armMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: {
        sendRawTransaction: async () => "sig",
        getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
        getBalance: async () => ({ address: "a", balance: "10000000000", decimals: 9 }),
        getTransactionReceipt: async () => ({ status: "confirmed" }),
      },
      walletAddress: "11111111111111111111111111111111",
      signTransaction: async (tx) => tx,
      quoteFetcher: async () => makeFreshQuote({ minAmountOut: "0" }),
    });
    const result = await handler(liveIntent);

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("live_quote_invalid");
    expect(result.failureStage).toBe("quote");
  });

  it("live fails closed on invalid swap payload", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    armMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: {
        sendRawTransaction: async () => "sig",
        getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
        getBalance: async () => ({ address: "a", balance: "10000000000", decimals: 9 }),
        getTransactionReceipt: async () => ({ status: "confirmed" }),
      },
      walletAddress: "11111111111111111111111111111111",
      signTransaction: async (tx) => tx,
      quoteFetcher: async () => makeFreshQuote(),
      buildSwapTransaction: async () => ({ swapTransaction: "not-base64" }),
    });
    const result = await handler(liveIntent);

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("live_swap_payload_invalid");
    expect(result.failClosed).toBe(true);
  });

  it("live fails closed when signing is unavailable at runtime", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    armMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: {
        sendRawTransaction: async () => "sig",
        getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
        getBalance: async () => ({ address: "a", balance: "10000000000", decimals: 9 }),
        getTransactionReceipt: async () => ({ status: "confirmed" }),
      },
      walletAddress: "11111111111111111111111111111111",
      signTransaction: async () => {
        throw new Error("wallet signer unavailable");
      },
      quoteFetcher: async () => makeFreshQuote(),
      buildSwapTransaction: async () => ({ swapTransaction: makeSerializedTransaction() }),
    });
    const result = await handler(liveIntent);

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("live_signing_unavailable");
    expect(result.failureStage).toBe("signing");
  });

  it("live fails closed on ambiguous send result", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    armMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: {
        sendRawTransaction: async () => "",
        getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
        getBalance: async () => ({ address: "a", balance: "10000000000", decimals: 9 }),
        getTransactionReceipt: async () => ({ status: "confirmed" }),
      },
      walletAddress: "11111111111111111111111111111111",
      signTransaction: async (tx) => tx,
      quoteFetcher: async () => makeFreshQuote(),
      buildSwapTransaction: async () => ({ swapTransaction: makeSerializedTransaction() }),
    });
    const result = await handler(liveIntent);

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("live_send_ambiguous");
    expect(result.failureStage).toBe("send");
  });

  it("live fails closed on verification timeout", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.LIVE_VERIFY_MAX_ATTEMPTS = "1";
    process.env.LIVE_VERIFY_TIMEOUT_MS = "10";
    process.env.LIVE_VERIFY_RETRY_MS = "0";
    armMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: {
        sendRawTransaction: async () => "sig-timeout",
        getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
        getBalance: async () => ({ address: "a", balance: "10000000000", decimals: 9 }),
      },
      walletAddress: "11111111111111111111111111111111",
      signTransaction: async (tx) => tx,
      quoteFetcher: async () => makeFreshQuote(),
      buildSwapTransaction: async () => ({ swapTransaction: makeSerializedTransaction() }),
      verifyTransaction: () => new Promise(() => undefined),
    });
    const result = await handler(liveIntent);

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("live_verification_timeout");
    expect(result.failureStage).toBe("verification");
  });

  it("live succeeds only when quote -> build -> sign/send -> verify all succeed", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    armMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: {
        sendRawTransaction: async () => "sig-success",
        getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
        getBalance: async () => ({ address: "a", balance: "10000000000", decimals: 9 }),
        getTransactionReceipt: async () => ({ status: "confirmed" }),
      },
      walletAddress: "11111111111111111111111111111111",
      signTransaction: async (tx) => tx,
      quoteFetcher: async () => makeFreshQuote(),
      buildSwapTransaction: async () => ({ swapTransaction: makeSerializedTransaction() }),
      verifyTransaction: async () => ({ status: "confirmed" }),
    });
    const result = await handler(liveIntent);

    expect(result.success).toBe(true);
    expect(result.executionMode).toBe("live");
    expect(result.paperExecution).toBe(false);
    expect(result.txSignature).toBe("sig-success");
    expect(result.artifacts).toMatchObject({
      mode: "live",
      verification: {
        confirmed: true,
      },
    });
  });

  it("live attempts always include mandatory artifacts", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    armMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: {
        sendRawTransaction: async () => "sig",
        getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
        getBalance: async () => ({ address: "a", balance: "10000000000", decimals: 9 }),
        getTransactionReceipt: async () => ({ status: "failed" }),
      },
      walletAddress: "11111111111111111111111111111111",
      signTransaction: async (tx) => tx,
      quoteFetcher: async () => makeFreshQuote(),
      buildSwapTransaction: async () => ({ swapTransaction: makeSerializedTransaction() }),
      verifyTransaction: async () => ({ status: "failed" }),
    });

    const result = await handler(liveIntent);
    expect(result.success).toBe(false);
    expect(result.artifacts).toMatchObject({
      mode: "live",
      intent: {
        tradeIntentId: "exec-live-key",
      },
      send: {
        txSignature: "sig",
      },
      verification: {
        attempted: true,
      },
    });
  });

  it("live remains fail-closed while disarmed", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    disarmMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: createRpcClient(),
      walletAddress: "11111111111111111111111111111111",
      signTransaction: async (tx) => tx,
    });

    const result = await handler(liveIntent);
    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("micro_live_disarmed");
  });
});
