/**
 * Runtime control routes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createControlServer } from "../../src/server/index.js";
import { createRuntimeVisibilityRepository, type RuntimeVisibilitySnapshot } from "../../src/persistence/runtime-visibility-repository.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";
import {
  buildControlOperatorAssertionHeaders,
  createRuntimeConfigTestManager,
  controlHeaders,
  TEST_CONTROL_TOKEN,
} from "../helpers/runtime-config-test-kit.js";

function buildVisibilitySnapshot(): RuntimeVisibilitySnapshot {
  return {
    environment: "test",
    worker: {
      workerId: "worker-test-1",
      lastHeartbeatAt: "2026-03-27T12:00:00.000Z",
      lastCycleAt: "2026-03-27T11:59:30.000Z",
      lastSeenReloadNonce: 4,
      lastAppliedVersionId: "version-applied-1",
      lastValidVersionId: "version-valid-1",
      degraded: false,
      observedAt: "2026-03-27T12:00:00.000Z",
    },
    runtime: {
      status: "running",
      mode: "paper",
      paperModeActive: true,
      cycleInFlight: false,
      counters: {
        cycleCount: 12,
        decisionCount: 12,
        executionCount: 3,
        blockedCount: 9,
        errorCount: 0,
      },
      lastCycleAt: "2026-03-27T11:59:30.000Z",
      lastDecisionAt: "2026-03-27T11:59:30.000Z",
      lastState: {
        stage: "monitor",
        traceId: "trace-worker-1",
        timestamp: "2026-03-27T11:59:30.000Z",
        blocked: false,
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
        requestedVersionId: "version-requested-1",
        activeVersionId: "version-active-1",
        appliedVersionId: "version-applied-1",
        lastValidVersionId: "version-valid-1",
        reloadNonce: 4,
        lastAppliedReloadNonce: 4,
        paused: false,
        killSwitch: false,
        pendingApply: false,
        requiresRestart: false,
        degraded: false,
      },
      degradedState: {
        active: false,
        consecutiveCycles: 0,
        recoveryCount: 2,
      },
      recentHistory: {
        recentCycleCount: 1,
        cycleOutcomes: { success: 1, blocked: 0, error: 0 },
        attemptsByMode: { dry: 0, paper: 1, live: 0 },
        refusalCounts: {},
        failureStageCounts: {},
        verificationHealth: { passed: 1, failed: 0, failureReasons: {} },
        incidentCounts: {},
        controlActions: [],
        stateTransitions: [],
        recentCycles: [
          {
            traceId: "trace-worker-1",
            cycleTimestamp: "2026-03-27T11:59:30.000Z",
            mode: "paper",
            outcome: "success",
            stage: "monitor",
            blocked: false,
            intakeOutcome: "ok",
            executionOccurred: false,
            verificationOccurred: true,
            decisionOccurred: true,
            errorOccurred: false,
            decisionHistoryRole: "canonical",
            decisionEnvelope: {
              schemaVersion: "decision.envelope.v3",
              entrypoint: "engine",
              flow: "trade",
              executionMode: "paper",
              traceId: "trace-worker-1",
              stage: "monitor",
              blocked: false,
              reasonClass: "SUCCESS",
              sources: ["fixture"],
              freshness: {
                marketAgeMs: 0,
                walletAgeMs: 0,
                maxAgeMs: 60_000,
                observedAt: "2026-03-27T11:59:30.000Z",
              },
              evidenceRef: {},
              decisionHash: "a".repeat(64),
              resultHash: "b".repeat(64),
            },
          },
        ],
        recentIncidents: [],
      },
    },
    metrics: {
      cycleCount: 12,
      decisionCount: 12,
      executionCount: 3,
      blockedCount: 9,
      errorCount: 0,
      lastCycleAtEpochMs: Date.parse("2026-03-27T11:59:30.000Z"),
      lastDecisionAtEpochMs: Date.parse("2026-03-27T11:59:30.000Z"),
    },
  };
}

async function createHarness() {
  const { manager } = await createRuntimeConfigTestManager();
  const runtimeVisibilityRepository = await createRuntimeVisibilityRepository();
  await runtimeVisibilityRepository.save(buildVisibilitySnapshot());
  const server = await createControlServer({
    port: 0,
    host: "127.0.0.1",
    runtimeConfigManager: manager,
    runtimeVisibilityRepository,
    runtimeEnvironment: "test",
    controlAuthToken: TEST_CONTROL_TOKEN,
  });
  const address = server.server.address();
  if (typeof address !== "object" || address === null || !("port" in address)) {
    throw new Error("Failed to resolve control test server port");
  }

  return {
    manager,
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    runtimeVisibilityRepository,
  };
}

describe("control routes", () => {
  let harnesses: Array<Awaited<ReturnType<typeof createHarness>>> = [];

  beforeEach(() => {
    resetKillSwitch();
  });

  afterEach(async () => {
    for (const harness of [...harnesses].reverse()) {
      await harness.server.close();
    }
    harnesses = [];
    resetKillSwitch();
  });

  it("rejects mutations without control auth and logs the denial", async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const response = await fetch(`${harness.baseUrl}/control/pause`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ scope: "soft" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "control_auth_invalid",
    });

    const history = await harness.manager.getHistory();
    expect(history.changes[0]).toMatchObject({
      action: "auth_failure",
      accepted: false,
    });

    const restartResponse = await fetch(`${harness.baseUrl}/control/restart-worker`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ reason: "unauthorized" }),
    });

    expect(restartResponse.status).toBe(403);
    await expect(restartResponse.json()).resolves.toMatchObject({
      success: false,
      code: "control_auth_invalid",
    });

    const alertsResponse = await fetch(`${harness.baseUrl}/control/restart-alerts`, {
      headers: {
        "content-type": "application/json",
      },
    });
    expect(alertsResponse.status).toBe(403);

    const acknowledgeResponse = await fetch(`${harness.baseUrl}/control/restart-alerts/alert-1/acknowledge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ note: "unauthorized" }),
    });
    expect(acknowledgeResponse.status).toBe(403);

    const trendsResponse = await fetch(`${harness.baseUrl}/control/restart-alert-deliveries/trends`, {
      headers: {
        "content-type": "application/json",
      },
    });
    expect(trendsResponse.status).toBe(403);
  }, 15000);

  it("exposes worker heartbeat and canonical runtime config through control status", async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const res = await fetch(`${harness.baseUrl}/control/status`, {
      headers: controlHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
      expect(body).toMatchObject({
        success: true,
        runtime: {
          status: "running",
          mode: "paper",
        runtimeConfig: {
          requestedMode: "observe",
          appliedMode: "observe",
        },
      },
      worker: {
        workerId: "worker-test-1",
        lastHeartbeatAt: "2026-03-27T12:00:00.000Z",
        lastAppliedVersionId: "version-applied-1",
        lastValidVersionId: "version-valid-1",
        degraded: false,
      },
      restart: {
        required: false,
        requested: false,
        inProgress: false,
        lastHeartbeatAt: "2026-03-27T12:00:00.000Z",
        lastAppliedVersionId: "version-applied-1",
      },
      restartAlerts: {
        openAlertCount: 0,
        acknowledgedAlertCount: 0,
        resolvedAlertCount: 0,
        activeAlertCount: 0,
        stalledRestartCount: 0,
        divergenceAlerting: false,
      },
      runtimeConfig: {
        requestedMode: "observe",
        appliedMode: "observe",
      },
      controlView: {
        requestedMode: "observe",
        appliedMode: "observe",
      },
      });
    expect(body.runtime).not.toHaveProperty("decisionHistoryRole");
    expect(body.runtime.recentHistory?.recentCycles[0].decisionHistoryRole).toBe("canonical");
  });

  it("applies kill-switch and config mutations without a live runtime object", async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const emergency = await fetch(`${harness.baseUrl}/emergency-stop`, {
      method: "POST",
      headers: buildControlOperatorAssertionHeaders({ action: "emergency_stop", target: "/emergency-stop" }),
    });
    expect(emergency.status).toBe(200);
    const emergencyBody = await emergency.json();
    expect(emergencyBody).toMatchObject({
      success: true,
      accepted: true,
      runtimeConfig: {
        killSwitch: true,
      },
      status: {
        killSwitch: true,
      },
    });

    const reset = await fetch(`${harness.baseUrl}/control/reset`, {
      method: "POST",
      headers: buildControlOperatorAssertionHeaders({ action: "reset_kill_switch", target: "/control/reset" }),
    });
    expect(reset.status).toBe(200);
    const resetBody = await reset.json();
    expect(resetBody).toMatchObject({
      success: true,
      accepted: true,
      runtimeConfig: {
        killSwitch: false,
      },
    });
  });
});
