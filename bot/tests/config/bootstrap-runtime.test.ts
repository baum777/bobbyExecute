import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bootstrap } from "../../src/bootstrap.js";
import { startRuntimeWorker } from "../../src/worker/runtime-worker.js";
import type { Config } from "../../src/config/config-schema.js";
import { createRuntimeVisibilityRepository, type RuntimeVisibilitySnapshot } from "../../src/persistence/runtime-visibility-repository.js";
import { createRuntimeConfigTestManager } from "../helpers/runtime-config-test-kit.js";
import { resetConfigCache } from "../../src/config/load-config.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";
import { resetMicroLiveControlForTests } from "../../src/runtime/live-control.js";

function buildVisibilitySnapshot(): RuntimeVisibilitySnapshot {
  return {
    environment: "test",
    worker: {
      workerId: "worker-bootstrap-test",
      lastHeartbeatAt: "2026-03-27T12:00:00.000Z",
      lastCycleAt: "2026-03-27T11:59:30.000Z",
      lastSeenReloadNonce: 2,
      lastAppliedVersionId: "version-applied",
      lastValidVersionId: "version-valid",
      degraded: false,
      observedAt: "2026-03-27T12:00:00.000Z",
    },
    runtime: {
      status: "running",
      mode: "dry",
      paperModeActive: false,
      cycleInFlight: false,
      counters: {
        cycleCount: 1,
        decisionCount: 1,
        executionCount: 0,
        blockedCount: 1,
        errorCount: 0,
      },
      lastCycleAt: "2026-03-27T11:59:30.000Z",
      lastDecisionAt: "2026-03-27T11:59:30.000Z",
      lastState: {
        stage: "risk",
        traceId: "trace-bootstrap",
        timestamp: "2026-03-27T11:59:30.000Z",
        blocked: true,
      },
      degradedState: {
        active: false,
        consecutiveCycles: 0,
        recoveryCount: 1,
      },
      adapterHealth: {
        total: 1,
        healthy: 1,
        unhealthy: 0,
        degraded: false,
        adapterIds: ["adapter-1"],
        degradedAdapterIds: [],
        unhealthyAdapterIds: [],
      },
    },
    metrics: {
      cycleCount: 1,
      decisionCount: 1,
      executionCount: 0,
      blockedCount: 1,
      errorCount: 0,
      lastCycleAtEpochMs: Date.parse("2026-03-27T11:59:30.000Z"),
      lastDecisionAtEpochMs: Date.parse("2026-03-27T11:59:30.000Z"),
    },
  };
}

function buildWorkerConfig(): Config {
  return {
    nodeEnv: "test",
    dryRun: true,
    tradingEnabled: false,
    liveTestMode: false,
    executionMode: "dry",
    rpcMode: "stub",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    discoveryProvider: "dexscreener",
    marketDataProvider: "dexpaprika",
    streamingProvider: "dexpaprika",
    moralisEnabled: false,
    dexpaprikaBaseUrl: "https://api.dexpaprika.com",
    moralisBaseUrl: "https://solana-gateway.moralis.io",
    walletAddress: "11111111111111111111111111111111",
    controlToken: "worker-control-token",
    operatorReadToken: "worker-operator-token",
    journalPath: "/tmp/bootstrap-runtime-worker-journal.jsonl",
    dashboardOrigin: "https://dashboard.example.com",
    circuitBreakerFailureThreshold: 5,
    circuitBreakerRecoveryMs: 60_000,
    maxSlippagePercent: 5,
    reviewPolicyMode: "required",
  } as Config;
}

