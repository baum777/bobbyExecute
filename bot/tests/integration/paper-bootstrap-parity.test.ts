import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrap } from "../../src/bootstrap.js";
import { createControlServer } from "../../src/server/index.js";
import { createRuntimeVisibilityRepository } from "../../src/persistence/runtime-visibility-repository.js";
import { FileSystemRuntimeCycleSummaryWriter, type RuntimeCycleSummary } from "../../src/persistence/runtime-cycle-summary-repository.js";
import { FileSystemIncidentRepository } from "../../src/persistence/incident-repository.js";
import { RepositoryIncidentRecorder } from "../../src/observability/incidents.js";
import { startRuntimeWorker } from "../../src/worker/runtime-worker.js";
import { loadConfig, resetConfigCache } from "../../src/config/load-config.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";
import { FakeClock } from "../../src/core/clock.js";
import type { MarketSnapshot } from "../../src/core/contracts/market.js";
import type { WalletSnapshot } from "../../src/core/contracts/wallet.js";
import { InMemoryRuntimeConfigRepository } from "../../src/persistence/runtime-config-repository.js";
import { InMemoryRuntimeConfigStore } from "../../src/storage/runtime-config-store.js";
import { RuntimeConfigManager } from "../../src/runtime/runtime-config-manager.js";
import { controlHeaders, TEST_CONTROL_TOKEN } from "../helpers/runtime-config-test-kit.js";

const ORIG_ENV = process.env;
const PUBLIC_PORT = 3361;
const CONTROL_PORT = 3362;

