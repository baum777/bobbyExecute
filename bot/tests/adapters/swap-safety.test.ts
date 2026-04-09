/**
 * M0: Safety Switch - executeSwap must block live path by default.
 */
import { PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { deriveLiveExecutionAttemptId, executeSwap } from "@bot/adapters/dex-execution/swap.js";
import type { TradeIntent } from "@bot/core/contracts/trade.js";

const baseIntent: TradeIntent = {
  traceId: "trace-1",
  timestamp: "2026-03-05T12:00:00.000Z",
  idempotencyKey: "key-1",
  tokenIn: "SOL",
  tokenOut: "USDC",
  amountIn: "1",
  minAmountOut: "0.95",
  slippagePercent: 1,
  dryRun: false,
};

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

function makeSigner() {
  return {
    mode: "remote" as const,
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

describe("Swap Safety (M0)", () => {
  const origEnv = {
    LIVE_TRADING: process.env.LIVE_TRADING,
    RPC_MODE: process.env.RPC_MODE,
    RPC_URL: process.env.RPC_URL,
    TRADING_ENABLED: process.env.TRADING_ENABLED,
    LIVE_TEST_MODE: process.env.LIVE_TEST_MODE,
    JUPITER_API_KEY: process.env.JUPITER_API_KEY,
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    delete process.env.LIVE_TRADING;
    delete process.env.RPC_MODE;
    delete process.env.RPC_URL;
    delete process.env.TRADING_ENABLED;
    delete process.env.LIVE_TEST_MODE;
    delete process.env.JUPITER_API_KEY;
  });

  afterEach(() => {
    if (origEnv.LIVE_TRADING !== undefined) process.env.LIVE_TRADING = origEnv.LIVE_TRADING;
    else delete process.env.LIVE_TRADING;
    if (origEnv.RPC_MODE !== undefined) process.env.RPC_MODE = origEnv.RPC_MODE;
    else delete process.env.RPC_MODE;
    if (origEnv.RPC_URL !== undefined) process.env.RPC_URL = origEnv.RPC_URL;
    else delete process.env.RPC_URL;
    if (origEnv.TRADING_ENABLED !== undefined) process.env.TRADING_ENABLED = origEnv.TRADING_ENABLED;
    else delete process.env.TRADING_ENABLED;
    if (origEnv.LIVE_TEST_MODE !== undefined) process.env.LIVE_TEST_MODE = origEnv.LIVE_TEST_MODE;
    else delete process.env.LIVE_TEST_MODE;
    if (origEnv.JUPITER_API_KEY !== undefined) process.env.JUPITER_API_KEY = origEnv.JUPITER_API_KEY;
    else delete process.env.JUPITER_API_KEY;
    delete process.env.LIVE_QUOTE_MAX_AGE_MS;
    delete process.env.LIVE_VERIFY_MAX_ATTEMPTS;
    delete process.env.LIVE_VERIFY_RETRY_MS;
    delete process.env.LIVE_VERIFY_TIMEOUT_MS;
    vi.unstubAllGlobals();
  });

  it("returns dry result when LIVE_TRADING unset and dryRun=false", async () => {
    const result = await executeSwap(baseIntent);
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
    expect(result.tradeIntentId).toBe("key-1");
  });

  it("returns dry result when LIVE_TRADING=false and dryRun=false", async () => {
    process.env.LIVE_TRADING = "false";
    const result = await executeSwap(baseIntent);
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
  });

  it("returns dry result when LIVE_TRADING empty and dryRun=false", async () => {
    process.env.LIVE_TRADING = "";
    const result = await executeSwap(baseIntent);
    expect(result.dryRun).toBe(true);
  });

  it("preserves explicit paper mode when executionMode=paper and LIVE_TRADING is unset", async () => {
    const result = await executeSwap({ ...baseIntent, executionMode: "paper" });
    expect(result.dryRun).toBe(false);
    expect(result.paperExecution).toBe(true);
    expect(result.success).toBe(true);
  });

  it("returns paper result when intent.dryRun=true regardless of LIVE_TRADING", async () => {
    process.env.LIVE_TRADING = "true";
    const result = await executeSwap({ ...baseIntent, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
  });

  it("throws when LIVE_TRADING=true and dryRun=false (real path requires deps or RPC_MODE=stub)", async () => {
    process.env.LIVE_TRADING = "true";
    await expect(executeSwap(baseIntent)).rejects.toThrow(
      /not implemented|paper-trade|RPC_MODE=real|requires|SwapDeps/
    );
  });

  it("interprets LIVE_TRADING=true case-insensitively", async () => {
    process.env.LIVE_TRADING = "True";
    await expect(executeSwap(baseIntent)).rejects.toThrow();
  });

  it("passes JUPITER_API_KEY through live quote and swap requests", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.RPC_URL = "https://api.mainnet-beta.solana.com";
    process.env.TRADING_ENABLED = "true";
    process.env.LIVE_TEST_MODE = "true";
    process.env.JUPITER_API_KEY = "jupiter-test-key";

    const fetchFn = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchFn
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          outAmount: "95000000",
          otherAmountThreshold: "94050000",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          swapTransaction: makeSerializedTransaction(),
        }),
      });

    const deps = {
      rpcClient: {
        sendRawTransaction: vi.fn(async () => "sig-live-swap"),
        getTransactionReceipt: vi.fn(async () => ({ status: "confirmed" })),
      },
      walletPublicKey: "11111111111111111111111111111111",
      signer: makeSigner(),
    };

    const result = await executeSwap(
      { ...baseIntent, executionMode: "live", dryRun: false },
      undefined,
      deps
    );

    expect(result.success).toBe(true);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const quoteInit = fetchFn.mock.calls[0][1] as RequestInit;
    const swapInit = fetchFn.mock.calls[1][1] as RequestInit;
    expect(quoteInit.headers).toEqual(expect.objectContaining({ "x-api-key": "jupiter-test-key" }));
    expect(swapInit.headers).toEqual(expect.objectContaining({ "x-api-key": "jupiter-test-key" }));
  });

  it("fails clearly when JUPITER_API_KEY is missing in live mode", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.RPC_URL = "https://api.mainnet-beta.solana.com";
    process.env.TRADING_ENABLED = "true";
    process.env.LIVE_TEST_MODE = "true";
    delete process.env.JUPITER_API_KEY;

    const fetchFn = globalThis.fetch as ReturnType<typeof vi.fn>;
    const deps = {
      rpcClient: {
        sendRawTransaction: vi.fn(async () => "sig-live-swap"),
        getTransactionReceipt: vi.fn(async () => ({ status: "confirmed" })),
      },
      walletPublicKey: "11111111111111111111111111111111",
      signer: makeSigner(),
    };

    const result = await executeSwap(
      { ...baseIntent, executionMode: "live", dryRun: false },
      undefined,
      deps
    );

    expect(result.success).toBe(false);
    expect(result.failureStage).toBe("quote");
    expect(result.failureCode).toBe("live_quote_failed");
    expect(result.error).toMatch(/JUPITER_API_KEY|Jupiter API key/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("keeps live artifacts deterministic for the same input", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.RPC_URL = "https://api.mainnet-beta.solana.com";
    process.env.LIVE_QUOTE_MAX_AGE_MS = "999999999999";

    const quote = makeFreshQuote({
      quoteId: "q-deterministic",
      fetchedAt: "2026-03-05T12:00:00.000Z",
    });
    const deps = {
      rpcClient: {
        sendRawTransaction: vi.fn(async () => "sig-deterministic"),
        getTransactionReceipt: vi.fn(async () => ({ status: "confirmed" })),
      },
      walletPublicKey: "11111111111111111111111111111111",
      signer: makeSigner(),
      buildSwapTransaction: async () => ({ swapTransaction: makeSerializedTransaction() }),
      verifyTransaction: async () => ({ status: "confirmed" }),
    };

    const first = await executeSwap(
      { ...baseIntent, executionMode: "live", dryRun: false },
      quote,
      deps
    );
    const second = await executeSwap(
      { ...baseIntent, executionMode: "live", dryRun: false },
      quote,
      {
        ...deps,
        rpcClient: {
          sendRawTransaction: vi.fn(async () => "sig-deterministic"),
          getTransactionReceipt: vi.fn(async () => ({ status: "confirmed" })),
        },
      }
    );

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.txSignature).toBe("sig-deterministic");
    const { quote: firstQuote, ...firstArtifacts } = first.artifacts as Record<string, unknown>;
    const { quote: secondQuote, ...secondArtifacts } = second.artifacts as Record<string, unknown>;
    expect(firstArtifacts).toEqual(secondArtifacts);
    expect(firstQuote).toMatchObject({
      fetchedAt: "2026-03-05T12:00:00.000Z",
      maxAgeMs: 999999999999,
    });
    expect(secondQuote).toMatchObject({
      fetchedAt: "2026-03-05T12:00:00.000Z",
      maxAgeMs: 999999999999,
    });
    expect(first.artifacts).toMatchObject({
      attemptId: deriveLiveExecutionAttemptId({ ...baseIntent, executionMode: "live", dryRun: false }),
      startedAt: baseIntent.timestamp,
      completedAt: baseIntent.timestamp,
      verification: {
        confirmed: true,
        attempts: 1,
      },
    });
  });

  it("retries verification without creating duplicate send effects", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.RPC_URL = "https://api.mainnet-beta.solana.com";
    process.env.LIVE_QUOTE_MAX_AGE_MS = "999999999999";
    process.env.LIVE_VERIFY_MAX_ATTEMPTS = "3";
    process.env.LIVE_VERIFY_RETRY_MS = "0";

    const sendRawTransaction = vi.fn(async () => "sig-retry");
    const verifyTransaction = vi
      .fn()
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "confirmed" });

    const result = await executeSwap(
      { ...baseIntent, executionMode: "live", dryRun: false },
      makeFreshQuote({
        quoteId: "q-retry",
        fetchedAt: "2026-03-05T12:00:00.000Z",
      }),
      {
        rpcClient: {
          sendRawTransaction,
          getTransactionReceipt: verifyTransaction,
        },
        walletPublicKey: "11111111111111111111111111111111",
        signer: makeSigner(),
        buildSwapTransaction: async () => ({ swapTransaction: makeSerializedTransaction() }),
      }
    );

    expect(result.success).toBe(true);
    expect(sendRawTransaction).toHaveBeenCalledTimes(1);
    expect(verifyTransaction).toHaveBeenCalledTimes(2);
    expect(result.artifacts).toMatchObject({
      verification: {
        attempted: true,
        confirmed: true,
        attempts: 2,
        maxAttempts: 3,
        retryMs: 0,
      },
    });
  });
});
