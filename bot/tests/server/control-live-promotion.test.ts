import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryControlGovernanceRepository,
} from "../../src/persistence/control-governance-repository.js";
import type { ControlRecoveryRehearsalEvidenceRecord } from "../../src/control/control-governance.js";
import type { SchemaMigrationStatus } from "../../src/persistence/schema-migrations.js";
import { createRuntimeVisibilityRepository, type RuntimeVisibilitySnapshot } from "../../src/persistence/runtime-visibility-repository.js";
import { createControlServer } from "../../src/server/index.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";
import { getMicroLiveControlSnapshot, resetMicroLiveControlForTests } from "../../src/runtime/live-control.js";
import {
  buildControlOperatorAssertionHeaders,
  createRuntimeConfigTestManager,
  TEST_CONTROL_TOKEN,
  TEST_RUNTIME_ENV,
} from "../helpers/runtime-config-test-kit.js";

function buildReadySchemaStatus() {
  const status: SchemaMigrationStatus = {
    state: "ready",
    ready: true,
    migrationTablePresent: true,
    message: "Schema is ready.",
    migrationsDir: "migrations",
    availableMigrations: [],
    appliedMigrations: [],
    pendingMigrations: [],
    checksumMismatches: [],
    unknownAppliedVersions: [],
  };

  return status;
}

function seedRehearsalEvidence(
  repository: InMemoryControlGovernanceRepository,
  environment: string,
  executedAt: string
): Promise<void> {
  const evidence: ControlRecoveryRehearsalEvidenceRecord = {
    id: `rehearsal-${environment}-${executedAt}`,
    environment,
    rehearsalKind: "disposable_restore",
    status: "passed",
    executionSource: "automated",
    executionContext: {
      orchestration: "render_cron",
      provider: "render",
      serviceName: "bobbyexecute-rehearsal-refresh",
      schedule: "0 3 * * *",
      trigger: "scheduled_refresh",
    },
    executedAt,
    recordedAt: executedAt,
    actorId: "rehearsal-runner",
    actorDisplayName: "Rehearsal Runner",
    actorRole: "admin",
    sessionId: `session-${executedAt}`,
    sourceContext: { label: "canonical-production", kind: "canonical" },
    targetContext: { label: "disposable-rehearsal", kind: "disposable" },
    sourceDatabaseFingerprint: "source-fingerprint",
    targetDatabaseFingerprint: "target-fingerprint",
    sourceSchemaStatus: buildReadySchemaStatus(),
    targetSchemaStatusBefore: buildReadySchemaStatus(),
    targetSchemaStatusAfter: buildReadySchemaStatus(),
    restoreValidation: {
      matched: true,
      countsMatched: true,
      contentMatched: true,
      status: "exact_match",
      mismatchTables: [],
      countMismatchTables: [],
      metadataMismatches: [],
      before: {
        environment,
        capturedAt: executedAt,
        schemaState: "ready",
        counts: {},
        totalRecords: 0,
      },
      after: {
        environment,
        capturedAt: executedAt,
        schemaState: "ready",
        counts: {},
        totalRecords: 0,
      },
    },
    summary: "fresh disposable restore rehearsal",
  };

  return repository.recordDatabaseRehearsalEvidence(evidence);
}

