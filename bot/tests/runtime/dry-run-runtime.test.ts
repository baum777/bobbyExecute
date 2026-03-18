import { afterEach, describe, expect, it, vi } from "vitest";
import { DryRunRuntime } from "../../src/runtime/dry-run-runtime.js";
import { resetKillSwitch, triggerKillSwitch } from "../../src/governance/kill-switch.js";
import { CircuitBreaker } from "../../src/governance/circuit-breaker.js";
import { InMemoryRuntimeCycleSummaryWriter } from "../../src/persistence/runtime-cycle-summary-repository.js";
import { InMemoryIncidentRepository } from "../../src/persistence/incident-repository.js";
import { RepositoryIncidentRecorder } from "../../src/observability/incidents.js";
import type { Config } from "../../src/config/config-schema.js";

const TEST_CONFIG: Config = {
  nodeEnv: "test",
  dryRun: true,
  tradingEnabled: false,
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

describe("DryRunRuntime (phase-2)", () => {
  afterEach(() => {
    resetKillSwitch();
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
    });

    triggerKillSwitch("paper-halt");
    await runtime.start();

    const snapshot = runtime.getSnapshot();
    expect(snapshot.status).toBe("paused");
    expect(snapshot.mode).toBe("paper");
    expect(snapshot.paperModeActive).toBe(true);
    expect(snapshot.counters.blockedCount).toBeGreaterThanOrEqual(1);
    expect(snapshot.lastCycleSummary?.intakeOutcome).toBe("kill_switch_halted");
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
      paperMarketAdapters: [{ id: "primary", fetch: vi.fn() }],
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
    expect(summaries[0].intakeOutcome).toBe("ok");
    expect(summaries[0].paperExecutionProduced).toBe(true);

    await runtime.stop();
  });

  it("blocks paper cycle when adapters are stale/all-failed and writes summary", async () => {
    const paperConfig: Config = { ...TEST_CONFIG, executionMode: "paper", dryRun: false };
    const run = vi.fn();
    const cycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const runtime = new DryRunRuntime(paperConfig, {
      engine: { run } as never,
      fetchMarketDataFn: vi.fn().mockResolvedValue({ error: "All adapters failed: data stale" }),
      paperMarketAdapters: [{ id: "primary", fetch: vi.fn() }],
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
    expect(summaries[0].intakeOutcome).toBe("stale");
    expect(summaries[0].advanced).toBe(false);
    expect(summaries[0].executionOccurred).toBe(false);

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
      paperMarketAdapters: [{ id: "primary", fetch: adapterFetch }],
      paperAdapterCircuitBreaker: new CircuitBreaker(['primary'], { failureThreshold: 1 }),
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
    expect(snapshot.adapterHealth?.unhealthyAdapterIds).toEqual(["primary"]);

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
      paperMarketAdapters: [{ id: "primary", fetch: vi.fn() }],
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
    expect(snapshot.lastCycleSummary?.errorOccurred).toBe(true);
    expect(snapshot.lastCycleSummary?.error).toBe("paper-execute-failed");
    expect(snapshot.lastCycleSummary?.traceId).toBe(snapshot.lastState?.traceId);

    const summaries = await cycleSummaryWriter.list();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].intakeOutcome).toBe("ok");
    expect(summaries[0].blockedReason).toBe("RUNTIME_CYCLE_ERROR");
    expect(summaries[0].errorOccurred).toBe(true);

    const incidents = await runtime.listRecentIncidents(10);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].type).toBe("runtime_cycle_error");
    expect(incidents[0].details?.intakeOutcome).toBe("ok");

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
});
