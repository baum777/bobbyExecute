import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bootstrap } from "../../src/bootstrap.js";
import { resetConfigCache } from "../../src/config/load-config.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";
import type { MarketSnapshot } from "../../src/core/contracts/market.js";
import type { WalletSnapshot } from "../../src/core/contracts/wallet.js";
import type { ExecutionReport, TradeIntent } from "../../src/core/contracts/trade.js";
import { InMemoryActionLogger } from "../../src/observability/action-log.js";
import { FileSystemKillSwitchRepository } from "../../src/persistence/kill-switch-repository.js";
import { FileSystemLiveControlRepository } from "../../src/persistence/live-control-repository.js";
import { FileSystemDailyLossRepository } from "../../src/persistence/daily-loss-repository.js";
import { FileSystemIdempotencyRepository } from "../../src/persistence/idempotency-repository.js";
import { resetMicroLiveControlForTests } from "../../src/runtime/live-control.js";

const ORIG_ENV = process.env;

function seedDefaultLiveSafetyState(journalPath: string): void {
  const basePath = journalPath.replace(/\.jsonl$/i, "");
  new FileSystemKillSwitchRepository(`${basePath}.kill-switch.json`).saveSync({ halted: false });
  new FileSystemLiveControlRepository(`${basePath}.live-control.json`).saveSync({
    armed: false,
    blocked: false,
    degraded: false,
    manualRearmRequired: false,
    roundStatus: "idle",
    inFlight: 0,
    recentTradeAtMs: [],
    recentFailureAtMs: [],
    dailyNotional: 0,
    dailyKey: new Date().toISOString().slice(0, 10),
  });
  new FileSystemDailyLossRepository(`${basePath}.daily-loss.json`).saveSync({
    dateKey: new Date().toISOString().slice(0, 10),
    tradesCount: 0,
    lossUsd: 0,
  });
  new FileSystemIdempotencyRepository(`${basePath}.idempotency.json`).saveSync([]);
}

function createLiveRuntimeDeps() {
  return {
    ingestHandler: async () => ({
      market: {
        schema_version: "market.v1",
        traceId: "bootstrap-live-trace",
        timestamp: new Date().toISOString(),
        source: "dexpaprika",
        poolId: "bootstrap-live-pool",
        baseToken: "SOL",
        quoteToken: "USDC",
        priceUsd: 150,
        volume24h: 1000,
        liquidity: 0.5,
        freshnessMs: 0,
        status: "ok",
      },
      wallet: {
        traceId: "bootstrap-live-trace",
        timestamp: new Date().toISOString(),
        source: "moralis",
        walletAddress: "11111111111111111111111111111111",
        balances: [
          {
            mint: "So11111111111111111111111111111111111111112",
            symbol: "SOL",
            decimals: 9,
            amount: "1",
            amountUsd: 150,
          },
        ],
        totalUsd: 100,
      },
    }),
    executionHandlerFactory: async () => async (_intent: TradeIntent): Promise<ExecutionReport> => ({
      traceId: "bootstrap-live-trace",
      timestamp: new Date().toISOString(),
      tradeIntentId: "bootstrap-live-intent",
      success: true,
      txSignature: "sig-bootstrap-live",
      actualAmountOut: "0.5",
      dryRun: false,
      executionMode: "live",
      paperExecution: false,
      failClosed: false,
      artifacts: {
        mode: "live",
        verification: { confirmed: true },
      },
    }),
  };
}

