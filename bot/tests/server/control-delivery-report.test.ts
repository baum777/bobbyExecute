import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRuntimeVisibilityRepository, type RuntimeVisibilitySnapshot } from "../../src/persistence/runtime-visibility-repository.js";
import { createControlServer } from "../../src/server/index.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";
import {
  InMemoryWorkerRestartAlertRepository,
  type WorkerRestartAlertEventRecord,
  type WorkerRestartAlertRecord,
} from "../../src/persistence/worker-restart-alert-repository.js";
import { createRuntimeConfigTestManager, controlHeaders, TEST_CONTROL_TOKEN } from "../helpers/runtime-config-test-kit.js";

const WINDOW_START = "2026-03-27T00:00:00.000Z";
const WINDOW_END = "2026-03-28T00:00:00.000Z";

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

function buildAlert(overrides: Partial<WorkerRestartAlertRecord>): WorkerRestartAlertRecord {
  return {
    id: overrides.id ?? "alert-default",
    environment: overrides.environment ?? "production",
    dedupeKey: overrides.dedupeKey ?? `request:${overrides.id ?? "default"}`,
    restartRequestId: overrides.restartRequestId,
    workerService: overrides.workerService ?? "runtime-worker",
    targetWorker: overrides.targetWorker,
    targetVersionId: overrides.targetVersionId,
    sourceCategory: overrides.sourceCategory ?? "restart_timeout",
    reasonCode: overrides.reasonCode ?? "restart_timeout",
    severity: overrides.severity ?? "warning",
    status: overrides.status ?? "open",
    summary: overrides.summary ?? "restart alert",
    recommendedAction: overrides.recommendedAction ?? "inspect the worker",
    metadata: overrides.metadata,
    conditionSignature: overrides.conditionSignature ?? `signature-${overrides.id ?? "default"}`,
    occurrenceCount: overrides.occurrenceCount ?? 1,
    firstSeenAt: overrides.firstSeenAt ?? WINDOW_START,
    lastSeenAt: overrides.lastSeenAt ?? WINDOW_START,
    lastEvaluatedAt: overrides.lastEvaluatedAt ?? WINDOW_START,
    acknowledgedAt: overrides.acknowledgedAt,
    acknowledgedBy: overrides.acknowledgedBy,
    acknowledgmentNote: overrides.acknowledgmentNote,
    resolvedAt: overrides.resolvedAt,
    resolvedBy: overrides.resolvedBy,
    resolutionNote: overrides.resolutionNote,
    lastRestartRequestStatus: overrides.lastRestartRequestStatus,
    lastRestartRequestUpdatedAt: overrides.lastRestartRequestUpdatedAt,
    lastWorkerHeartbeatAt: overrides.lastWorkerHeartbeatAt,
    lastAppliedVersionId: overrides.lastAppliedVersionId,
    requestedVersionId: overrides.requestedVersionId,
    notification: overrides.notification,
    createdAt: overrides.createdAt ?? WINDOW_START,
    updatedAt: overrides.updatedAt ?? WINDOW_START,
  };
}

function buildEvent(overrides: Partial<WorkerRestartAlertEventRecord>): WorkerRestartAlertEventRecord {
  return {
    id: overrides.id ?? "event-default",
    environment: overrides.environment ?? "production",
    alertId: overrides.alertId ?? "alert-default",
    action: overrides.action ?? "notification_sent",
    actor: overrides.actor ?? "control-plane",
    accepted: overrides.accepted ?? true,
    beforeStatus: overrides.beforeStatus,
    afterStatus: overrides.afterStatus,
    reasonCode: overrides.reasonCode,
    summary: overrides.summary,
    note: overrides.note,
    metadata: overrides.metadata,
    notificationSinkName: overrides.notificationSinkName,
    notificationSinkType: overrides.notificationSinkType,
    notificationDestinationName: overrides.notificationDestinationName,
    notificationDestinationType: overrides.notificationDestinationType,
    notificationFormatterProfile: overrides.notificationFormatterProfile,
    notificationDestinationPriority: overrides.notificationDestinationPriority,
    notificationDestinationTags: overrides.notificationDestinationTags,
    notificationEventType: overrides.notificationEventType,
    notificationStatus: overrides.notificationStatus,
    notificationDedupeKey: overrides.notificationDedupeKey,
    notificationPayloadFingerprint: overrides.notificationPayloadFingerprint,
    notificationAttemptCount: overrides.notificationAttemptCount,
    notificationFailureReason: overrides.notificationFailureReason,
    notificationSuppressionReason: overrides.notificationSuppressionReason,
    notificationRouteReason: overrides.notificationRouteReason,
    notificationResponseStatus: overrides.notificationResponseStatus,
    notificationResponseBody: overrides.notificationResponseBody,
    notificationScope: overrides.notificationScope ?? "external",
    createdAt: overrides.createdAt ?? WINDOW_START,
  };
}

