import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, createControlServer } from "../../src/server/index.js";
import { createRuntimeVisibilityRepository, type RuntimeVisibilitySnapshot } from "../../src/persistence/runtime-visibility-repository.js";
import { createRuntimeConfigTestManager, controlHeaders, TEST_CONTROL_TOKEN } from "../helpers/runtime-config-test-kit.js";

function buildVisibilitySnapshot(): RuntimeVisibilitySnapshot {
  return {
    environment: "test",
    worker: {
      workerId: "worker-read-surface",
      lastHeartbeatAt: "2026-03-27T12:00:00.000Z",
      lastCycleAt: "2026-03-27T11:59:00.000Z",
      lastSeenReloadNonce: 7,
      lastAppliedVersionId: "version-applied",
      lastValidVersionId: "version-valid",
      degraded: false,
      observedAt: "2026-03-27T12:00:00.000Z",
    },
    runtime: {
      status: "running",
      mode: "paper",
      paperModeActive: true,
      cycleInFlight: false,
      counters: {
        cycleCount: 8,
        decisionCount: 8,
        executionCount: 2,
        blockedCount: 6,
        errorCount: 0,
      },
      lastCycleAt: "2026-03-27T11:59:00.000Z",
      lastDecisionAt: "2026-03-27T11:59:00.000Z",
      lastState: {
        stage: "monitor",
        traceId: "trace-read-surface",
        timestamp: "2026-03-27T11:59:00.000Z",
        blocked: false,
      },
      degradedState: {
        active: false,
        consecutiveCycles: 0,
        recoveryCount: 1,
      },
      adapterHealth: {
        total: 2,
        healthy: 2,
        unhealthy: 0,
        degraded: false,
        adapterIds: ["primary", "secondary"],
        degradedAdapterIds: [],
        unhealthyAdapterIds: [],
      },
      runtimeConfig: {
        environment: "test",
        configured: true,
        seedSource: "boot",
        requestedMode: "observe",
        appliedMode: "observe",
        requestedExecutionMode: "dry",
        appliedExecutionMode: "dry",
        rolloutPosture: "paper_only",
        executionToggles: {
          tradingEnabled: false,
          liveTestMode: false,
          dryRun: true,
        },
        filters: {
          allowlistTokens: [],
          denylistTokens: [],
        },
        adapterToggles: {
          executionEnabled: true,
          publishEnabled: true,
          paperAdaptersEnabled: true,
        },
        rateCaps: {
          requireArm: true,
          maxNotionalPerTrade: 25,
          maxTradesPerWindow: 2,
          windowMs: 60 * 60 * 1000,
          cooldownMs: 60 * 1000,
          maxInFlight: 1,
          failuresToBlock: 3,
          failureWindowMs: 15 * 60 * 1000,
          maxDailyNotional: 50,
        },
        thresholds: {
          maxSlippagePercent: 5,
          circuitBreakerFailureThreshold: 5,
          circuitBreakerRecoveryMs: 60_000,
          reviewPolicyMode: "required",
        },
        featureFlags: {},
        pollingIntervalMs: 15_000,
        requestedVersionId: "version-requested",
        activeVersionId: "version-active",
        appliedVersionId: "version-applied",
        lastValidVersionId: "version-valid",
        reloadNonce: 7,
        lastAppliedReloadNonce: 7,
        paused: false,
        killSwitch: false,
        pendingApply: false,
        requiresRestart: false,
        degraded: false,
      },
    },
    metrics: {
      cycleCount: 8,
      decisionCount: 8,
      executionCount: 2,
      blockedCount: 6,
      errorCount: 0,
      lastCycleAtEpochMs: Date.parse("2026-03-27T11:59:00.000Z"),
      lastDecisionAtEpochMs: Date.parse("2026-03-27T11:59:00.000Z"),
    },
  };
}

describe("visibility-backed read surfaces", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "read-surface-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("serves public health and KPI data from worker visibility and keeps runtime status private", async () => {
    const visibilityRepository = await createRuntimeVisibilityRepository();
    await visibilityRepository.save(buildVisibilitySnapshot());

    const server = await createServer({
      port: 0,
      host: "127.0.0.1",
      runtimeVisibilityRepository: visibilityRepository,
      runtimeEnvironment: "test",
    });
    const address = server.addresses()[0];

    try {
      const [healthRes, summaryRes, statusRes] = await Promise.all([
        fetch(`http://127.0.0.1:${address.port}/health`),
        fetch(`http://127.0.0.1:${address.port}/kpi/summary`),
        fetch(`http://127.0.0.1:${address.port}/runtime/status`),
      ]);

      expect(healthRes.status).toBe(200);
      expect(summaryRes.status).toBe(200);
      expect(statusRes.status).toBe(404);

      const health = await healthRes.json();
      const summary = await summaryRes.json();
      expect(health.worker).toMatchObject({
        workerId: "worker-read-surface",
        lastHeartbeatAt: "2026-03-27T12:00:00.000Z",
      });
      expect(health.runtime.status).toBe("running");
      expect(summary.worker).toMatchObject({
        lastAppliedVersionId: "version-applied",
        lastValidVersionId: "version-valid",
      });
      expect(summary.runtime.cycleCount).toBe(8);
    } finally {
      await server.close();
    }
  });

  it("serves control status from canonical config plus worker visibility", async () => {
    const visibilityRepository = await createRuntimeVisibilityRepository();
    await visibilityRepository.save(buildVisibilitySnapshot());
    const { manager } = await createRuntimeConfigTestManager();
    const server = await createControlServer({
      port: 0,
      host: "127.0.0.1",
      runtimeVisibilityRepository: visibilityRepository,
      runtimeEnvironment: "test",
      runtimeConfigManager: manager,
      controlAuthToken: TEST_CONTROL_TOKEN,
    });
    const address = server.server.address();
    if (typeof address !== "object" || address === null || !("port" in address)) {
      throw new Error("Failed to resolve control test server port");
    }

    try {
      const res = await fetch(`http://127.0.0.1:${address.port}/control/status`, { headers: controlHeaders() });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.worker).toMatchObject({
        workerId: "worker-read-surface",
        lastHeartbeatAt: "2026-03-27T12:00:00.000Z",
      });
      expect(body.runtime.status).toBe("running");
      expect(body.runtimeConfig.requestedMode).toBe("observe");
      expect(body.controlView.appliedMode).toBe("observe");
    } finally {
      await server.close();
    }
  });
});
