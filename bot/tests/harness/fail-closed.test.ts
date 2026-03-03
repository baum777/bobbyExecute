/**
 * Fail-closed test - missing RPC verify blocks trade.
 * PROPOSED - governance enforcement.
 */
import { describe, it, expect } from "vitest";
import { Engine } from "@bot/core/engine.js";
import { FakeClock } from "@bot/core/clock.js";
import { InMemoryActionLogger } from "@bot/observability/action-log.js";
import type { MarketSnapshot } from "@bot/core/contracts/market.js";
import type { WalletSnapshot } from "@bot/core/contracts/wallet.js";

describe("Fail-closed", () => {
  it("blocks trade when RPC verification fails", async () => {
    const clock = new FakeClock("2025-03-01T12:00:00.000Z");
    const actionLogger = new InMemoryActionLogger();

    const market: MarketSnapshot = {
      traceId: "fail-trace",
      timestamp: clock.now().toISOString(),
      source: "dexpaprika",
      poolId: "pool1",
      baseToken: "SOL",
      quoteToken: "USD",
      priceUsd: 150,
      volume24h: 1000,
      liquidity: 50000,
    };
    const wallet: WalletSnapshot = {
      traceId: "fail-trace",
      timestamp: clock.now().toISOString(),
      source: "moralis",
      walletAddress: "addr1",
      balances: [],
    };

    const engine = new Engine({ clock, actionLogger, dryRun: true });

    const ingest = async () => ({ market, wallet });
    const signalFn = async () => ({ direction: "hold", confidence: 0.5 });
    const riskFn = async () => ({ allowed: true });
    const executeFn = async (intent) => ({
      traceId: intent.traceId,
      timestamp: intent.timestamp,
      tradeIntentId: intent.idempotencyKey,
      success: true,
    });
    const verifyFn = async () => ({
      traceId: "fail-trace",
      timestamp: clock.now().toISOString(),
      passed: false,
      checks: { tokenMint: false },
      reason: "RPC verification failed",
    });

    const state = await engine.run(ingest, signalFn, riskFn, executeFn, verifyFn);

    expect(state.blocked).toBe(true);
    expect(state.blockedReason).toContain("RPC verification");
    expect(state.rpcVerification?.passed).toBe(false);

    const logs = actionLogger.list();
    const blockedLog = logs.find((l) => l.blocked);
    expect(blockedLog).toBeDefined();
  });

  it("blocks when risk assessment denies", async () => {
    const clock = new FakeClock("2025-03-01T12:00:00.000Z");
    const actionLogger = new InMemoryActionLogger();
    const market: MarketSnapshot = {
      traceId: "risk-fail",
      timestamp: clock.now().toISOString(),
      source: "dexpaprika",
      poolId: "p1",
      baseToken: "SOL",
      quoteToken: "USD",
      priceUsd: 100,
      volume24h: 500,
      liquidity: 10000,
    };
    const wallet: WalletSnapshot = {
      traceId: "risk-fail",
      timestamp: clock.now().toISOString(),
      source: "moralis",
      walletAddress: "addr",
      balances: [],
    };

    const engine = new Engine({ clock, actionLogger, dryRun: true });
    const ingest = async () => ({ market, wallet });
    const signalFn = async () => ({ direction: "hold", confidence: 0.5 });
    const riskFn = async () => ({ allowed: false, reason: "Slippage too high" });
    const executeFn = async () => ({ success: true } as never);
    const verifyFn = async () => ({ passed: true } as never);

    const state = await engine.run(ingest, signalFn, riskFn, executeFn, verifyFn);

    expect(state.blocked).toBe(true);
    expect(state.blockedReason).toContain("Slippage");
    expect(state.stage).toBe("risk");
  });
});
