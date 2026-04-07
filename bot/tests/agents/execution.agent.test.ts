/**
 * Execution agent - live boundary and fail-closed behavior.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createExecutionHandler } from "@bot/agents/execution.agent.js";
import { createRpcClient } from "@bot/adapters/rpc-verify/client.js";
import { deriveLiveExecutionAttemptId } from "@bot/adapters/dex-execution/swap.js";
import type { TradeIntent } from "@bot/core/contracts/trade.js";
import { InMemoryExecutionRepository } from "@bot/persistence/execution-repository.js";
import { InMemoryIncidentRepository } from "@bot/persistence/incident-repository.js";
import { RepositoryIncidentRecorder } from "@bot/observability/incidents.js";
import {
  armMicroLive,
  disarmMicroLive,
  getMicroLiveControlSnapshot,
  killMicroLive,
  resetMicroLiveControlForTests,
} from "@bot/runtime/live-control.js";
import { resetKillSwitch } from "@bot/governance/kill-switch.js";

const baseIntent: TradeIntent = {
  traceId: "exec-test-trace",
  timestamp: "2026-03-05T12:00:00.000Z",
  idempotencyKey: "exec-key-1",
  tokenIn: "SOL",
  tokenOut: "USDC",
  amountIn: "1",
  minAmountOut: "0.95",
  slippagePercent: 1,
  dryRun: false,
};

function makeSigner() {
  return {
    mode: "remote" as const,
    keyId: "remote-key-1",
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

describe("createExecutionHandler", () => {
  afterEach(() => {
    delete process.env.LIVE_TRADING;
    delete process.env.RPC_MODE;
    delete process.env.TRADING_ENABLED;
    delete process.env.LIVE_TEST_MODE;
    delete process.env.MICRO_LIVE_REQUIRE_ARM;
    delete process.env.MICRO_LIVE_MAX_NOTIONAL;
    delete process.env.MICRO_LIVE_MAX_TRADES_PER_WINDOW;
    delete process.env.MICRO_LIVE_WINDOW_MS;
    delete process.env.MICRO_LIVE_COOLDOWN_MS;
    delete process.env.MICRO_LIVE_MAX_INFLIGHT;
    delete process.env.MICRO_LIVE_FAILURES_TO_BLOCK;
    delete process.env.MICRO_LIVE_FAILURE_WINDOW_MS;
    delete process.env.LIVE_VERIFY_MAX_ATTEMPTS;
    delete process.env.LIVE_VERIFY_TIMEOUT_MS;
    delete process.env.LIVE_VERIFY_RETRY_MS;
    delete process.env.LIVE_QUOTE_MAX_AGE_MS;
    delete process.env.JUPITER_API_KEY;
    delete process.env.ROLLOUT_POSTURE;
    resetMicroLiveControlForTests();
    resetKillSwitch();
  });

  it("keeps paper behavior unchanged for non-live intents", async () => {
    const handler = await createExecutionHandler();
    const result = await handler(baseIntent);
    expect(result.success).toBe(true);
    expect(result.executionMode).toBe("paper");
    expect(result.paperExecution).toBe(true);
  });

  it("runs verifyBeforeTrade and executeSwap when verify deps are present", async () => {
    const rpcClient = createRpcClient();
    const handler = await createExecutionHandler({
      rpcClient,
      walletAddress: "11111111111111111111111111111111",
    });
    const result = await handler(baseIntent);
    expect(result.success).toBe(true);
    expect(result.executionMode).toBe("paper");
    expect(result.paperExecution).toBe(true);
  });

  it("fails when verifyBeforeTrade returns passed=false", async () => {
    const failingRpc = {
      getTokenInfo: async () => ({ mint: "x", decimals: 0, exists: false }),
      getBalance: async () => ({ address: "a", balance: "0", decimals: 9 }),
      getTransactionReceipt: async () => ({}),
    } as import("@bot/adapters/rpc-verify/client.js").RpcClient;
    const swapExecutor = vi.fn();
    const quoteFetcher = vi.fn();
    const handler = await createExecutionHandler({
      rpcClient: failingRpc,
      walletAddress: "addr",
      quoteFetcher,
      swapExecutor,
    });
    const result = await handler(baseIntent);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(quoteFetcher).not.toHaveBeenCalled();
    expect(swapExecutor).not.toHaveBeenCalled();
  });

  it("fails closed for live intent when signer is missing", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    armMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: createRpcClient(),
      walletAddress: "11111111111111111111111111111111",
    });
    const result = await handler({
      ...baseIntent,
      executionMode: "live",
    });

    expect(result.success).toBe(false);
    expect(result.executionMode).toBe("live");
    expect(result.failureCode).toBe("live_dependency_incomplete");
    expect(result.failClosed).toBe(true);
  });

  it("rejects synthetic live success that lacks verification evidence", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    armMicroLive("test");

    const quoteFetcher = vi.fn().mockResolvedValue({
      quoteId: "q-live",
      amountOut: "200",
      minAmountOut: "190",
      fetchedAt: new Date().toISOString(),
      slippageBps: 100,
      rawQuotePayload: { routePlan: [] },
    });
    const swapExecutor = vi.fn().mockResolvedValue({
      traceId: "exec-test-trace",
      timestamp: "2026-03-05T12:00:00.000Z",
      tradeIntentId: "exec-key-1",
      success: true,
      executionMode: "live",
      dryRun: false,
      paperExecution: false,
      txSignature: "sig-live",
      artifacts: {},
    });

    const handler = await createExecutionHandler({
      rpcClient: {
        sendRawTransaction: async () => "sig",
        getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
        getBalance: async () => ({ address: "a", balance: "10000000000", decimals: 9 }),
        getTransactionReceipt: async () => ({}),
      },
      walletAddress: "11111111111111111111111111111111",
      signer: makeSigner(),
      quoteFetcher,
      swapExecutor,
    });
    const result = await handler({
      ...baseIntent,
      executionMode: "live",
    });

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("live_verification_failed");
    expect(result.failClosed).toBe(true);
    expect(quoteFetcher).toHaveBeenCalledTimes(1);
    expect(swapExecutor).toHaveBeenCalledTimes(1);
  });

  it("fails closed for live intents while disarmed", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    disarmMicroLive("test");

    const quoteFetcher = vi.fn();
    const swapExecutor = vi.fn();
    const handler = await createExecutionHandler({
      rpcClient: {
        sendRawTransaction: async () => "sig",
        getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
        getBalance: async () => ({ address: "a", balance: "10000000000", decimals: 9 }),
        getTransactionReceipt: async () => ({ status: "confirmed" }),
      },
      walletAddress: "11111111111111111111111111111111",
      signer: makeSigner(),
      quoteFetcher,
      swapExecutor,
    });
    const result = await handler({ ...baseIntent, executionMode: "live" });

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("micro_live_disarmed");
    expect(result.failClosed).toBe(true);
    expect(quoteFetcher).not.toHaveBeenCalled();
    expect(swapExecutor).not.toHaveBeenCalled();
  });

  it("fails closed without delegating to execution when live trading is disabled", async () => {
    delete process.env.LIVE_TRADING;
    process.env.RPC_MODE = "real";
    armMicroLive("test");

    const quoteFetcher = vi.fn();
    const swapExecutor = vi.fn();
    const handler = await createExecutionHandler({
      rpcClient: {
        sendRawTransaction: async () => "sig",
        getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
        getBalance: async () => ({ address: "a", balance: "10000000000", decimals: 9 }),
        getTransactionReceipt: async () => ({ status: "confirmed" }),
      },
      walletAddress: "11111111111111111111111111111111",
      signer: makeSigner(),
      quoteFetcher,
      swapExecutor,
    });
    const result = await handler({ ...baseIntent, executionMode: "live" });

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("live_not_enabled");
    expect(result.failClosed).toBe(true);
    expect(quoteFetcher).not.toHaveBeenCalled();
    expect(swapExecutor).not.toHaveBeenCalled();
  });

  it("blocks live intent when kill switch is active", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    armMicroLive("test");
    killMicroLive("test-kill");

    const handler = await createExecutionHandler({
      rpcClient: createRpcClient(),
      walletAddress: "11111111111111111111111111111111",
      signer: makeSigner(),
    });
    const result = await handler({ ...baseIntent, executionMode: "live" });

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("micro_live_killed");
  });

  it("persists live refusals through execution and incident repositories", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.ROLLOUT_POSTURE = "paper_only";

    const executionRepository = new InMemoryExecutionRepository();
    const incidentRepository = new InMemoryIncidentRepository();
    const handler = await createExecutionHandler({
      rpcClient: createRpcClient(),
      walletAddress: "11111111111111111111111111111111",
      signer: makeSigner(),
      executionEvidenceRepository: executionRepository,
      incidentRecorder: new RepositoryIncidentRecorder(incidentRepository),
    });
    const result = await handler({ ...baseIntent, executionMode: "live", idempotencyKey: "paper-only-live" });

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("micro_live_blocked");

    const evidence = await executionRepository.listByTradeIntentId("paper-only-live");
    expect(evidence.map((record) => record.kind)).toContain("live_refusal_summary");
    expect(evidence.map((record) => record.kind)).toContain("execution_summary");
    expect(evidence.at(0)?.allowed).toBe(false);
    expect(evidence.at(0)?.failureCode).toBe("micro_live_blocked");

    const incidents = await incidentRepository.list(10);
    expect(incidents.some((incident) => incident.type === "live_guardrail_refused")).toBe(true);
  });

  it("persists execution attempts and verification outcomes for a verified live success", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    armMicroLive("test");

    const executionRepository = new InMemoryExecutionRepository();
    const swapExecutor = vi.fn().mockResolvedValue({
      traceId: baseIntent.traceId,
      timestamp: baseIntent.timestamp,
      tradeIntentId: baseIntent.idempotencyKey,
      success: true,
      txSignature: "sig-verified",
      actualAmountOut: "200",
      dryRun: false,
      executionMode: "live",
      paperExecution: false,
      failClosed: false,
      artifacts: {
        mode: "live",
        attemptId: deriveLiveExecutionAttemptId({ ...baseIntent, executionMode: "live" }),
        verification: {
          attempted: true,
          confirmed: true,
          attempts: 1,
          maxAttempts: 3,
          retryMs: 500,
          timeoutMs: 4000,
          receiptState: "confirmed",
        },
      },
    });
    const handler = await createExecutionHandler({
      rpcClient: {
        getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
        getBalance: async () => ({ address: "a", balance: "10000000000", decimals: 9 }),
        sendRawTransaction: async () => "sig-verified",
        getTransactionReceipt: async () => ({ status: "confirmed" }),
      },
      walletAddress: "11111111111111111111111111111111",
      signer: makeSigner(),
      quoteFetcher: vi.fn().mockResolvedValue({
        quoteId: "q-verified",
        amountOut: "200",
        minAmountOut: "190",
        fetchedAt: new Date().toISOString(),
        slippageBps: 100,
        rawQuotePayload: { routePlan: [] },
      }),
      swapExecutor,
      executionEvidenceRepository: executionRepository,
    });

    const result = await handler({ ...baseIntent, executionMode: "live", idempotencyKey: "verified-live" });

    expect(result.success).toBe(true);
    expect(swapExecutor).toHaveBeenCalledTimes(1);

    const evidence = await executionRepository.listByTradeIntentId("verified-live");
    expect(evidence.map((record) => record.kind)).toEqual([
      "decision_summary",
      "execution_attempt_summary",
      "execution_summary",
      "verification_outcome",
    ]);

    const attempt = evidence.find((record) => record.kind === "execution_attempt_summary");
    expect(attempt?.details?.attemptId).toBe(
      deriveLiveExecutionAttemptId({
        ...baseIntent,
        executionMode: "live",
        idempotencyKey: "verified-live",
      })
    );
    expect(attempt?.details?.quoteRequested).toBe(true);

    const verification = evidence.find((record) => record.kind === "verification_outcome");
    expect(verification?.allowed).toBe(true);
    expect(verification?.details?.confirmed).toBe(true);
    expect(verification?.details?.attempts).toBe(1);
  });

  it("blocks paused or rolled back rollout posture and marks the refusal as durably reviewable", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.ROLLOUT_POSTURE = "paused_or_rolled_back";

    const executionRepository = new InMemoryExecutionRepository();
    const handler = await createExecutionHandler({
      rpcClient: createRpcClient(),
      walletAddress: "11111111111111111111111111111111",
      signer: makeSigner(),
      executionEvidenceRepository: executionRepository,
    });
    const result = await handler({ ...baseIntent, executionMode: "live", idempotencyKey: "rolled-back-live" });

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("micro_live_blocked");
    const evidence = await executionRepository.listByTradeIntentId("rolled-back-live");
    expect(evidence.some((record) => record.kind === "live_refusal_summary")).toBe(true);
    expect(evidence.some((record) => record.allowed === false)).toBe(true);
  });

  it("fails closed when rollout posture configuration is malformed", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.ROLLOUT_POSTURE = "totally-invalid";

    const handler = await createExecutionHandler({
      rpcClient: createRpcClient(),
      walletAddress: "11111111111111111111111111111111",
      signer: makeSigner(),
    });
    const result = await handler({ ...baseIntent, executionMode: "live", idempotencyKey: "invalid-rollout" });

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("micro_live_config_invalid");
    expect(result.failClosed).toBe(true);
  });

  it("enforces max notional cap deterministically", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.MICRO_LIVE_MAX_NOTIONAL = "0.5";
    armMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: createRpcClient(),
      walletAddress: "11111111111111111111111111111111",
      signer: makeSigner(),
    });
    const result = await handler({
      ...baseIntent,
      executionMode: "live",
      amountIn: "1",
    });

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("micro_live_notional_cap_exceeded");
  });

  it("enforces cooldown/trade frequency caps", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.MICRO_LIVE_MAX_TRADES_PER_WINDOW = "5";
    process.env.MICRO_LIVE_WINDOW_MS = "60000";
    process.env.MICRO_LIVE_COOLDOWN_MS = "3600000";
    armMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: {
        sendRawTransaction: async () => "sig-live",
        getTokenInfo: async () => ({ mint: "mint", decimals: 9, exists: true }),
        getBalance: async () => ({ address: "a", balance: "10000000000", decimals: 9 }),
        getTransactionReceipt: async () => ({ status: "confirmed" }),
      },
      walletAddress: "11111111111111111111111111111111",
      signer: makeSigner(),
      quoteFetcher: vi.fn().mockResolvedValue({
        quoteId: "q-live",
        amountOut: "200",
        minAmountOut: "190",
        fetchedAt: new Date().toISOString(),
        slippageBps: 100,
        rawQuotePayload: { routePlan: [] },
      }),
      swapExecutor: vi.fn().mockResolvedValue({
        traceId: "exec-test-trace",
        timestamp: "2026-03-05T12:00:00.000Z",
        tradeIntentId: "exec-key-1",
        success: true,
        executionMode: "live",
        dryRun: false,
        paperExecution: false,
        txSignature: "sig-live",
        artifacts: { verification: { confirmed: true } },
      }),
    });

    const first = await handler({ ...baseIntent, executionMode: "live" });
    const second = await handler({ ...baseIntent, executionMode: "live", idempotencyKey: "exec-key-2" });

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.failureCode).toBe("micro_live_cooldown_active");
  });

  it("blocks after repeated live failures and requires manual re-arm", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.MICRO_LIVE_FAILURES_TO_BLOCK = "2";
    process.env.MICRO_LIVE_FAILURE_WINDOW_MS = "600000";
    armMicroLive("test");

    const handler = await createExecutionHandler({
      rpcClient: createRpcClient(),
      walletAddress: "11111111111111111111111111111111",
      signer: {
        mode: "remote" as const,
        sign: vi.fn(async () => {
          throw new Error("signing unavailable");
        }),
      },
      quoteFetcher: vi.fn().mockResolvedValue({
        quoteId: "q-live",
        amountOut: "200",
        minAmountOut: "190",
        fetchedAt: new Date().toISOString(),
        slippageBps: 100,
        rawQuotePayload: { routePlan: [] },
      }),
      swapExecutor: vi.fn(),
    });

    const first = await handler({ ...baseIntent, executionMode: "live", idempotencyKey: "fail-1" });
    const second = await handler({ ...baseIntent, executionMode: "live", idempotencyKey: "fail-2" });
    const third = await handler({ ...baseIntent, executionMode: "live", idempotencyKey: "fail-3" });

    expect(first.success).toBe(false);
    expect(second.success).toBe(false);
    expect(getMicroLiveControlSnapshot().posture).toBe("live_blocked");
    expect(third.success).toBe(false);
    expect(third.failureCode).toBe("micro_live_blocked");
  });

  it("enforces max in-flight live attempts", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.MICRO_LIVE_MAX_INFLIGHT = "1";
    armMicroLive("test");

    let release: (() => void) | undefined;
    const waitForRelease = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = await createExecutionHandler({
      rpcClient: createRpcClient(),
      walletAddress: "11111111111111111111111111111111",
      signer: makeSigner(),
      quoteFetcher: vi.fn().mockResolvedValue({
        quoteId: "q-live",
        amountOut: "200",
        minAmountOut: "190",
        fetchedAt: new Date().toISOString(),
        slippageBps: 100,
        rawQuotePayload: { routePlan: [] },
      }),
      swapExecutor: vi.fn().mockImplementation(async (intent) => {
        await waitForRelease;
        return {
          traceId: intent.traceId,
          timestamp: intent.timestamp,
          tradeIntentId: intent.idempotencyKey,
          success: true,
          executionMode: "live",
          dryRun: false,
          paperExecution: false,
          txSignature: "sig-live",
          artifacts: { verification: { confirmed: true } },
        };
      }),
    });

    const firstPromise = handler({ ...baseIntent, executionMode: "live", idempotencyKey: "inflight-1" });
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && getMicroLiveControlSnapshot().counters.inFlight < 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(getMicroLiveControlSnapshot().counters.inFlight).toBe(1);
    const second = await handler({ ...baseIntent, executionMode: "live", idempotencyKey: "inflight-2" });

    expect(second.success).toBe(false);
    expect(second.failureCode).toBe("micro_live_inflight_cap_exceeded");

    release?.();
    const first = await firstPromise;
    expect(first.failureCode).not.toBe("micro_live_inflight_cap_exceeded");
  });
});