describe("bootstrap and worker split", () => {
  let tempDir: string;

  beforeEach(async () => {
    resetConfigCache();
    resetKillSwitch();
    resetMicroLiveControlForTests();
    tempDir = await mkdtemp(join(tmpdir(), "bootstrap-runtime-"));
    process.env.NODE_ENV = "test";
    process.env.RUNTIME_CONFIG_ENV = "test";
    process.env.DRY_RUN = "true";
    process.env.TRADING_ENABLED = "false";
    process.env.LIVE_TEST_MODE = "false";
    process.env.RPC_MODE = "stub";
    process.env.RUNTIME_POLICY_AUTHORITY = "ts-env";
    process.env.REVIEW_POLICY_MODE = "required";
    process.env.JOURNAL_PATH = join(tempDir, "journal.jsonl");
  });

  afterEach(async () => {
    resetConfigCache();
    resetKillSwitch();
    resetMicroLiveControlForTests();
    delete process.env.NODE_ENV;
    delete process.env.RUNTIME_CONFIG_ENV;
    delete process.env.DRY_RUN;
    delete process.env.TRADING_ENABLED;
    delete process.env.LIVE_TEST_MODE;
    delete process.env.RPC_MODE;
    delete process.env.RUNTIME_POLICY_AUTHORITY;
    delete process.env.REVIEW_POLICY_MODE;
    delete process.env.JOURNAL_PATH;
    delete process.env.WORKER_HEARTBEAT_INTERVAL_MS;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("starts the public readonly bot server without a runtime loop", async () => {
    const runtimeVisibilityRepository = await createRuntimeVisibilityRepository();
    await runtimeVisibilityRepository.save(buildVisibilitySnapshot());

    const { server } = await bootstrap({
      host: "127.0.0.1",
      port: 3351,
      runtimeVisibilityRepository,
    });

    try {
      const [healthRes, summaryRes, controlRes] = await Promise.all([
        fetch("http://127.0.0.1:3351/health"),
        fetch("http://127.0.0.1:3351/kpi/summary"),
        fetch("http://127.0.0.1:3351/control/runtime-config"),
      ]);
      const restartRes = await fetch("http://127.0.0.1:3351/control/restart-worker", {
        method: "POST",
      });

      expect(healthRes.status).toBe(200);
      expect(summaryRes.status).toBe(200);
      expect(controlRes.status).toBe(404);
      expect(restartRes.status).toBe(404);

      const health = await healthRes.json();
      const summary = await summaryRes.json();
      expect(health.worker).toMatchObject({
        workerId: "worker-bootstrap-test",
        lastHeartbeatAt: "2026-03-27T12:00:00.000Z",
      });
      expect(health.runtime?.mode).toBe("dry");
      expect(summary.worker).toMatchObject({
        workerId: "worker-bootstrap-test",
        lastAppliedVersionId: "version-applied",
      });
      expect(summary.runtime?.status).toBe("running");
    } finally {
      await server.close();
    }
  }, 15000);

  it("starts the dedicated worker and publishes heartbeat visibility", async () => {
    const runtimeVisibilityRepository = await createRuntimeVisibilityRepository();
    const workerConfig = buildWorkerConfig();
    const worker = await startRuntimeWorker(
      { ...workerConfig, journalPath: join(tempDir, "journal.jsonl") },
      {
        runtimeVisibilityRepository,
        runtimeEnvironment: "test",
        heartbeatIntervalMs: 25,
      }
    );

    try {
      await worker.publishVisibilitySnapshot();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const record = await runtimeVisibilityRepository.load("test");
      expect(record).not.toBeNull();
      expect(record?.snapshot.worker).toMatchObject({
        workerId: worker.workerId,
        lastHeartbeatAt: expect.any(String),
        lastAppliedVersionId: expect.any(String),
        lastValidVersionId: expect.any(String),
      });
      expect(record?.snapshot.runtime.status).toBe("running");
      expect(record?.snapshot.runtime.counters.cycleCount).toBeGreaterThanOrEqual(1);
    } finally {
      await worker.stop();
    }
  });

  it("promotes restart-required runtime config only after the worker starts", async () => {
    const { manager } = await createRuntimeConfigTestManager();
    const restartResult = await manager.setMode("paper", {
      actor: "operator-restart",
      reason: "paper restart promotion",
    });

    expect(restartResult.accepted).toBe(true);
    expect(manager.getRuntimeConfigStatus().requiresRestart).toBe(true);

    const runtimeVisibilityRepository = await createRuntimeVisibilityRepository();
    const worker = await startRuntimeWorker(
      { ...buildWorkerConfig(), journalPath: join(tempDir, "journal-restart.jsonl") },
      {
        runtimeConfigManager: manager,
        runtimeVisibilityRepository,
        runtimeEnvironment: "test",
        heartbeatIntervalMs: 25,
      }
    );

    try {
      await worker.publishVisibilitySnapshot();
      const status = manager.getRuntimeConfigStatus();
      expect(status.requiresRestart).toBe(false);
      expect(status.requestedMode).toBe("paper");
      expect(status.appliedMode).toBe("paper");
      expect(status.appliedVersionId).toBe(status.requestedVersionId);
      expect(status.lastValidVersionId).toBe(status.requestedVersionId);

      const record = await runtimeVisibilityRepository.load("test");
      expect(record).not.toBeNull();
      expect(record?.snapshot.worker).toMatchObject({
        workerId: worker.workerId,
        lastHeartbeatAt: expect.any(String),
        lastAppliedVersionId: status.appliedVersionId,
        lastValidVersionId: status.lastValidVersionId,
      });
    } finally {
      await worker.stop();
    }
  });
});