async function seedRepository(): Promise<InMemoryWorkerRestartAlertRepository> {
  const repository = new InMemoryWorkerRestartAlertRepository();
  const alerts = [
    buildAlert({
      id: "alert-production-primary",
      environment: "production",
      restartRequestId: "restart-production",
      severity: "critical",
      status: "open",
      summary: "production primary alert",
      targetVersionId: "version-prod",
      requestedVersionId: "version-prod",
      lastRestartRequestStatus: "requested",
      createdAt: "2026-03-27T11:50:00.000Z",
      updatedAt: "2026-03-27T11:50:00.000Z",
    }),
    buildAlert({
      id: "alert-production-secondary",
      environment: "production",
      restartRequestId: "restart-production-secondary",
      severity: "critical",
      status: "open",
      summary: "production secondary alert",
      targetVersionId: "version-prod",
      requestedVersionId: "version-prod",
      lastRestartRequestStatus: "requested",
      createdAt: "2026-03-27T11:40:00.000Z",
      updatedAt: "2026-03-27T11:40:00.000Z",
    }),
    buildAlert({
      id: "alert-staging-resolved",
      environment: "staging",
      restartRequestId: "restart-staging",
      severity: "warning",
      status: "resolved",
      summary: "staging suppressed alert",
      targetVersionId: "version-staging",
      requestedVersionId: "version-staging",
      lastRestartRequestStatus: "converged",
      resolvedAt: "2026-03-27T11:30:00.000Z",
      createdAt: "2026-03-27T11:20:00.000Z",
      updatedAt: "2026-03-27T11:30:00.000Z",
    }),
    buildAlert({
      id: "alert-staging-open",
      environment: "staging",
      restartRequestId: "restart-staging-open",
      severity: "warning",
      status: "open",
      summary: "staging skipped alert",
      targetVersionId: "version-staging",
      requestedVersionId: "version-staging",
      lastRestartRequestStatus: "requested",
      createdAt: "2026-03-27T11:10:00.000Z",
      updatedAt: "2026-03-27T11:10:00.000Z",
    }),
  ];
  for (const alert of alerts) {
    await repository.save(alert);
  }
  await repository.recordEvent(
    buildEvent({
      id: "event-production-primary",
      environment: "production",
      alertId: "alert-production-primary",
      action: "notification_sent",
      summary: "primary sent",
      notificationSinkName: "restart-alert-webhook",
      notificationSinkType: "generic_webhook",
      notificationDestinationName: "primary",
      notificationDestinationType: "primary",
      notificationFormatterProfile: "generic",
      notificationEventType: "alert_opened",
      notificationStatus: "sent",
      notificationDedupeKey: "dedupe-primary-sent",
      notificationPayloadFingerprint: "payload-primary",
      notificationAttemptCount: 1,
      notificationRouteReason: "critical production alert routed to primary",
      notificationScope: "external",
      createdAt: "2026-03-27T11:50:05.000Z",
    })
  );
  await repository.recordEvent(
    buildEvent({
      id: "event-production-secondary",
      environment: "production",
      alertId: "alert-production-secondary",
      action: "notification_failed",
      summary: "secondary failed",
      notificationSinkName: "restart-alert-webhook",
      notificationSinkType: "generic_webhook",
      notificationDestinationName: "secondary",
      notificationDestinationType: "secondary",
      notificationFormatterProfile: "slack",
      notificationEventType: "alert_escalated",
      notificationStatus: "failed",
      notificationDedupeKey: "dedupe-secondary-failed",
      notificationPayloadFingerprint: "payload-secondary",
      notificationAttemptCount: 2,
      notificationFailureReason: "provider responded with 503",
      notificationRouteReason: "secondary escalation target selected",
      notificationResponseStatus: 503,
      notificationScope: "external",
      createdAt: "2026-03-27T11:40:05.000Z",
    })
  );
  await repository.recordEvent(
    buildEvent({
      id: "event-staging-suppressed",
      environment: "staging",
      alertId: "alert-staging-resolved",
      action: "notification_suppressed",
      summary: "staging suppressed",
      notificationSinkName: "restart-alert-webhook",
      notificationSinkType: "generic_webhook",
      notificationDestinationName: "staging",
      notificationDestinationType: "staging",
      notificationFormatterProfile: "generic",
      notificationEventType: "alert_resolved",
      notificationStatus: "suppressed",
      notificationDedupeKey: "dedupe-staging-suppressed",
      notificationAttemptCount: 1,
      notificationSuppressionReason: "cooldown active",
      notificationRouteReason: "cooldown active for staging",
      notificationScope: "external",
      createdAt: "2026-03-27T11:30:05.000Z",
    })
  );
  await repository.recordEvent(
    buildEvent({
      id: "event-staging-skipped",
      environment: "staging",
      alertId: "alert-staging-open",
      action: "notification_skipped",
      summary: "staging skipped",
      notificationSinkName: "restart-alert-webhook",
      notificationSinkType: "generic_webhook",
      notificationDestinationName: "staging",
      notificationDestinationType: "staging",
      notificationFormatterProfile: "generic",
      notificationEventType: "alert_opened",
      notificationStatus: "skipped",
      notificationDedupeKey: "dedupe-staging-skipped",
      notificationAttemptCount: 1,
      notificationRouteReason: "destination not selected by policy",
      notificationScope: "external",
      createdAt: "2026-03-27T11:10:05.000Z",
    })
  );

  return repository;
}

