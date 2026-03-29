/**
 * Wave 8: Live-test config, daily loss tracker.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertLiveTestPrerequisites, getLiveTestConfig } from "../../src/config/safety.js";
import { parseConfig } from "../../src/config/config-schema.js";
import { resetConfigCache } from "../../src/config/load-config.js";
import {
  createDailyLossTracker,
  isDailyLimitReached,
  getDailyLossState,
  resetDailyLossState,
} from "../../src/governance/daily-loss-tracker.js";
import { runLiveTestPreflight } from "../../src/scripts/live-test-preflight.js";
import { FakeClock } from "../../src/core/clock.js";
import { Engine } from "../../src/core/engine.js";
import type { MarketSnapshot } from "../../src/core/contracts/market.js";
import type { WalletSnapshot } from "../../src/core/contracts/wallet.js";

describe("Live test config (Wave 8)", () => {
  const orig = process.env;
  const workerStateDirs: string[] = [];

  function createValidWorkerStateFixture(): string {
    const dir = mkdtempSync(join(tmpdir(), "bobbyexecute-live-preflight-"));
    workerStateDirs.push(dir);
    const journalPath = join(dir, "journal.jsonl");
    writeFileSync(journalPath, "{\"event\":\"startup\"}\n", "utf8");
    writeFileSync(join(dir, "journal.kill-switch.json"), JSON.stringify({ halted: false }), "utf8");
    writeFileSync(
      join(dir, "journal.live-control.json"),
      JSON.stringify({
        armed: false,
        blocked: false,
        degraded: false,
        manualRearmRequired: false,
        roundStatus: "idle",
        inFlight: 0,
        recentTradeAtMs: [],
        recentFailureAtMs: [],
        dailyNotional: 0,
        dailyKey: "2026-03-08",
      }),
      "utf8"
    );
    writeFileSync(join(dir, "journal.daily-loss.json"), JSON.stringify({ dateKey: "", tradesCount: 0, lossUsd: 0 }), "utf8");
    writeFileSync(join(dir, "journal.idempotency.json"), JSON.stringify([]), "utf8");
    return journalPath;
  }

  beforeEach(() => {
    process.env = { ...orig };
    resetConfigCache();
  });

  afterEach(() => {
    process.env = orig;
    resetConfigCache();
    for (const dir of workerStateDirs.splice(0, workerStateDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
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

  it("assertLiveTestPrerequisites returns normalized config in live mode", () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.TRADING_ENABLED = "true";
    process.env.LIVE_TEST_MODE = "true";
    process.env.LIVE_TEST_MAX_CAPITAL_USD = "75";
    process.env.LIVE_TEST_MAX_TRADES_PER_DAY = "2";
    process.env.LIVE_TEST_MAX_DAILY_LOSS_USD = "20";
    process.env.WALLET_ADDRESS = "11111111111111111111111111111111";
    process.env.CONTROL_TOKEN = "phase10-live-control-token";
    process.env.OPERATOR_READ_TOKEN = "phase10-live-operator-token";

    const config = parseConfig(process.env as Record<string, string | undefined>);
    const liveTest = assertLiveTestPrerequisites(config);

    expect(liveTest.enabled).toBe(true);
    expect(liveTest.maxCapitalUsd).toBe(75);
    expect(liveTest.maxTradesPerDay).toBe(2);
    expect(liveTest.maxDailyLossUsd).toBe(20);
  });

  it("runLiveTestPreflight rejects non-live execution modes", () => {
    process.env.LIVE_TEST_MODE = "true";
    delete process.env.LIVE_TRADING;
    delete process.env.RPC_MODE;

    expect(() => runLiveTestPreflight()).toThrow(
      /Live-test preflight requires LIVE_TRADING=true/
    );
  });

  it("runLiveTestPreflight returns a live-test report in valid live mode", () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.TRADING_ENABLED = "true";
    process.env.LIVE_TEST_MODE = "true";
    process.env.LIVE_TEST_MAX_CAPITAL_USD = "80";
    process.env.LIVE_TEST_MAX_TRADES_PER_DAY = "2";
    process.env.LIVE_TEST_MAX_DAILY_LOSS_USD = "25";
    process.env.WALLET_ADDRESS = "11111111111111111111111111111111";
    process.env.CONTROL_TOKEN = "phase10-live-control-token";
    process.env.OPERATOR_READ_TOKEN = "phase10-live-operator-token";
    process.env.JOURNAL_PATH = createValidWorkerStateFixture();

    const report = runLiveTestPreflight();

    expect(report).toMatchObject({
      executionMode: "live",
      rpcMode: "real",
      liveTestEnabled: true,
      maxCapitalUsd: 80,
      maxTradesPerDay: 2,
      maxDailyLossUsd: 25,
      workerSafeBoot: true,
    });
  });

  it("runLiveTestPreflight fails closed when worker boot-critical state is missing", () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.TRADING_ENABLED = "true";
    process.env.LIVE_TEST_MODE = "true";
    process.env.WALLET_ADDRESS = "11111111111111111111111111111111";
    process.env.CONTROL_TOKEN = "phase10-live-control-token";
    process.env.OPERATOR_READ_TOKEN = "phase10-live-operator-token";

    const dir = mkdtempSync(join(tmpdir(), "bobbyexecute-live-preflight-missing-"));
    workerStateDirs.push(dir);
    const journalPath = join(dir, "journal.jsonl");
    mkdirSync(dir, { recursive: true });
    writeFileSync(journalPath, "{\"event\":\"startup\"}\n", "utf8");
    process.env.JOURNAL_PATH = journalPath;

    expect(() => runLiveTestPreflight()).toThrow(/valid worker boot state/);
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
