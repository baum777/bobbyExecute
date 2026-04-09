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
import { getMicroLiveControlSnapshot, resetMicroLiveControlForTests } from "../../src/runtime/live-control.js";
import {
  buildControlOperatorAssertionHeaders,
  createRuntimeConfigTestManager,
  controlHeaders,
  operatorReadHeaders,
  TEST_OPERATOR_READ_TOKEN,
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
      liveControl: getMicroLiveControlSnapshot(),
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

function buildReleaseGateVisibilitySnapshot(): RuntimeVisibilitySnapshot {
  const base = buildVisibilitySnapshot();
  const liveControl = {
    ...getMicroLiveControlSnapshot(),
    armed: true,
    blocked: false,
    disarmed: false,
    posture: "live_armed" as const,
    manualRearmRequired: false,
  };
  return {
    ...base,
    runtime: {
      ...base.runtime,
      status: "running",
      mode: "live",
      paperModeActive: false,
      liveControl,
    },
  };
}

async function createHarness(options: { operatorReadToken?: string; visibilitySnapshot?: RuntimeVisibilitySnapshot } = {}) {
  const { manager } = await createRuntimeConfigTestManager();
  const runtimeVisibilityRepository = await createRuntimeVisibilityRepository();
  await runtimeVisibilityRepository.save(options.visibilitySnapshot ?? buildVisibilitySnapshot());
  const server = await createControlServer({
    port: 0,
    host: "127.0.0.1",
    runtimeConfigManager: manager,
    runtimeVisibilityRepository,
    runtimeEnvironment: "test",
    controlAuthToken: TEST_CONTROL_TOKEN,
    operatorReadToken: options.operatorReadToken,
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
    resetMicroLiveControlForTests();
  });

  afterEach(async () => {
    for (const harness of [...harnesses].reverse()) {
      await harness.server.close();
    }
    harnesses = [];
    resetKillSwitch();
    resetMicroLiveControlForTests();
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

    const operatorOnlyHeaders = buildControlOperatorAssertionHeaders({ action: "pause", target: "/control/pause" });
    const { ["x-control-token"]: _controlToken, ...assertionOnlyHeaders } =
      operatorOnlyHeaders as Record<string, string>;
    const operatorOnlyResponse = await fetch(`${harness.baseUrl}/control/pause`, {
      method: "POST",
      headers: {
        ...assertionOnlyHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({ scope: "soft" }),
    });

    expect(operatorOnlyResponse.status).toBe(403);
    await expect(operatorOnlyResponse.json()).resolves.toMatchObject({
      success: false,
      code: "control_auth_invalid",
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
  });

  it("GET /control/release-gate surfaces explicit rollout gates and operator evidence", async () => {
    const originalEnv = { ...process.env };
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.TRADING_ENABLED = "true";
    process.env.LIVE_TEST_MODE = "true";
    process.env.ROLLOUT_POSTURE = "micro_live";
    process.env.DISCOVERY_PROVIDER = "dexscreener";
    process.env.MARKET_DATA_PROVIDER = "dexpaprika";
    process.env.STREAMING_PROVIDER = "dexpaprika";
    process.env.MORALIS_ENABLED = "false";
    process.env.WALLET_ADDRESS = "11111111111111111111111111111111";
    process.env.CONTROL_TOKEN = TEST_CONTROL_TOKEN;
    process.env.OPERATOR_READ_TOKEN = TEST_OPERATOR_READ_TOKEN;
    process.env.JUPITER_API_KEY = "phase19-jupiter-api-key";
    process.env.SIGNER_MODE = "remote";
    process.env.SIGNER_URL = "https://signer.example.com/sign";
    process.env.SIGNER_AUTH_TOKEN = "phase19-signer-auth-token";

    try {
      const harness = await createHarness({
        operatorReadToken: TEST_OPERATOR_READ_TOKEN,
        visibilitySnapshot: buildReleaseGateVisibilitySnapshot(),
      });
      harnesses.push(harness);

      const response = await fetch(`${harness.baseUrl}/control/release-gate`, {
        headers: operatorReadHeaders(),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        success: true,
        surfaceKind: "operational",
        rolloutStage: "blocked",
        releaseGate: {
          recommendedStage: "blocked",
          canArmMicroLive: false,
          canUseStagedLiveCandidate: false,
        },
      });
      expect(body.releaseGate.checklist).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "paper-safe",
            status: "fail",
          }),
          expect.objectContaining({
            id: "explicit-rollout-stage",
            status: "pass",
          }),
          expect.objectContaining({
            id: "micro-live-gate",
            status: "fail",
          }),
          expect.objectContaining({
            id: "staged-live-gate",
            status: "fail",
          }),
        ])
      );
      expect(body.operatorEvidenceChecklist).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ surfaceRef: "npm --prefix bot run live:preflight" }),
          expect.objectContaining({ surfaceRef: "GET /control/release-gate" }),
        ])
      );
      expect(body.incidentRunbook).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "provider_outage",
            controlSurfaces: expect.arrayContaining(["POST /control/pause", "POST /control/emergency-stop"]),
          }),
          expect.objectContaining({
            id: "signer_failure",
            controlSurfaces: expect.arrayContaining(["POST /control/emergency-stop", "POST /control/halt"]),
          }),
          expect.objectContaining({
            id: "rollback",
            controlSurfaces: expect.arrayContaining(["POST /control/live-promotion/:id/rollback"]),
          }),
        ])
      );
    } finally {
      process.env = originalEnv;
    }
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

  it("allows read-only control access with the operator-read token but not mutations", async () => {
    const harness = await createHarness({ operatorReadToken: TEST_OPERATOR_READ_TOKEN });
    harnesses.push(harness);

    const readResponse = await fetch(`${harness.baseUrl}/control/status`, {
      headers: operatorReadHeaders(),
    });
    expect(readResponse.status).toBe(200);
    const readBody = await readResponse.json();
    expect(readBody).toMatchObject({
      success: true,
      runtimeConfig: {
        requestedMode: "observe",
        appliedMode: "observe",
      },
    });

    const mutationResponse = await fetch(`${harness.baseUrl}/control/pause`, {
      method: "POST",
      headers: {
        ...operatorReadHeaders(),
        "content-type": "application/json",
      },
      body: JSON.stringify({ scope: "soft", reason: "read-token boundary check" }),
    });

    expect(mutationResponse.status).toBe(403);
    await expect(mutationResponse.json()).resolves.toMatchObject({
      success: false,
      code: "control_auth_invalid",
    });

    const history = await harness.manager.getHistory();
    expect(
      history.changes.some(
        (change) =>
          change.action === "auth_failure" &&
          change.accepted === false
      )
    ).toBe(true);
  });

  it("fails closed on route mutations while the kill switch is active", async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const emergency = await fetch(`${harness.baseUrl}/emergency-stop`, {
      method: "POST",
      headers: buildControlOperatorAssertionHeaders({ action: "emergency_stop", target: "/emergency-stop" }),
    });
    expect(emergency.status).toBe(200);

    const response = await fetch(`${harness.baseUrl}/control/mode`, {
      method: "POST",
      headers: {
        ...buildControlOperatorAssertionHeaders({ action: "mode_change", target: "/control/mode" }),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mode: "paper",
        reason: "attempted during kill switch",
      }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: "Control route disabled while kill switch is active.",
      killSwitch: {
        halted: true,
      },
    });

    const history = await harness.manager.getHistory();
    expect(
      history.changes.some(
        (change) => change.action === "kill_switch" && change.accepted && change.afterOverlay?.killSwitch === true
      )
    ).toBe(true);
    expect(
      history.changes.some((change) => change.action === "seed" && change.accepted && change.afterOverlay?.killSwitch === false)
    ).toBe(true);
  });
});