async function createHarness() {
  const { manager } = await createRuntimeConfigTestManager();
  const runtimeVisibilityRepository = await createRuntimeVisibilityRepository();
  await runtimeVisibilityRepository.save(buildVisibilitySnapshot());
  const restartAlertRepository = await seedRepository();
  const server = await createControlServer({
    port: 0,
    host: "127.0.0.1",
    runtimeConfigManager: manager,
    runtimeVisibilityRepository,
    restartAlertRepository,
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
  };
}

describe("control delivery reporting routes", () => {
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

  it("returns filtered delivery journals and compact summaries", async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const journalResponse = await fetch(
      `${harness.baseUrl}/control/restart-alert-deliveries?environment=production&destinationName=secondary&status=failed&severity=critical`,
      {
        headers: controlHeaders(),
      }
    );
    expect(journalResponse.status).toBe(200);
    await expect(journalResponse.json()).resolves.toMatchObject({
      success: true,
      totalCount: 1,
      deliveries: [
        {
          eventId: "event-production-secondary",
          destinationName: "secondary",
          deliveryStatus: "failed",
          failureReason: "provider responded with 503",
        },
      ],
    });

    const summaryResponse = await fetch(
      `${harness.baseUrl}/control/restart-alert-deliveries/summary?environment=staging&from=${encodeURIComponent(WINDOW_START)}&to=${encodeURIComponent(WINDOW_END)}`,
      {
        headers: controlHeaders(),
      }
    );
    expect(summaryResponse.status).toBe(200);
    await expect(summaryResponse.json()).resolves.toMatchObject({
      success: true,
      totalCount: 2,
      destinations: [
        expect.objectContaining({
          destinationName: "staging",
          suppressedCount: 1,
          skippedCount: 1,
          healthHint: "idle",
        }),
      ],
    });
  }, 15000);

  it("rejects invalid delivery windows cleanly", async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const response = await fetch(
      `${harness.baseUrl}/control/restart-alert-deliveries?from=2026-03-28T00:00:00.000Z&to=2026-03-27T00:00:00.000Z`,
      {
        headers: controlHeaders(),
      }
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: "delivery window start must be before the end",
    });
  }, 15000);

  it("returns compact delivery trend rows and empty results through the control plane", async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const trendResponse = await fetch(
      `${harness.baseUrl}/control/restart-alert-deliveries/trends?environment=production&destinationName=secondary&referenceEndAt=${encodeURIComponent(WINDOW_END)}`,
      {
        headers: controlHeaders(),
      }
    );
    expect(trendResponse.status).toBe(200);
    await expect(trendResponse.json()).resolves.toMatchObject({
      success: true,
      totalCount: 1,
      destinations: [
        expect.objectContaining({
          destinationName: "secondary",
          currentWindow: expect.objectContaining({
            totalCount: 1,
            failedCount: 1,
          }),
          comparisonWindow: expect.objectContaining({
            totalCount: 1,
          }),
          currentHealthHint: "failing",
          trendHint: "insufficient_data",
        }),
      ],
    });

    const emptyResponse = await fetch(
      `${harness.baseUrl}/control/restart-alert-deliveries/trends?environment=qa&referenceEndAt=${encodeURIComponent(WINDOW_END)}`,
      {
        headers: controlHeaders(),
      }
    );
    expect(emptyResponse.status).toBe(200);
    await expect(emptyResponse.json()).resolves.toMatchObject({
      success: true,
      totalCount: 0,
      destinations: [],
    });
  }, 15000);

  it("rejects invalid delivery trend query params cleanly", async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const response = await fetch(`${harness.baseUrl}/control/restart-alert-deliveries/trends?foo=bar`, {
      headers: controlHeaders(),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: "invalid trend query parameter: foo",
    });
  }, 15000);
});
