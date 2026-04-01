import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DryRunRuntime } from "../../src/runtime/dry-run-runtime.js";
import { resetKillSwitch, triggerKillSwitch } from "../../src/governance/kill-switch.js";
import { CircuitBreaker } from "../../src/governance/circuit-breaker.js";
import { InMemoryRuntimeCycleSummaryWriter } from "../../src/persistence/runtime-cycle-summary-repository.js";
import { InMemoryIncidentRepository } from "../../src/persistence/incident-repository.js";
import { RepositoryIncidentRecorder } from "../../src/observability/incidents.js";
import { InMemoryActionLogger } from "../../src/observability/action-log.js";
import type { Config } from "../../src/config/config-schema.js";

const TEST_CONFIG_BASE: Config = {
  nodeEnv: "test",
  dryRun: true,
  tradingEnabled: false,
  liveTestMode: false,
  executionMode: "dry",
  rpcMode: "stub",
  rpcUrl: "https://api.mainnet-beta.solana.com",
  dexpaprikaBaseUrl: "https://api.dexpaprika.com",
  moralisBaseUrl: "https://solana-gateway.moralis.io",
  walletAddress: "11111111111111111111111111111111",
  journalPath: "data/journal.jsonl",
  circuitBreakerFailureThreshold: 5,
  circuitBreakerRecoveryMs: 60_000,
  maxSlippagePercent: 5,
  reviewPolicyMode: "required",
};
let TEST_CONFIG: Config = TEST_CONFIG_BASE;

function createMarketSnapshot(traceId: string, freshnessMs = 0) {
  return {
    schema_version: "market.v1" as const,
    traceId,
    timestamp: new Date().toISOString(),
    source: "dexpaprika" as const,
    poolId: `${traceId}-pool`,
    baseToken: "SOL",
    quoteToken: "USD",
    priceUsd: 100,
    volume24h: 1_000,
    liquidity: 50_000,
    freshnessMs,
    status: "ok" as const,
  };
}