describe("bootstrap runtime closure (phase-1)", () => {
  let tempDir: string;

  beforeEach(() => {
    resetConfigCache();
    resetMicroLiveControlForTests();
    process.env = { ...ORIG_ENV };
    delete process.env.LIVE_TRADING;
    delete process.env.RPC_MODE;
    delete process.env.CONTROL_TOKEN;
    delete process.env.LIVE_TEST_MODE;
    delete process.env.TRADING_ENABLED;
    delete process.env.ROLLOUT_POSTURE;
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bootstrap-runtime-"));
    process.env.JOURNAL_PATH = join(tempDir, "journal.jsonl");
  });

  afterEach(() => {
    resetKillSwitch();
    resetMicroLiveControlForTests();
    resetConfigCache();
    process.env = ORIG_ENV;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("starts server and dry-run runtime together", async () => {
    process.env.CONTROL_TOKEN = "phase10-bootstrap-control-token";
    const { server, runtime } = await bootstrap({
      host: "127.0.0.1",
      port: 3351,
    });

    try {
      expect(runtime.getStatus()).toBe("running");
      expect(runtime.getLastState()?.blocked).toBe(true);
      expect(runtime.getLastState()?.blockedReason).toBe(
        "RUNTIME_PHASE1_FAIL_CLOSED_UNTIL_PIPELINE_WIRED"
      );

      const res = await fetch("http://127.0.0.1:3351/health");
      expect(res.status).toBe(200);
      const healthBefore = await res.json();
      expect(healthBefore.botStatus).toBe("running");
      expect(healthBefore.runtime?.mode).toBe("dry");
      expect(healthBefore.runtime?.paperModeActive).toBe(false);

      const summaryBefore = await fetch("http://127.0.0.1:3351/kpi/summary");
      expect(summaryBefore.status).toBe(200);
      const summaryPayload = await summaryBefore.json();
      expect(summaryPayload.botStatus).toBe("running");
      expect(summaryPayload.runtime?.mode).toBe("dry");

      const stopRes = await fetch("http://127.0.0.1:3351/emergency-stop", {
        method: "POST",
        headers: { "x-control-token": process.env.CONTROL_TOKEN! },
      });
      expect(stopRes.status).toBe(200);
      const stopBody = await stopRes.json();
      expect(stopBody.success).toBe(true);
      expect(stopBody.killSwitch?.halted).toBe(true);
      expect(stopBody.runtimeStatus).toBe("paused");

      const healthAfterStop = await fetch("http://127.0.0.1:3351/health");
      expect(healthAfterStop.status).toBe(200);
      const healthPayload = await healthAfterStop.json();
      expect(healthPayload.botStatus).toBe("paused");
      expect(healthPayload.killSwitch?.halted).toBe(true);

      const summaryAfter = await fetch("http://127.0.0.1:3351/kpi/summary");
      expect(summaryAfter.status).toBe(200);
      expect((await summaryAfter.json()).botStatus).toBe("paused");
    } finally {
      await runtime.stop();
      await server.close();
    }
  });


  it("starts in paper mode with runtime truth surfaced in health", async () => {
    process.env.DRY_RUN = "false";
    process.env.WALLET_ADDRESS = "11111111111111111111111111111111";
    process.env.CONTROL_TOKEN = "phase10-paper-control-token";
    delete process.env.LIVE_TRADING;

    const marketSnapshot: MarketSnapshot = {
      schema_version: "market.v1",
      traceId: "paper-market-1",
      timestamp: "2026-03-18T00:00:00.000Z",
      source: "dexpaprika",
      poolId: "paper-pool-1",
      baseToken: "SOL",
      quoteToken: "USD",
      priceUsd: 125,
      volume24h: 100000,
      liquidity: 500000,
      freshnessMs: 0,
      status: "ok",
    };
    const walletSnapshot: WalletSnapshot = {
      traceId: "paper-wallet-1",
      timestamp: "2026-03-18T00:00:00.000Z",
      source: "moralis",
      walletAddress: process.env.WALLET_ADDRESS,
      balances: [],
      totalUsd: 0,
    };

    const { server, runtime } = await bootstrap({
      host: "127.0.0.1",
      port: 3353,
      runtimeDeps: {
        paperMarketAdapters: [
          {
            id: "dexpaprika",
            fetch: async () => marketSnapshot,
          },
        ],
        fetchPaperWalletSnapshot: async () => walletSnapshot,
      },
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const res = await fetch("http://127.0.0.1:3353/health");
      expect(res.status).toBe(200);
      const body = await res.json();
      const snapshot = runtime.getSnapshot();

      expect(snapshot.mode).toBe("paper");
      expect(snapshot.counters.decisionCount).toBe(1);
      expect(snapshot.counters.executionCount).toBe(1);
      expect(snapshot.lastCycleSummary?.intakeOutcome).toBe("ok");
      expect(body.runtime?.mode).toBe("paper");
      expect(body.runtime?.paperModeActive).toBe(true);
      expect(body.runtime?.counters?.decisionCount).toBeGreaterThanOrEqual(1);
      expect(body.runtime?.counters?.executionCount).toBeGreaterThanOrEqual(1);
      expect(body.runtime?.lastEngineStage).toBe("monitor");
      expect(body.runtime?.lastBlockedReason).toBeUndefined();
      expect(body.runtime?.lastIntakeOutcome).toBe("ok");
    } finally {
      await runtime.stop();
      await server.close();
    }
  });

  it("starts guarded live-test runtime in explicit live state without paper fallback", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.TRADING_ENABLED = "true";
    process.env.LIVE_TEST_MODE = "true";
    process.env.WALLET_ADDRESS = "11111111111111111111111111111111";
    process.env.CONTROL_TOKEN = "phase10-live-control-token";
    process.env.OPERATOR_READ_TOKEN = "phase10-live-read-token";
    process.env.ROLLOUT_POSTURE = "micro_live";
    seedDefaultLiveSafetyState(process.env.JOURNAL_PATH!);

    const { server, runtime } = await bootstrap({
      host: "127.0.0.1",
      port: 3359,
      runtimeDeps: createLiveRuntimeDeps(),
    });

    try {
      const snapshot = runtime.getSnapshot();
      expect(runtime.getStatus()).toBe("running");
      expect(snapshot.mode).toBe("live");
      expect(snapshot.paperModeActive).toBe(false);
      expect(snapshot.liveControl?.liveTestMode).toBe(true);
      expect(snapshot.liveControl?.roundStatus).toBe("running");
      expect(snapshot.liveControl?.roundStartedAt).toBeTruthy();
      expect(snapshot.liveControl?.roundStoppedAt).toBeUndefined();
      expect(snapshot.liveControl?.stopReason).toBeUndefined();

      const [healthRes, summaryRes] = await Promise.all([
        fetch("http://127.0.0.1:3359/health"),
        fetch("http://127.0.0.1:3359/kpi/summary"),
      ]);

      expect(healthRes.status).toBe(200);
      expect(summaryRes.status).toBe(200);

      const health = await healthRes.json();
      const summary = await summaryRes.json();

      expect(health.runtime?.mode).toBe("live");
      expect(health.runtime?.paperModeActive).toBe(false);
      expect(health.runtime?.liveControl?.liveTestMode).toBe(true);
      expect(health.runtime?.liveControl?.roundStatus).toBe("running");
      expect(summary.runtime?.mode).toBe("live");
      expect(summary.runtime?.paperModeActive).toBe(false);
      expect(summary.runtime?.liveControl?.roundStatus).toBe("running");
      expect(summary.runtime?.liveControl?.disarmed).toBe(true);
    } finally {
      await runtime.stop();
      await server.close();
    }
  });

  it("fails closed when paper runtime dependencies cannot be wired", async () => {
    process.env.DRY_RUN = "false";
    delete process.env.LIVE_TRADING;
    delete process.env.WALLET_ADDRESS;

    await expect(
      bootstrap({
        host: "127.0.0.1",
        port: 3354,
      })
    ).rejects.toThrow(/Paper runtime requires WALLET_ADDRESS/);
  });

  it("fails fast on invalid startup config", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "stub";

    await expect(
      bootstrap({
        host: "127.0.0.1",
        port: 3352,
      })
    ).rejects.toThrow(/LIVE_TRADING=true.*requires RPC_MODE=real/);
  });

  it("wires runtime action logging into KPI decision and summary surfaces", async () => {
    process.env.DRY_RUN = "false";
    process.env.WALLET_ADDRESS = "11111111111111111111111111111111";
    process.env.CONTROL_TOKEN = "phase10-paper-actionlog-token";
    delete process.env.LIVE_TRADING;

    const actionLogger = new InMemoryActionLogger();
    const marketSnapshot: MarketSnapshot = {
      schema_version: "market.v1",
      traceId: "paper-market-kpi",
      timestamp: "2026-03-18T00:00:00.000Z",
      source: "dexpaprika",
      poolId: "paper-pool-kpi",
      baseToken: "SOL",
      quoteToken: "USD",
      priceUsd: 130,
      volume24h: 250000,
      liquidity: 950000,
      freshnessMs: 0,
      status: "ok",
    };
    const walletSnapshot: WalletSnapshot = {
      traceId: "paper-wallet-kpi",
      timestamp: "2026-03-18T00:00:00.000Z",
      source: "moralis",
      walletAddress: process.env.WALLET_ADDRESS,
      balances: [],
      totalUsd: 0,
    };

    const { server, runtime } = await bootstrap({
      host: "127.0.0.1",
      port: 3356,
      runtimeDeps: {
        actionLogger,
        paperMarketAdapters: [
          {
            id: "dexpaprika",
            fetch: async () => marketSnapshot,
          },
        ],
        fetchPaperWalletSnapshot: async () => walletSnapshot,
      },
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const [summaryRes, decisionsRes] = await Promise.all([
        fetch("http://127.0.0.1:3356/kpi/summary"),
        fetch("http://127.0.0.1:3356/kpi/decisions"),
      ]);
      expect(summaryRes.status).toBe(200);
      expect(decisionsRes.status).toBe(200);

      const summary = await summaryRes.json();
      const decisions = await decisionsRes.json();
      const runtimeSnapshot = runtime.getSnapshot();
      const actionEntries = actionLogger.list();

      expect(runtimeSnapshot.counters.decisionCount).toBeGreaterThanOrEqual(1);
      expect(actionEntries.length).toBeGreaterThanOrEqual(1);
      expect(summary.lastDecisionAt).toBeTruthy();
    } finally {
      await runtime.stop();
      await server.close();
    }
  });

  it("fails fast when live startup prerequisites are incomplete", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";

    await expect(
      bootstrap({
        host: "127.0.0.1",
        port: 3355,
      })
    ).rejects.toThrow(/TRADING_ENABLED=true|LIVE_TEST_MODE=true|WALLET_ADDRESS|CONTROL_TOKEN|OPERATOR_READ_TOKEN/);
  });

  it("fails closed when rollout posture is invalid or paused for live startup", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.TRADING_ENABLED = "true";
    process.env.LIVE_TEST_MODE = "true";
    process.env.WALLET_ADDRESS = "11111111111111111111111111111111";
    process.env.CONTROL_TOKEN = "phase10-live-control-token";
    process.env.OPERATOR_READ_TOKEN = "phase10-live-read-token";
    process.env.ROLLOUT_POSTURE = "paused_or_rolled_back";
    seedDefaultLiveSafetyState(process.env.JOURNAL_PATH!);

    await expect(
      bootstrap({
        host: "127.0.0.1",
        port: 3357,
        runtimeDeps: createLiveRuntimeDeps(),
      })
    ).rejects.toThrow(/rollout posture 'paused_or_rolled_back' does not permit live deployment/);
  });

  it("fails closed when rollout posture configuration is malformed", async () => {
    process.env.ROLLOUT_POSTURE = "not-a-real-posture";

    await expect(
      bootstrap({
        host: "127.0.0.1",
        port: 3358,
      })
    ).rejects.toThrow(/Startup readiness failed: Invalid rollout posture/);
  });
});