async function waitFor<T>(producer: () => Promise<T> | T, predicate: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 5_000;

  for (;;) {
    const value = await producer();
    if (predicate(value)) {
      return value;
    }
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for expected runtime state");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("paper bootstrap integration parity (phase-6)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "paper-bootstrap-phase6-"));
    resetConfigCache();
    resetKillSwitch();
    process.env = {
      ...ORIG_ENV,
      NODE_ENV: "test",
      DRY_RUN: "false",
      TRADING_ENABLED: "false",
      LIVE_TEST_MODE: "false",
      WALLET_ADDRESS: "11111111111111111111111111111111",
      CONTROL_TOKEN: TEST_CONTROL_TOKEN,
      JOURNAL_PATH: join(tempDir, "paper-runtime-journal.jsonl"),
      RPC_MODE: "stub",
      RUNTIME_POLICY_AUTHORITY: "ts-env",
      REVIEW_POLICY_MODE: "required",
      RUNTIME_CONFIG_ENV: "test",
    };
    delete process.env.LIVE_TRADING;
  });

  afterEach(async () => {
    resetKillSwitch();
    resetConfigCache();
    process.env = ORIG_ENV;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("proves parity across the worker runtime, public read surface, control status, and persistence", async () => {
    const cycleSummaryPath = join(tempDir, "paper-runtime-cycles.jsonl");
    const incidentPath = join(tempDir, "paper-runtime-incidents.jsonl");
    const cycleSummaryWriter = new FileSystemRuntimeCycleSummaryWriter(cycleSummaryPath);
    const incidentRepository = new FileSystemIncidentRepository(incidentPath);
    const runtimeVisibilityRepository = await createRuntimeVisibilityRepository();
    const config = loadConfig();
    const runtimeConfigManager = new RuntimeConfigManager(config, {
      repository: new InMemoryRuntimeConfigRepository(),
      store: new InMemoryRuntimeConfigStore(),
      environment: "test",
      bootstrapActor: "paper-bootstrap-test",
      env: process.env,
    });
    await runtimeConfigManager.initialize();

    const clock = new FakeClock("2026-04-03T04:00:00.000Z");
    const freshTs = clock.now().toISOString();
    const marketSnapshot: MarketSnapshot = {
      schema_version: "market.v1",
      traceId: "phase6-market-trace",
      timestamp: freshTs,
      source: "dexpaprika",
      poolId: "phase6-paper-pool",
      baseToken: "SOL",
      quoteToken: "USD",
      priceUsd: 132.45,
      volume24h: 245000,
      liquidity: 1_000_000,
      freshnessMs: 0,
      status: "ok",
    };
    const walletSnapshot: WalletSnapshot = {
      traceId: "phase6-wallet-trace",
      timestamp: freshTs,
      source: "moralis",
      walletAddress: process.env.WALLET_ADDRESS!,
      balances: [
        {
          mint: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          amount: "2.5",
          decimals: 9,
          amountUsd: 331.125,
        },
      ],
      totalUsd: 331.125,
    };

    const worker = await startRuntimeWorker(config, {
      runtimeDeps: {
        clock,
        loopIntervalMs: 60_000,
        paperMarketAdapters: [{ id: "dexpaprika", fetch: async () => ({ ...marketSnapshot, timestamp: clock.now().toISOString() }) }],
        fetchPaperWalletSnapshot: async () => ({ ...walletSnapshot, timestamp: clock.now().toISOString() }),
        cycleSummaryWriter,
        incidentRecorder: new RepositoryIncidentRecorder(incidentRepository),
      },
      runtimeConfigManager,
      runtimeVisibilityRepository,
      runtimeEnvironment: "test",
      heartbeatIntervalMs: 25,
    });

    const publicServer = await bootstrap({
      host: "127.0.0.1",
      port: PUBLIC_PORT,
      runtimeVisibilityRepository,
    });

    const controlServer = await createControlServer({
      host: "127.0.0.1",
      port: CONTROL_PORT,
      runtimeConfigManager,
      runtimeVisibilityRepository,
      runtimeEnvironment: "test",
      controlAuthToken: TEST_CONTROL_TOKEN,
    });

    try {
      const runtimeSnapshot = await waitFor(
        () => worker.runtime.getSnapshot(),
        (snapshot) => snapshot.counters.executionCount === 1 && snapshot.lastCycleSummary?.verificationMode === "paper-simulated"
      );

      expect(runtimeSnapshot.mode).toBe("paper");
      expect(runtimeSnapshot.status).toBe("running");
      expect(runtimeSnapshot.paperModeActive).toBe(true);
      expect(runtimeSnapshot.counters.cycleCount).toBe(1);
      expect(runtimeSnapshot.counters.decisionCount).toBe(1);
      expect(runtimeSnapshot.counters.executionCount).toBe(1);
      expect(runtimeSnapshot.counters.blockedCount).toBe(0);
      expect(runtimeSnapshot.counters.errorCount).toBe(0);
      expect(runtimeSnapshot.lastState?.stage).toBe("monitor");
      expect(runtimeSnapshot.lastState?.market).toEqual(marketSnapshot);
      expect(runtimeSnapshot.lastState?.wallet).toEqual(walletSnapshot);
      expect(runtimeSnapshot.lastState?.executionReport).toMatchObject({
        success: true,
        executionMode: "paper",
        paperExecution: true,
        actualAmountOut: String(marketSnapshot.priceUsd * 0.95),
      });
      expect(runtimeSnapshot.lastState?.rpcVerification).toMatchObject({
        passed: true,
        verificationMode: "paper-simulated",
        reason: "PAPER_MODE_SIMULATED_VERIFICATION",
      });
      expect(runtimeSnapshot.lastCycleSummary).toMatchObject({
        traceId: runtimeSnapshot.lastState?.traceId,
        mode: "paper",
        outcome: "success",
        intakeOutcome: "ok",
        advanced: true,
        stage: "monitor",
        blocked: false,
        executionOccurred: true,
        verificationOccurred: true,
        paperExecutionProduced: true,
        verificationMode: "paper-simulated",
        errorOccurred: false,
        tradeIntentId: runtimeSnapshot.lastState?.tradeIntent?.idempotencyKey,
        execution: {
          success: true,
          mode: "paper",
          paperExecution: true,
          actualAmountOut: String(marketSnapshot.priceUsd * 0.95),
        },
        verification: {
          passed: true,
          mode: "paper-simulated",
          reason: "PAPER_MODE_SIMULATED_VERIFICATION",
        },
        incidentIds: [],
      });

      const [healthRes, kpiRes, controlStatusRes, controlHistoryRes] = await Promise.all([
        fetch(`http://127.0.0.1:${PUBLIC_PORT}/health`),
        fetch(`http://127.0.0.1:${PUBLIC_PORT}/kpi/summary`),
        fetch(`http://127.0.0.1:${CONTROL_PORT}/control/status`, { headers: controlHeaders() }),
        fetch(`http://127.0.0.1:${CONTROL_PORT}/control/history?limit=5`, { headers: controlHeaders() }),
      ]);

      expect(healthRes.status).toBe(200);
      expect(kpiRes.status).toBe(200);
      expect(controlStatusRes.status).toBe(200);
      expect(controlHistoryRes.status).toBe(200);

      const healthBody = await healthRes.json();
      const kpiBody = await kpiRes.json();
      const controlStatusBody = await controlStatusRes.json();
      const controlHistoryBody = await controlHistoryRes.json();

      expect(healthBody.botStatus).toBe("running");
      expect(healthBody.worker).toMatchObject({
        workerId: worker.workerId,
        lastAppliedVersionId: expect.any(String),
        lastValidVersionId: expect.any(String),
      });
      expect(healthBody.runtime).toMatchObject({
        status: runtimeSnapshot.status,
        mode: runtimeSnapshot.mode,
        paperModeActive: true,
        cycleInFlight: false,
        counters: runtimeSnapshot.counters,
        lastCycleAt: runtimeSnapshot.lastCycleAt,
        lastDecisionAt: runtimeSnapshot.lastDecisionAt,
        lastEngineStage: "monitor",
        lastIntakeOutcome: "ok",
      });

      expect(kpiBody.botStatus).toBe("running");
      expect(kpiBody.worker).toMatchObject({
        workerId: worker.workerId,
        lastHeartbeatAt: expect.any(String),
      });
      expect(kpiBody.runtime).toMatchObject({
        mode: runtimeSnapshot.mode,
        paperModeActive: true,
        status: runtimeSnapshot.status,
        cycleCount: runtimeSnapshot.counters.cycleCount,
        decisionCount: runtimeSnapshot.counters.decisionCount,
        executionCount: runtimeSnapshot.counters.executionCount,
        blockedCount: runtimeSnapshot.counters.blockedCount,
        errorCount: runtimeSnapshot.counters.errorCount,
        lastDecisionAt: runtimeSnapshot.lastDecisionAt,
        lastIntakeOutcome: "ok",
      });

      expect(controlStatusBody.success).toBe(true);
      expect(controlStatusBody.worker).toMatchObject({
        workerId: worker.workerId,
        lastHeartbeatAt: expect.any(String),
      });
      expect(controlStatusBody.runtime).toMatchObject({
        status: runtimeSnapshot.status,
        mode: runtimeSnapshot.mode,
      });
      expect(controlStatusBody.runtimeConfig).toMatchObject({
        requestedMode: "paper",
        appliedMode: "paper",
      });
      expect(controlStatusBody.controlView).toMatchObject({
        requestedMode: "paper",
        appliedMode: "paper",
      });

      expect(controlHistoryBody.success).toBe(true);
      expect(controlHistoryBody.history.versions.length).toBeGreaterThanOrEqual(1);

      const persistedCycles = (await cycleSummaryWriter.list(5)) as RuntimeCycleSummary[];
      expect(persistedCycles).toHaveLength(1);
      expect(persistedCycles[0]).toEqual(runtimeSnapshot.lastCycleSummary);

      const persistedIncidents = await incidentRepository.list(5);
      expect(persistedIncidents).toHaveLength(1);
      expect(persistedIncidents[0]).toMatchObject({
        type: "rollout_posture_transition",
        severity: "info",
        message: "Rollout posture evaluated at runtime start",
        details: {
          rolloutPosture: "paper_only",
          rolloutConfigured: true,
          rolloutConfigValid: true,
        },
      });

      const cycleSummaryLines = (await readFile(cycleSummaryPath, "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as RuntimeCycleSummary);
      expect(cycleSummaryLines).toEqual(persistedCycles);
      expect(cycleSummaryLines[0]).toMatchObject({
        mode: "paper",
        paperExecutionProduced: true,
        verificationMode: "paper-simulated",
      });

      const journalEntries = (await readFile(process.env.JOURNAL_PATH!, "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { stage: string; output: Record<string, unknown> });
      const canonicalEntry = journalEntries.find((entry) => entry.stage === "canonical_trade_complete");

      expect(journalEntries.length).toBeGreaterThanOrEqual(1);
      expect(canonicalEntry?.output).toMatchObject({
        execReport: {
          success: true,
          executionMode: "paper",
          paperExecution: true,
        },
        rpcVerify: {
          passed: true,
          verificationMode: "paper-simulated",
        },
      });
    } finally {
      await worker.stop();
      await controlServer.close();
      await publicServer.server.close();
    }
  }, 15_000);
});