function buildVisibilitySnapshot(referenceTimeMs: number): RuntimeVisibilitySnapshot {
  const heartbeatAt = new Date(referenceTimeMs).toISOString();
  const lastCycleAt = new Date(referenceTimeMs - 30_000).toISOString();
  const lastDecisionAt = new Date(referenceTimeMs - 30_000).toISOString();
  return {
    environment: "test",
    worker: {
      workerId: "worker-test-1",
      lastHeartbeatAt: heartbeatAt,
      lastCycleAt,
      lastSeenReloadNonce: 4,
      lastAppliedVersionId: "version-applied-1",
      lastValidVersionId: "version-valid-1",
      degraded: false,
      observedAt: heartbeatAt,
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
      lastCycleAt,
      lastDecisionAt,
      lastState: {
        stage: "monitor",
        traceId: "trace-worker-1",
        timestamp: lastCycleAt,
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
    },
    liveControl: getMicroLiveControlSnapshot(),
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

async function createHarness(referenceTimeMs = Date.now()) {
  const { manager } = await createRuntimeConfigTestManager();
  const runtimeVisibilityRepository = await createRuntimeVisibilityRepository();
  await runtimeVisibilityRepository.save(buildVisibilitySnapshot(referenceTimeMs));
  const governanceRepository = new InMemoryControlGovernanceRepository();
  const server = await createControlServer({
    port: 0,
    host: "127.0.0.1",
    runtimeConfigManager: manager,
    runtimeVisibilityRepository,
    governanceRepository,
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
      governanceRepository,
      baseUrl: `http://127.0.0.1:${address.port}`,
    };
  }

describe("control live promotion governance", () => {
  let harnesses: Array<Awaited<ReturnType<typeof createHarness>>> = [];
  const originalLiveTrading = process.env.LIVE_TRADING;
  const originalRolloutPosture = process.env.ROLLOUT_POSTURE;

  beforeEach(() => {
    resetKillSwitch();
    resetMicroLiveControlForTests();
    process.env.LIVE_TRADING = "true";
    process.env.ROLLOUT_POSTURE = "micro_live";
  });

  afterEach(async () => {
    for (const harness of [...harnesses].reverse()) {
      await harness.server.close();
    }
    harnesses = [];
    resetKillSwitch();
    resetMicroLiveControlForTests();
    if (originalLiveTrading === undefined) {
      delete process.env.LIVE_TRADING;
    } else {
      process.env.LIVE_TRADING = originalLiveTrading;
    }
    if (originalRolloutPosture === undefined) {
      delete process.env.ROLLOUT_POSTURE;
    } else {
      process.env.ROLLOUT_POSTURE = originalRolloutPosture;
    }
  });

  it("blocks viewer roles from governed live promotion actions", async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const response = await fetch(`${harness.baseUrl}/control/live-promotion/request`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildControlOperatorAssertionHeaders({
          role: "viewer",
          actorId: "viewer-1",
          displayName: "Viewer One",
          action: "live_promotion_request",
          target: "/control/live-promotion/request",
          authResult: "denied",
          reason: "viewer cannot promote",
        }),
      },
      body: JSON.stringify({ targetMode: "live_limited", reason: "try live limited" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "control_auth_invalid",
    });
  });

  it("records an auditable blocked live-promotion request when the kill switch is active", async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const emergencyResponse = await fetch(`${harness.baseUrl}/emergency-stop`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildControlOperatorAssertionHeaders({
          role: "admin",
          actorId: "alice",
          displayName: "Alice Example",
          action: "emergency_stop",
          target: "/emergency-stop",
          authResult: "authorized",
        }),
      },
      body: JSON.stringify({ reason: "emergency halt" }),
    });

    expect(emergencyResponse.status).toBe(200);
    await expect(emergencyResponse.json()).resolves.toMatchObject({
      success: true,
      accepted: true,
      runtimeConfig: {
        killSwitch: true,
      },
    });

    const blockedResponse = await fetch(`${harness.baseUrl}/control/live-promotion/request`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildControlOperatorAssertionHeaders({
          role: "admin",
          actorId: "alice",
          displayName: "Alice Example",
          action: "live_promotion_request",
          target: "/control/live-promotion/request",
          authResult: "authorized",
        }),
      },
      body: JSON.stringify({ targetMode: "live_limited", reason: "blocked by kill switch" }),
    });

    expect(blockedResponse.status).toBe(409);
    await expect(blockedResponse.json()).resolves.toMatchObject({
      success: false,
      message: "Control route disabled while kill switch is active.",
      killSwitch: {
        halted: true,
      },
    });

    const auditEvents = await harness.governanceRepository.listAuditEvents("test");
    expect(
      auditEvents.some(
        (event) =>
          event.action === "emergency_stop" &&
          event.result === "allowed" &&
          event.target === "/control/emergency-stop"
      )
    ).toBe(true);
    expect(
      auditEvents.some(
        (event) =>
          event.action === "live_promotion_request" &&
          event.result === "blocked" &&
          event.target === "/control/live-promotion/request"
      )
    ).toBe(true);
    expect(auditEvents[0]?.action).toBe("live_promotion_request");
    expect(auditEvents[1]?.action).toBe("emergency_stop");
  });

  it("persists approved live promotions and rollback state durably", async () => {
    const harness = await createHarness();
    harnesses.push(harness);
    await seedRehearsalEvidence(harness.governanceRepository, TEST_RUNTIME_ENV, new Date().toISOString());

    const requestResponse = await fetch(`${harness.baseUrl}/control/live-promotion/request`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildControlOperatorAssertionHeaders({
          role: "admin",
          actorId: "alice",
          displayName: "Alice Example",
          action: "live_promotion_request",
          target: "/control/live-promotion/request",
          authResult: "authorized",
        }),
      },
      body: JSON.stringify({ targetMode: "live_limited", reason: "governed promotion" }),
    });

    expect(requestResponse.status).toBe(201);
    const requestBody = await requestResponse.json();
    expect(requestBody).toMatchObject({
      success: true,
      accepted: true,
      request: {
        workflowStatus: "pending",
        applicationStatus: "pending_restart",
        requestedByActorId: "alice",
        requestedByDisplayName: "Alice Example",
        requestedByRole: "admin",
      },
    });
    expect(requestBody.gate.databaseRehearsal.latestEvidence.executionSource).toBe("automated");
    const requestId = requestBody.request.id as string;

    const approveResponse = await fetch(`${harness.baseUrl}/control/live-promotion/${requestId}/approve`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildControlOperatorAssertionHeaders({
          role: "admin",
          actorId: "alice",
          displayName: "Alice Example",
          action: "live_promotion_approve",
          target: `/control/live-promotion/${requestId}/approve`,
          requestId,
          authResult: "authorized",
        }),
      },
      body: JSON.stringify({ reason: "approved after review" }),
    });

    expect(approveResponse.status).toBe(200);
    const approveBody = await approveResponse.json();
    expect(approveBody).toMatchObject({
      success: true,
      accepted: true,
      request: {
        id: requestId,
        workflowStatus: "approved",
        approvedByActorId: "alice",
      },
    });

    const applyResponse = await fetch(`${harness.baseUrl}/control/live-promotion/${requestId}/apply`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildControlOperatorAssertionHeaders({
          role: "admin",
          actorId: "alice",
          displayName: "Alice Example",
          action: "live_promotion_apply",
          target: `/control/live-promotion/${requestId}/apply`,
          requestId,
          authResult: "authorized",
        }),
      },
      body: JSON.stringify({ reason: "apply governed promotion" }),
    });

    expect(applyResponse.status).toBe(200);
    const applyBody = await applyResponse.json();
    expect(applyBody).toMatchObject({
      success: true,
      accepted: true,
      request: {
        id: requestId,
        workflowStatus: "applied",
        appliedByActorId: "alice",
      },
    });

    const rollbackResponse = await fetch(`${harness.baseUrl}/control/live-promotion/${requestId}/rollback`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildControlOperatorAssertionHeaders({
          role: "admin",
          actorId: "alice",
          displayName: "Alice Example",
          action: "live_promotion_rollback",
          target: `/control/live-promotion/${requestId}/rollback`,
          requestId,
          authResult: "authorized",
        }),
      },
      body: JSON.stringify({ reason: "rollback after review" }),
    });

    expect(rollbackResponse.status).toBe(200);
    const rollbackBody = await rollbackResponse.json();
    expect(rollbackBody).toMatchObject({
      success: true,
      accepted: true,
      request: {
        id: requestId,
        workflowStatus: "rolled_back",
        rolledBackByActorId: "alice",
      },
    });

    const listResponse = await fetch(`${harness.baseUrl}/control/live-promotion?targetMode=live_limited`, {
      headers: buildControlOperatorAssertionHeaders({
        role: "admin",
        actorId: "alice",
        displayName: "Alice Example",
        action: "read_only",
        target: "/control/live-promotion",
        authResult: "authorized",
      }),
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      success: true,
      gate: {
        targetMode: "live_limited",
      },
      requests: [
        expect.objectContaining({
          id: requestId,
          workflowStatus: "rolled_back",
          applicationStatus: "rolled_back",
        }),
      ],
    });
  });

  it("fails closed when worker heartbeat is stale", async () => {
    const harness = await createHarness(Date.now() - 10 * 60 * 1000);
    harnesses.push(harness);
    await seedRehearsalEvidence(harness.governanceRepository, TEST_RUNTIME_ENV, new Date().toISOString());

    const response = await fetch(`${harness.baseUrl}/control/live-promotion/request`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildControlOperatorAssertionHeaders({
          role: "admin",
          actorId: "alice",
          displayName: "Alice Example",
          action: "live_promotion_request",
          target: "/control/live-promotion/request",
          authResult: "authorized",
        }),
      },
      body: JSON.stringify({ targetMode: "live_limited", reason: "stale heartbeat gate" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      accepted: false,
      gate: {
        allowed: false,
        reasons: expect.arrayContaining([
          expect.objectContaining({
            code: "stale_worker_heartbeat",
          }),
        ]),
      },
        request: {
          workflowStatus: "blocked",
          applicationStatus: "rejected",
        },
      });
  });

  it("blocks governed live promotion when rehearsal evidence is missing", async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const response = await fetch(`${harness.baseUrl}/control/live-promotion/request`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildControlOperatorAssertionHeaders({
          role: "admin",
          actorId: "alice",
          displayName: "Alice Example",
          action: "live_promotion_request",
          target: "/control/live-promotion/request",
          authResult: "authorized",
        }),
      },
      body: JSON.stringify({ targetMode: "live_limited", reason: "missing rehearsal evidence" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      accepted: false,
      gate: {
        allowed: false,
        databaseRehearsal: {
          status: "missing",
        },
        reasons: expect.arrayContaining([
          expect.objectContaining({
            code: "database_rehearsal_missing",
          }),
        ]),
      },
    });
  });

  it("blocks governed live promotion when rehearsal evidence is stale", async () => {
    const harness = await createHarness();
    harnesses.push(harness);
    const staleAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await seedRehearsalEvidence(harness.governanceRepository, TEST_RUNTIME_ENV, staleAt);

    const response = await fetch(`${harness.baseUrl}/control/live-promotion/request`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildControlOperatorAssertionHeaders({
          role: "admin",
          actorId: "alice",
          displayName: "Alice Example",
          action: "live_promotion_request",
          target: "/control/live-promotion/request",
          authResult: "authorized",
        }),
      },
      body: JSON.stringify({ targetMode: "live_limited", reason: "stale rehearsal evidence" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      accepted: false,
      gate: {
        allowed: false,
        databaseRehearsal: {
          status: "stale",
        },
        reasons: expect.arrayContaining([
          expect.objectContaining({
            code: "database_rehearsal_stale",
          }),
        ]),
      },
    });
  });
});