async function waitForCondition(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for runtime condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("DryRunRuntime (phase-2)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "dry-run-runtime-"));
    TEST_CONFIG = {
      ...TEST_CONFIG_BASE,
      journalPath: join(tempDir, "journal.jsonl"),
    };
  });

  afterEach(() => {
    TEST_CONFIG = TEST_CONFIG_BASE;
    resetKillSwitch();
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    await rm(tempDir, { recursive: true, force: true });
  });

  it("fails closed when kill switch is active", async () => {
    const run = vi
      .fn()
      .mockResolvedValue({ stage: "monitor", traceId: "x", timestamp: new Date().toISOString() });
    const runtime = new DryRunRuntime(TEST_CONFIG, {
      engine: { run } as never,
      loopIntervalMs: 10,
    });

    triggerKillSwitch("test");
    await runtime.start();

    expect(run).not.toHaveBeenCalled();
    expect(runtime.getLastState()?.blocked).toBe(true);
    expect(runtime.getLastState()?.blockedReason).toBe("RUNTIME_PHASE2_KILL_SWITCH_HALTED");

    await runtime.stop();
  });

  it("prevents overlapping cycles when engine run is still in-flight", async () => {
    let releaseSecondRun: (() => void) | null = null;
    let calls = 0;

    const run = vi.fn().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return { stage: "monitor", traceId: "first", timestamp: new Date().toISOString() };
      }
      if (calls === 2) {
        await new Promise<void>((resolve) => {
          releaseSecondRun = resolve;
        });
      }
      return { stage: "monitor", traceId: `call-${calls}`, timestamp: new Date().toISOString() };
    });

    const runtime = new DryRunRuntime(TEST_CONFIG, {
      engine: { run } as never,
      loopIntervalMs: 5,
    });

    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(run).toHaveBeenCalledTimes(2);

    releaseSecondRun?.();
    await new Promise((resolve) => setTimeout(resolve, 10));

    await runtime.stop();
  });

  it("fails closed and throws when initial cycle errors", async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const runtime = new DryRunRuntime(TEST_CONFIG, {
      engine: { run: vi.fn().mockRejectedValue(new Error("runtime-ingest-failed")) } as never,
      loopIntervalMs: 10,
      logger,
    });

    await expect(runtime.start()).rejects.toThrow("runtime-ingest-failed");
    expect(runtime.getSnapshot().status).toBe("error");
    expect(logger.error).toHaveBeenCalled();

    await runtime.stop();
  });

  it("transitions to error if a scheduled cycle fails", async () => {
    let calls = 0;
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const runtime = new DryRunRuntime(TEST_CONFIG, {
      engine: {
        run: vi.fn().mockImplementation(async () => {
          calls += 1;
          if (calls > 1) throw new Error("scheduled-cycle-failed");
          return { stage: "monitor", traceId: "ok", timestamp: new Date().toISOString() };
        }),
      } as never,
      loopIntervalMs: 5,
      logger,
    });

    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(runtime.getSnapshot().status).toBe("error");
    expect(logger.error).toHaveBeenCalled();

    await runtime.stop();
  });

  it("reports paused status and increments blocked counter when kill switch halts paper runtime", async () => {
    const paperConfig: Config = { ...TEST_CONFIG, executionMode: "paper", dryRun: false };
    const run = vi.fn().mockResolvedValue({ stage: "monitor", traceId: "paper", timestamp: new Date().toISOString() });
    const runtime = new DryRunRuntime(paperConfig, {
      engine: { run } as never,
      loopIntervalMs: 10,
      paperMarketAdapters: [{ id: "dexpaprika", fetch: vi.fn() }],
      fetchPaperWalletSnapshot: async () => ({
        traceId: "paper-wallet-killswitch",
        timestamp: new Date().toISOString(),
        source: "moralis",
        walletAddress: TEST_CONFIG.walletAddress,
        balances: [],
        totalUsd: 0,
      }),
    });

    triggerKillSwitch("paper-halt");
    await runtime.start();

    const snapshot = runtime.getSnapshot();
    expect(snapshot.status).toBe("paused");
    expect(snapshot.mode).toBe("paper");
    expect(snapshot.paperModeActive).toBe(true);
    expect(snapshot.counters.blockedCount).toBeGreaterThanOrEqual(1);
    expect(snapshot.lastCycleSummary?.outcome).toBe("blocked");
    expect(snapshot.lastCycleSummary?.intakeOutcome).toBe("kill_switch_halted");
    expect(snapshot.lastCycleSummary?.incidentIds).toHaveLength(1);
    expect(snapshot.degradedState?.active).toBe(false);
    expect(run).not.toHaveBeenCalled();

    await runtime.stop();
  });

  it("paper mode ingests via adapter orchestrator and preserves paper execution semantics", async () => {
    const paperConfig: Config = { ...TEST_CONFIG, executionMode: "paper", dryRun: false };
    const fetchMarketDataFn = vi.fn().mockResolvedValue({
      schema_version: "market.v1",
      traceId: "m1",
      timestamp: new Date().toISOString(),
      source: "dexpaprika",
      poolId: "pool-1",
      baseToken: "SOL",
      quoteToken: "USD",
      priceUsd: 100,
      volume24h: 100,
      liquidity: 1000,
      freshnessMs: 0,
      status: "ok",
    });
    const cycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();

    const runtime = new DryRunRuntime(paperConfig, {
      loopIntervalMs: 50,
      fetchMarketDataFn,
      paperMarketAdapters: [{ id: "dexpaprika", fetch: vi.fn() }],
      fetchPaperWalletSnapshot: async () => ({
        traceId: "w1",
        timestamp: new Date().toISOString(),
        source: "moralis",
        walletAddress: TEST_CONFIG.walletAddress,
        balances: [],
        totalUsd: 0,
      }),
      cycleSummaryWriter,
    });

    await runtime.start();
    const snapshot = runtime.getSnapshot();

    expect(fetchMarketDataFn).toHaveBeenCalledTimes(1);
    expect(snapshot.status).toBe("running");
    expect(snapshot.mode).toBe("paper");
    expect(snapshot.paperModeActive).toBe(true);
    expect(snapshot.counters.cycleCount).toBe(1);
    expect(snapshot.counters.decisionCount).toBe(1);
    expect(snapshot.counters.executionCount).toBe(1);
    expect(snapshot.lastState?.executionReport?.paperExecution).toBe(true);
    expect(snapshot.lastState?.rpcVerification?.verificationMode).toBe("paper-simulated");
    expect(snapshot.degradedState?.active).toBe(false);
    expect(snapshot.adapterHealth?.healthy).toBe(1);

    const summaries = await cycleSummaryWriter.list();
    expect(summaries.length).toBe(1);
    expect(summaries[0].outcome).toBe("success");
    expect(summaries[0].intakeOutcome).toBe("ok");
    expect(summaries[0].paperExecutionProduced).toBe(true);
    expect(summaries[0].tradeIntentId).toBeDefined();
    expect(summaries[0].execution).toMatchObject({
      success: true,
      mode: "paper",
      paperExecution: true,
      actualAmountOut: "95",
    });
    expect(summaries[0].verification).toMatchObject({
      passed: true,
      mode: "paper-simulated",
      reason: "PAPER_MODE_SIMULATED_VERIFICATION",
    });

    await runtime.stop();
  });

  it("records paper decision activity to the action logger when wired", async () => {
    const paperConfig: Config = { ...TEST_CONFIG, executionMode: "paper", dryRun: false };
    const actionLogger = new InMemoryActionLogger();
    const runtime = new DryRunRuntime(paperConfig, {
      loopIntervalMs: 50,
      actionLogger,
      paperMarketAdapters: [{ id: "dexpaprika", fetch: async () => createMarketSnapshot("paper-log") }],
      fetchPaperWalletSnapshot: async () => ({
        traceId: "wallet-paper-log",
        timestamp: new Date().toISOString(),
        source: "moralis",
        walletAddress: TEST_CONFIG.walletAddress,
        balances: [],
        totalUsd: 0,
      }),
    });

    await runtime.start();

    const entries = actionLogger.list();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0]).toMatchObject({
      agentId: "engine",
      action: "complete",
      blocked: false,
    });
    expect(entries[0].traceId).toBe(runtime.getSnapshot().lastState?.traceId);

    await runtime.stop();
  });

  it("blocks paper cycle when adapters are stale/all-failed and writes summary", async () => {
    const paperConfig: Config = { ...TEST_CONFIG, executionMode: "paper", dryRun: false };
    const run = vi.fn();
    const cycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const runtime = new DryRunRuntime(paperConfig, {
      engine: { run } as never,
      fetchMarketDataFn: vi.fn().mockResolvedValue({ error: "All adapters failed: data stale" }),
      paperMarketAdapters: [{ id: "dexpaprika", fetch: vi.fn() }],
      fetchPaperWalletSnapshot: vi.fn(),
      cycleSummaryWriter,
    });

    await runtime.start();

    expect(run).not.toHaveBeenCalled();
    expect(runtime.getSnapshot().counters.blockedCount).toBe(1);
    expect(runtime.getLastState()?.blocked).toBe(true);
    expect(runtime.getLastState()?.blockedReason).toContain("PAPER_INGEST_BLOCKED");
    expect(runtime.getSnapshot().degradedState).toMatchObject({
      active: true,
      consecutiveCycles: 1,
    });

    const summaries = await cycleSummaryWriter.list();
    expect(summaries.length).toBe(1);
    expect(summaries[0].outcome).toBe("blocked");
    expect(summaries[0].intakeOutcome).toBe("stale");
    expect(summaries[0].advanced).toBe(false);
    expect(summaries[0].executionOccurred).toBe(false);
    expect(summaries[0].incidentIds).toHaveLength(1);

    await runtime.stop();
  });

  it("tracks repeated adapter degradation across cycles without fabricating paper success", async () => {
    const paperConfig: Config = { ...TEST_CONFIG, executionMode: "paper", dryRun: false };
    const cycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const incidentRepo = new InMemoryIncidentRepository();
    const adapterFetch = vi
      .fn<() => Promise<{ traceId: string; timestamp: string; source: "dexpaprika"; poolId: string; baseToken: string; quoteToken: string; priceUsd: number; volume24h: number; liquidity: number; freshnessMs: number; status: "ok" }>>()
      .mockResolvedValue({
        schema_version: "market.v1",
        traceId: "stale-paper",
        timestamp: new Date().toISOString(),
        source: "dexpaprika",
        poolId: "pool-stale",
        baseToken: "SOL",
        quoteToken: "USD",
        priceUsd: 100,
        volume24h: 100,
        liquidity: 1000,
        freshnessMs: 45_000,
        status: "ok",
      } as never);
    const runtime = new DryRunRuntime(paperConfig, {
      loopIntervalMs: 5,
      paperMarketAdapters: [{ id: "dexpaprika", fetch: adapterFetch }],
      paperAdapterCircuitBreaker: new CircuitBreaker(["dexpaprika"], { failureThreshold: 1 }),
      fetchPaperWalletSnapshot: vi.fn(),
      cycleSummaryWriter,
      incidentRecorder: new RepositoryIncidentRecorder(incidentRepo),
    });

    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const snapshot = runtime.getSnapshot();
    expect(snapshot.status).toBe("running");
    expect(snapshot.counters.cycleCount).toBeGreaterThanOrEqual(2);
    expect(snapshot.counters.blockedCount).toBeGreaterThanOrEqual(2);
    expect(snapshot.degradedState?.active).toBe(true);
    expect(snapshot.degradedState?.consecutiveCycles).toBeGreaterThanOrEqual(2);
    expect(snapshot.degradedState?.lastReason).toContain("circuit breaker open");
    expect(snapshot.lastCycleSummary?.intakeOutcome).toBe("adapter_error");
    expect(snapshot.adapterHealth?.degraded).toBe(true);
    expect(snapshot.adapterHealth?.unhealthyAdapterIds).toEqual(["dexpaprika"]);

    const summaries = await cycleSummaryWriter.list();
    expect(summaries.some((summary) => summary.intakeOutcome === "stale")).toBe(true);
    expect(summaries.at(-1)?.intakeOutcome).toBe("adapter_error");

    await runtime.stop();
  });

  it("preserves successful paper intake truth when a downstream cycle errors", async () => {
    const paperConfig: Config = { ...TEST_CONFIG, executionMode: "paper", dryRun: false };
    const cycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const incidentRepo = new InMemoryIncidentRepository();
    const runtime = new DryRunRuntime(paperConfig, {
      engine: { run: vi.fn().mockRejectedValue(new Error("paper-execute-failed")) } as never,
      fetchMarketDataFn: vi.fn().mockResolvedValue({
        schema_version: "market.v1",
        traceId: "m-paper-ok",
        timestamp: new Date().toISOString(),
        source: "dexpaprika",
        poolId: "pool-paper-ok",
        baseToken: "SOL",
        quoteToken: "USD",
        priceUsd: 101,
        volume24h: 500,
        liquidity: 5_000,
        freshnessMs: 0,
        status: "ok",
      }),
      paperMarketAdapters: [{ id: "dexpaprika", fetch: vi.fn() }],
      fetchPaperWalletSnapshot: async () => ({
        traceId: "w-paper-ok",
        timestamp: new Date().toISOString(),
        source: "moralis",
        walletAddress: TEST_CONFIG.walletAddress,
        balances: [],
        totalUsd: 0,
      }),
      cycleSummaryWriter,
      incidentRecorder: new RepositoryIncidentRecorder(incidentRepo),
    });

    await expect(runtime.start()).rejects.toThrow("paper-execute-failed");

    const snapshot = runtime.getSnapshot();
    expect(snapshot.status).toBe("error");
    expect(snapshot.lastState?.blocked).toBe(true);
    expect(snapshot.lastState?.blockedReason).toBe("RUNTIME_CYCLE_ERROR");
    expect(snapshot.lastCycleSummary?.intakeOutcome).toBe("ok");
    expect(snapshot.lastCycleSummary?.outcome).toBe("error");
    expect(snapshot.lastCycleSummary?.errorOccurred).toBe(true);
    expect(snapshot.lastCycleSummary?.error).toBe("paper-execute-failed");
    expect(snapshot.lastCycleSummary?.traceId).toBe(snapshot.lastState?.traceId);
    expect(snapshot.lastCycleSummary?.incidentIds).toHaveLength(1);

    const summaries = await cycleSummaryWriter.list();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].outcome).toBe("error");
    expect(summaries[0].intakeOutcome).toBe("ok");
    expect(summaries[0].blockedReason).toBe("RUNTIME_CYCLE_ERROR");
    expect(summaries[0].errorOccurred).toBe(true);
    expect(summaries[0].incidentIds).toHaveLength(1);

    const incidents = await runtime.listRecentIncidents(10);
    expect(incidents).toHaveLength(2);
    expect(incidents[0].type).toBe("rollout_posture_transition");
    expect(incidents[1].type).toBe("runtime_cycle_error");
    expect(incidents[1].details?.intakeOutcome).toBe("ok");

    await runtime.stop();
  });

  it("keeps repeated paper cycles reviewable across success, blocked, recovery, and error outcomes", async () => {
    const paperConfig: Config = { ...TEST_CONFIG, executionMode: "paper", dryRun: false };
    const cycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const incidentRepo = new InMemoryIncidentRepository();
    let adapterCalls = 0;
    let engineCalls = 0;

    const runtime = new DryRunRuntime(paperConfig, {
      engine: {
        run: vi.fn().mockImplementation(async () => {
          engineCalls += 1;
          if (engineCalls === 3) {
            throw new Error("paper-runtime-burst-failure");
          }

          return {
            stage: "monitor",
            traceId: `engine-cycle-${engineCalls}`,
            timestamp: new Date().toISOString(),
          };
        }),
      } as never,
      loopIntervalMs: 5,
      paperMarketAdapters: [
        {
          id: "dexpaprika",
          fetch: vi.fn().mockImplementation(async () => {
            adapterCalls += 1;
            return createMarketSnapshot(
              `paper-cycle-${adapterCalls}`,
              adapterCalls === 2 ? 45_000 : 0
            );
          }),
        },
      ],
      fetchPaperWalletSnapshot: async () => ({
        traceId: "paper-wallet",
        timestamp: new Date().toISOString(),
        source: "moralis",
        walletAddress: TEST_CONFIG.walletAddress,
        balances: [],
        totalUsd: 0,
      }),
      cycleSummaryWriter,
      incidentRecorder: new RepositoryIncidentRecorder(incidentRepo),
    });

    await runtime.start();
    await waitForCondition(() => runtime.getSnapshot().status === "error");

    const snapshot = runtime.getSnapshot();
    const summaries = await cycleSummaryWriter.list(10);
    const incidents = await runtime.listRecentIncidents(10);

    expect(snapshot.status).toBe("error");
    expect(snapshot.counters.cycleCount).toBe(4);
    expect(snapshot.counters.blockedCount).toBe(1);
    expect(snapshot.counters.errorCount).toBe(1);
    expect(summaries.map((summary) => summary.outcome)).toEqual([
      "success",
      "blocked",
      "success",
      "error",
    ]);
    expect(new Set(summaries.map((summary) => summary.traceId)).size).toBe(4);

    expect(summaries[1]).toMatchObject({
      intakeOutcome: "stale",
      blocked: true,
      degradedState: {
        active: true,
        consecutiveCycles: 1,
        recoveryCount: 0,
        recoveredThisCycle: false,
      },
      adapterHealth: {
        degraded: true,
        degradedAdapterIds: ["dexpaprika"],
        unhealthyAdapterIds: [],
      },
    });
    expect(summaries[1].degradedState?.lastReason).toContain("stale");

    expect(summaries[2]).toMatchObject({
      outcome: "success",
      intakeOutcome: "ok",
      degradedState: {
        active: false,
        consecutiveCycles: 0,
        recoveryCount: 1,
        recoveredThisCycle: true,
      },
      adapterHealth: {
        degraded: false,
        degradedAdapterIds: [],
      },
    });
    expect(summaries[2].degradedState?.lastRecoveredAt).toBeDefined();
    expect(summaries[2].degradedState?.lastReason).toContain("stale");

    expect(summaries[3]).toMatchObject({
      outcome: "error",
      intakeOutcome: "ok",
      blockedReason: "RUNTIME_CYCLE_ERROR",
      errorOccurred: true,
      error: "paper-runtime-burst-failure",
      degradedState: {
        active: false,
        recoveryCount: 1,
        recoveredThisCycle: false,
      },
    });
    expect(incidents.map((incident) => incident.type)).toEqual([
      "rollout_posture_transition",
      "paper_ingest_blocked",
      "runtime_cycle_error",
    ]);

    await runtime.stop();
  });


  it("supports explicit pause/resume/halt transitions truthfully", async () => {
    const runtime = new DryRunRuntime(TEST_CONFIG, {
      loopIntervalMs: 10,
      incidentRecorder: new RepositoryIncidentRecorder(new InMemoryIncidentRepository()),
    });

    await runtime.start();
    expect(runtime.getStatus()).toBe("running");

    const paused = await runtime.pause("test_pause");
    expect(paused.success).toBe(true);
    expect(runtime.getStatus()).toBe("paused");

    const resumed = await runtime.resume("test_resume");
    expect(resumed.success).toBe(true);
    expect(runtime.getStatus()).toBe("running");

    const halted = await runtime.halt("test_halt");
    expect(halted.success).toBe(true);
    expect(runtime.getStatus()).toBe("stopped");

    const pauseAfterHalt = await runtime.pause("unsupported_after_stop");
    expect(pauseAfterHalt.success).toBe(false);

    await runtime.stop();
  });

  it("keeps pause, resume, and halt truthful across repeated paper cycles", async () => {
    const paperConfig: Config = { ...TEST_CONFIG, executionMode: "paper", dryRun: false };
    const incidentRepo = new InMemoryIncidentRepository();
    const runtime = new DryRunRuntime(paperConfig, {
      loopIntervalMs: 5,
      paperMarketAdapters: [
        {
          id: "dexpaprika",
          fetch: async () => createMarketSnapshot(`pause-cycle-${Date.now()}`),
        },
      ],
      fetchPaperWalletSnapshot: async () => ({
        traceId: "paper-wallet-pause",
        timestamp: new Date().toISOString(),
        source: "moralis",
        walletAddress: TEST_CONFIG.walletAddress,
        balances: [],
        totalUsd: 0,
      }),
      incidentRecorder: new RepositoryIncidentRecorder(incidentRepo),
    });

    await runtime.start();
    await waitForCondition(() => runtime.getSnapshot().counters.cycleCount >= 2);

    const cycleCountBeforePause = runtime.getSnapshot().counters.cycleCount;
    const paused = await runtime.pause("phase9_pause");
    expect(paused.success).toBe(true);
    expect(runtime.getSnapshot().status).toBe("paused");

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(runtime.getSnapshot().counters.cycleCount).toBe(cycleCountBeforePause);

    const resumed = await runtime.resume("phase9_resume");
    expect(resumed.success).toBe(true);
    await waitForCondition(() => runtime.getSnapshot().counters.cycleCount > cycleCountBeforePause);

    const cycleCountBeforeHalt = runtime.getSnapshot().counters.cycleCount;
    const halted = await runtime.halt("phase9_halt");
    expect(halted.success).toBe(true);
    expect(runtime.getSnapshot().status).toBe("stopped");

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(runtime.getSnapshot().counters.cycleCount).toBe(cycleCountBeforeHalt);

    const incidents = await runtime.listRecentIncidents(10);
    expect(incidents.map((incident) => incident.type)).toContain("runtime_paused");
    expect(incidents.map((incident) => incident.type)).toContain("runtime_resumed");
    expect(incidents.map((incident) => incident.type)).toContain("runtime_halted");
  });

  it("records incidents for emergency-stop and runtime errors", async () => {
    const incidentRepo = new InMemoryIncidentRepository();
    const runtime = new DryRunRuntime(TEST_CONFIG, {
      engine: { run: vi.fn().mockRejectedValue(new Error("boom")) } as never,
      loopIntervalMs: 10,
      incidentRecorder: new RepositoryIncidentRecorder(incidentRepo),
    });

    await expect(runtime.start()).rejects.toThrow("boom");
    await runtime.emergencyStop("test_emergency");

    const incidents = await runtime.listRecentIncidents(10);
    expect(incidents.some((i) => i.type === "runtime_cycle_error")).toBe(true);
    expect(incidents.some((i) => i.type === "emergency_stop")).toBe(true);

    await runtime.stop();
  });

  it("records a dedicated incident when mandatory journal persistence fails", async () => {
    const incidentRepo = new InMemoryIncidentRepository();
    const runtime = new DryRunRuntime(TEST_CONFIG, {
      engine: { run: vi.fn().mockRejectedValue(new Error("forced journal failure at chaos_decision")) } as never,
      loopIntervalMs: 10,
      incidentRecorder: new RepositoryIncidentRecorder(incidentRepo),
    });

    await expect(runtime.start()).rejects.toThrow("forced journal failure at chaos_decision");

    const incidents = await runtime.listRecentIncidents(10);
    const journalFailure = incidents.find((incident) => incident.type === "journal_failure");
    expect(journalFailure).toBeDefined();
    expect(journalFailure?.details?.stage).toBe("chaos_decision");
    expect(journalFailure?.details?.intakeOutcome).toBe("ok");
    expect(journalFailure?.details?.traceId).toBe(runtime.getSnapshot().lastState?.traceId);
    expect(incidents.some((incident) => incident.type === "runtime_cycle_error")).toBe(true);
    expect(runtime.getSnapshot().lastCycleSummary?.incidentIds).toHaveLength(2);

    await runtime.stop();
  });

  it("replays persisted blocked cycle evidence by traceId without relying on runtime memory alone", async () => {
    const paperConfig: Config = { ...TEST_CONFIG, executionMode: "paper", dryRun: false };
    const cycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const incidentRepo = new InMemoryIncidentRepository();
    const runtime = new DryRunRuntime(paperConfig, {
      fetchMarketDataFn: vi.fn().mockResolvedValue({ error: "All adapters failed: data stale" }),
      paperMarketAdapters: [{ id: "dexpaprika", fetch: vi.fn() }],
      fetchPaperWalletSnapshot: vi.fn(),
      cycleSummaryWriter,
      incidentRecorder: new RepositoryIncidentRecorder(incidentRepo),
    });

    await runtime.start();

    const summary = (await cycleSummaryWriter.list())[0];
    const replay = await runtime.getCycleReplay(summary.traceId);

    expect(replay).not.toBeNull();
    expect(replay?.summary).toEqual(summary);
    expect(replay?.summary.outcome).toBe("blocked");
    expect(replay?.incidents).toHaveLength(1);
    expect(replay?.incidents[0].details?.traceId).toBe(summary.traceId);
    expect(replay?.journal).toEqual([]);

    await runtime.stop();
  });

  it("paused runtime does not continue cycle progression", async () => {
    const runtime = new DryRunRuntime(TEST_CONFIG, {
      loopIntervalMs: 5,
      incidentRecorder: new RepositoryIncidentRecorder(new InMemoryIncidentRepository()),
    });

    await runtime.start();
    const before = runtime.getSnapshot().counters.cycleCount;
    await runtime.pause("freeze");
    await new Promise((resolve) => setTimeout(resolve, 25));
    const after = runtime.getSnapshot().counters.cycleCount;
    expect(after).toBe(before);

    await runtime.stop();
  });

  it("fails fast when paper market adapters do not begin with DexPaprika", () => {
    const paperConfig: Config = { ...TEST_CONFIG, executionMode: "paper", dryRun: false };

    expect(
      () =>
        new DryRunRuntime(paperConfig, {
          paperMarketAdapters: [{ id: "moralis", fetch: vi.fn() }],
          fetchPaperWalletSnapshot: async () => ({
            traceId: "wallet-miswired",
            timestamp: new Date().toISOString(),
            source: "moralis",
            walletAddress: TEST_CONFIG.walletAddress,
            balances: [],
            totalUsd: 0,
          }),
        })
    ).toThrow(/DexPaprika/);
  });

  it("fails fast when DexCheck is wired into paper market ingest", () => {
    const paperConfig: Config = { ...TEST_CONFIG, executionMode: "paper", dryRun: false };

    expect(
      () =>
        new DryRunRuntime(paperConfig, {
          paperMarketAdapters: [
            { id: "dexpaprika", fetch: vi.fn() },
            { id: "dexcheck", fetch: vi.fn() },
          ],
          fetchPaperWalletSnapshot: async () => ({
            traceId: "wallet-with-dexcheck",
            timestamp: new Date().toISOString(),
            source: "moralis",
            walletAddress: TEST_CONFIG.walletAddress,
            balances: [],
            totalUsd: 0,
          }),
        })
    ).toThrow(/DexCheck is intelligence-only/);
  });

  it("blocks paper intake when wallet snapshots are not sourced from Moralis", async () => {
    const paperConfig: Config = { ...TEST_CONFIG, executionMode: "paper", dryRun: false };
    const cycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const runtime = new DryRunRuntime(paperConfig, {
      paperMarketAdapters: [{ id: "dexpaprika", fetch: async () => createMarketSnapshot("market-ok") }],
      fetchPaperWalletSnapshot: async () => ({
        traceId: "wallet-wrong-provider",
        timestamp: new Date().toISOString(),
        source: "dexpaprika",
        walletAddress: TEST_CONFIG.walletAddress,
        balances: [],
        totalUsd: 0,
      }),
      cycleSummaryWriter,
    });

    await runtime.start();

    expect(runtime.getLastState()?.blocked).toBe(true);
    expect(runtime.getLastState()?.blockedReason).toContain("Moralis");
    expect(runtime.getSnapshot().counters.blockedCount).toBe(1);
    expect(runtime.getSnapshot().lastCycleSummary?.intakeOutcome).toBe("invalid");

    const summaries = await cycleSummaryWriter.list();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].blockedReason).toContain("Moralis");

    await runtime.stop();
  });
});
