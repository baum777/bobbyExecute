/**
 * Wave 8: Live-test config, daily loss tracker.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getLiveTestConfig } from "../../src/config/safety.js";
import {
  createDailyLossTracker,
  isDailyLimitReached,
  getDailyLossState,
  resetDailyLossState,
} from "../../src/governance/daily-loss-tracker.js";
import { FakeClock } from "../../src/core/clock.js";
import { Engine } from "../../src/core/engine.js";
import type { MarketSnapshot } from "../../src/core/contracts/market.js";
import type { WalletSnapshot } from "../../src/core/contracts/wallet.js";

describe("Live test config (Wave 8)", () => {
  const orig = process.env;

  beforeEach(() => {
    process.env = { ...orig };
  });

  afterEach(() => {
    process.env = orig;
  });

  it("getLiveTestConfig returns defaults when LIVE_TEST_MODE unset", () => {
    delete process.env.LIVE_TEST_MODE;
    const cfg = getLiveTestConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.maxCapitalUsd).toBe(100);
    expect(cfg.maxTradesPerDay).toBe(1);
    expect(cfg.maxDailyLossUsd).toBe(50);
  });

  it("getLiveTestConfig reads env overrides", () => {
    process.env.LIVE_TEST_MODE = "true";
    process.env.LIVE_TEST_MAX_TRADES_PER_DAY = "3";
    const cfg = getLiveTestConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.maxTradesPerDay).toBe(3);
  });
});

describe("Daily loss tracker (Wave 8)", () => {
  beforeEach(() => {
    process.env.LIVE_TEST_MODE = "true";
    process.env.LIVE_TEST_MAX_TRADES_PER_DAY = "2";
    resetDailyLossState();
  });

  it("createDailyLossTracker implements interface", () => {
    const tracker = createDailyLossTracker();
    expect(tracker.isLimitReached()).toBe(false);
    tracker.recordTrade(0);
  });

  it("isDailyLimitReached true after max trades", () => {
    const clock = new FakeClock("2026-03-06T12:00:00Z");
    process.env.LIVE_TEST_MAX_TRADES_PER_DAY = "1";
    const tracker = createDailyLossTracker(clock);
    expect(tracker.isLimitReached()).toBe(false);
    tracker.recordTrade(0);
    expect(tracker.isLimitReached()).toBe(true);
  });

  it("getDailyLossState returns current state", () => {
    const clock = new FakeClock("2026-03-07T00:00:00Z");
    const state = getDailyLossState(clock);
    expect(state.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(state.tradesCount).toBeGreaterThanOrEqual(0);
  });
});

describe("Engine daily limit block (Wave 8)", () => {
  beforeEach(() => {
    process.env.LIVE_TEST_MODE = "true";
    process.env.LIVE_TEST_MAX_TRADES_PER_DAY = "1";
    resetDailyLossState();
  });

  it("blocks execute when daily limit reached", async () => {
    const clock = new FakeClock("2026-03-08T12:00:00Z");
    process.env.LIVE_TEST_MODE = "true";
    process.env.LIVE_TEST_MAX_TRADES_PER_DAY = "1";

    const tracker = createDailyLossTracker(clock);
    tracker.recordTrade(0);

    const market: MarketSnapshot = {
      traceId: "lt",
      timestamp: clock.now().toISOString(),
      source: "test",
      poolId: "p1",
      baseToken: "SOL",
      quoteToken: "USD",
      priceUsd: 150,
      volume24h: 1000,
      liquidity: 50000,
    };
    const wallet: WalletSnapshot = {
      traceId: "lt",
      timestamp: clock.now().toISOString(),
      source: "test",
      walletAddress: "addr",
      balances: [],
    };

    const engine = new Engine({
      clock,
      dryRun: true,
      dailyLossTracker: tracker,
    });

    const ingest = async () => ({ market, wallet });
    const signalFn = async () => ({ direction: "hold", confidence: 0.5 });
    const riskFn = async () => ({ allowed: true });
    const executeFn = async () => ({ success: true } as never);
    const verifyFn = async () => ({ passed: true } as never);

    const state = await engine.run(ingest, signalFn, riskFn, executeFn, verifyFn);

    expect(state.blocked).toBe(true);
    expect(state.blockedReason).toContain("Daily loss");
  });
});
