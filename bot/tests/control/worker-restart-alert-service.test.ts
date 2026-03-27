import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeConfigTestManager } from "../helpers/runtime-config-test-kit.js";
import { createRuntimeVisibilityRepository, type RuntimeVisibilitySnapshot } from "../../src/persistence/runtime-visibility-repository.js";
import {
  InMemoryWorkerRestartRepository,
  type WorkerRestartRequestRecord,
} from "../../src/persistence/worker-restart-repository.js";
import {
  InMemoryWorkerRestartAlertRepository,
} from "../../src/persistence/worker-restart-alert-repository.js";
import { WorkerRestartAlertService } from "../../src/control/worker-restart-alert-service.js";
import { WorkerRestartService } from "../../src/control/worker-restart-service.js";
import type {
  WorkerRestartOrchestrator,
  WorkerRestartOrchestrationRequest,
} from "../../src/control/restart-orchestrator.js";

function nowMs(): number {
  return Date.now();
}

function isoOffset(ms: number): string {
  return new Date(nowMs() + ms).toISOString();
}

function buildVisibilitySnapshot(options: {
  workerId?: string;
  heartbeatAt?: string;
  lastAppliedVersionId?: string;
  lastValidVersionId?: string;
} = {}): RuntimeVisibilitySnapshot {
  const heartbeatAt = options.heartbeatAt ?? isoOffset(0);
  const lastAppliedVersionId = options.lastAppliedVersionId ?? "version-applied";
  const lastValidVersionId = options.lastValidVersionId ?? lastAppliedVersionId;
  return {
    environment: "test",
    worker: {
      workerId: options.workerId ?? "worker-restart-alert-test",
      lastHeartbeatAt: heartbeatAt,
      lastCycleAt: heartbeatAt,
      lastSeenReloadNonce: 0,
      lastAppliedVersionId,
      lastValidVersionId,
      degraded: false,
      observedAt: heartbeatAt,
    },
    runtime: {
      status: "running",
      mode: "paper",
      paperModeActive: true,
      cycleInFlight: false,
      counters: {
        cycleCount: 1,
        decisionCount: 1,
        executionCount: 0,
        blockedCount: 1,
        errorCount: 0,
      },
      lastCycleAt: heartbeatAt,
      lastDecisionAt: heartbeatAt,
      lastState: {
        stage: "monitor",
        traceId: "trace-alert-test",
        timestamp: heartbeatAt,
        blocked: false,
      },
      degradedState: {
        active: false,
        consecutiveCycles: 0,
        recoveryCount: 0,
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
        appliedVersionId: lastAppliedVersionId,
        lastValidVersionId,
        reloadNonce: 0,
        lastAppliedReloadNonce: 0,
        paused: false,
        killSwitch: false,
        pendingApply: false,
        requiresRestart: false,
        degraded: false,
      },
    },
    metrics: {
      cycleCount: 1,
      decisionCount: 1,
      executionCount: 0,
      blockedCount: 1,
      errorCount: 0,
      lastCycleAtEpochMs: Date.parse(heartbeatAt),
      lastDecisionAtEpochMs: Date.parse(heartbeatAt),
    },
  };
}

function createOrchestrator(options: {
  configured?: boolean;
  requestImpl?: (input: WorkerRestartOrchestrationRequest) => Promise<any>;
} = {}): WorkerRestartOrchestrator {
  return {
    configured: options.configured ?? true,
    method: "deploy_hook",
    targetService: "mock-runtime-worker",
    describe() {
      return {
        configured: this.configured,
        method: this.method,
        targetService: this.targetService,
        targetWorker: "mock-runtime-worker",
      };
    },
    async requestRestart(input) {
      if (options.requestImpl) {
        return options.requestImpl(input);
      }
      return {
        accepted: true,
        method: "deploy_hook",
        targetService: input.targetService,
        providerStatusCode: 202,
        providerRequestId: "provider-request-1",
        providerMessage: "accepted",
      };
    },
  };
}

async function createHarness(options: {
  orchestrator?: WorkerRestartOrchestrator;
  convergenceTimeoutMs?: number;
  quietWindowMs?: number;
  repeatWindowMs?: number;
  repeatFailureThreshold?: number;
} = {}) {
  const { manager } = await createRuntimeConfigTestManager();
  const visibilityRepository = await createRuntimeVisibilityRepository();
  await visibilityRepository.save(buildVisibilitySnapshot());
  const restartRepository = new InMemoryWorkerRestartRepository();
  const alertRepository = new InMemoryWorkerRestartAlertRepository();
  const alertService = new WorkerRestartAlertService({
    environment: "test",
    workerServiceName: "mock-runtime-worker",
    restartRepository,
    alertRepository,
    convergenceTimeoutMs: options.convergenceTimeoutMs ?? 180_000,
    quietWindowMs: options.quietWindowMs ?? 60_000,
    repeatWindowMs: options.repeatWindowMs ?? 3_600_000,
    repeatFailureThreshold: options.repeatFailureThreshold ?? 2,
  });

  const restartService = new WorkerRestartService({
    runtimeConfigManager: manager,
    runtimeVisibilityRepository: visibilityRepository,
    restartRepository,
    alertService,
    environment: "test",
    workerServiceName: "mock-runtime-worker",
    orchestrator: options.orchestrator ?? createOrchestrator(),
    convergenceTimeoutMs: options.convergenceTimeoutMs ?? 180_000,
  });

  return {
    manager,
    visibilityRepository,
    restartRepository,
    alertRepository,
    alertService,
    restartService,
  };
}

async function seedPendingRestart(harness: Awaited<ReturnType<typeof createHarness>>, options: {
  requestAgeMs?: number;
  heartbeatAt?: string;
  lastAppliedVersionId?: string;
  status?: WorkerRestartRequestRecord["status"];
  reason?: string;
} = {}) {
  await harness.manager.setMode("paper", {
    actor: "operator",
    reason: options.reason ?? "paper promotion",
  });

  const status = harness.manager.getRuntimeConfigStatus();
  const requestedVersionId = status.requestedVersionId ?? "version-requested";
  const requestedAt = new Date(nowMs() - (options.requestAgeMs ?? 60_000)).toISOString();
  const record: WorkerRestartRequestRecord = {
    id: "restart-request-1",
    environment: "test",
    actor: "operator",
    reason: options.reason ?? "paper promotion",
    targetVersionId: requestedVersionId,
    targetService: "mock-runtime-worker",
    targetWorker: "mock-runtime-worker",
    method: "deploy_hook",
    status: options.status ?? "requested",
    accepted: true,
    restartRequired: true,
    restartRequiredReason: "runtime config change requires restart",
    requestedAt,
    updatedAt: requestedAt,
    deadlineAt: new Date(nowMs() + 180_000).toISOString(),
  };
  await harness.restartRepository.save(record);

  await harness.visibilityRepository.save(
    buildVisibilitySnapshot({
      heartbeatAt: options.heartbeatAt ?? isoOffset(0),
      lastAppliedVersionId: options.lastAppliedVersionId ?? "version-applied-old",
      lastValidVersionId: options.lastAppliedVersionId ?? "version-applied-old",
    })
  );

  return { requestedVersionId, record };
}

describe("restart alert service", () => {
  afterEach(() => {
    // no-op: all state is in-memory or test-scoped repositories
  });

  it("opens an orchestration failure alert", async () => {
    const harness = await createHarness({
      orchestrator: createOrchestrator({
        requestImpl: async () => ({
          accepted: false,
          method: "deploy_hook",
          targetService: "mock-runtime-worker",
          providerStatusCode: 502,
          providerMessage: "deploy hook rejected",
        }),
      }),
    });

    await harness.manager.setMode("paper", {
      actor: "operator",
      reason: "paper promotion",
    });

    const response = await harness.restartService.requestRestart({
      actor: "operator",
      reason: "paper promotion",
      idempotencyKey: "restart-1",
    });

    expect(response.accepted).toBe(false);
    expect(response.statusCode).toBe(502);

    const alerts = await harness.restartService.readRestartAlerts();
    expect(alerts.summary.openAlertCount).toBe(1);
    expect(alerts.alerts[0]).toMatchObject({
      sourceCategory: "orchestration_failure",
      severity: "warning",
      status: "open",
    });
  });

  it("opens a missing-worker-heartbeat alert after timeout", async () => {
    const harness = await createHarness();
    const { requestedVersionId } = await seedPendingRestart(harness, {
      requestAgeMs: 60_000,
      heartbeatAt: isoOffset(-70_000),
      lastAppliedVersionId: "version-applied-old",
    });

    const alerts = await harness.restartService.readRestartAlerts();
    const alert = alerts.alerts.find((entry) => entry.restartRequestId === "restart-request-1");
    expect(alert).toMatchObject({
      sourceCategory: "missing_worker_heartbeat",
      status: "open",
      targetVersionId: requestedVersionId,
    });
    expect(alerts.summary.divergenceAlerting).toBe(true);
  });

  it("opens an applied-version-stalled alert after timeout", async () => {
    const harness = await createHarness();
    await seedPendingRestart(harness, {
      requestAgeMs: 60_000,
      heartbeatAt: isoOffset(-5_000),
      lastAppliedVersionId: "version-applied-old",
    });

    const alerts = await harness.restartService.readRestartAlerts();
    const alert = alerts.alerts.find((entry) => entry.restartRequestId === "restart-request-1");
    expect(alert).toMatchObject({
      sourceCategory: "applied_version_stalled",
      status: "open",
    });
  });

  it("escalates repeated restart failures to critical", async () => {
    const harness = await createHarness();
    const now = new Date().toISOString();
    const older = new Date(Date.now() - 30_000).toISOString();
    await harness.restartRepository.save({
      id: "restart-failure-1",
      environment: "test",
      actor: "operator",
      reason: "first failure",
      targetVersionId: "version-1",
      targetService: "mock-runtime-worker",
      targetWorker: "mock-runtime-worker",
      method: "deploy_hook",
      status: "cooldown",
      accepted: false,
      restartRequired: true,
      requestedAt: older,
      updatedAt: older,
      rejectionReason: "rate limited",
    });
    await harness.restartRepository.save({
      id: "restart-failure-2",
      environment: "test",
      actor: "operator",
      reason: "second failure",
      targetVersionId: "version-1",
      targetService: "mock-runtime-worker",
      targetWorker: "mock-runtime-worker",
      method: "deploy_hook",
      status: "cooldown",
      accepted: false,
      restartRequired: true,
      requestedAt: now,
      updatedAt: now,
      rejectionReason: "rate limited",
    });

    const alerts = await harness.restartService.readRestartAlerts();
    const alert = alerts.alerts.find((entry) => entry.sourceCategory === "repeated_restart_failures");
    expect(alert).toMatchObject({
      severity: "critical",
      status: "open",
    });
  });

  it("auto-resolves a restart alert when the worker converges", async () => {
    const harness = await createHarness();
    const { requestedVersionId } = await seedPendingRestart(harness, {
      requestAgeMs: 60_000,
      heartbeatAt: isoOffset(-70_000),
      lastAppliedVersionId: "version-applied-old",
    });

    const openAlerts = await harness.restartService.readRestartAlerts();
    const alertId = openAlerts.alerts.find((entry) => entry.restartRequestId === "restart-request-1")?.id;
    expect(alertId).toBeDefined();
    expect(openAlerts.alerts.find((entry) => entry.restartRequestId === "restart-request-1")?.status).toBe("open");

    await harness.visibilityRepository.save(
      buildVisibilitySnapshot({
        heartbeatAt: isoOffset(0),
        lastAppliedVersionId: requestedVersionId,
        lastValidVersionId: requestedVersionId,
      })
    );
    await harness.manager.confirmRestartApplied({ actor: "worker", reason: "worker converged" });

    const resolvedAlerts = await harness.restartService.readRestartAlerts();
    const alert = resolvedAlerts.alerts.find((entry) => entry.id === alertId);
    expect(resolvedAlerts.summary.openAlertCount).toBe(0);
    expect(alert).toMatchObject({
      status: "resolved",
      resolvedBy: "system",
    });
  });

  it("dedupes repeated evaluation of the same active alert", async () => {
    const harness = await createHarness({ quietWindowMs: 3_600_000 });
    await seedPendingRestart(harness, {
      requestAgeMs: 60_000,
      heartbeatAt: isoOffset(-70_000),
      lastAppliedVersionId: "version-applied-old",
    });

    const first = await harness.restartService.readRestartAlerts();
    const firstAlert = first.alerts.find((entry) => entry.restartRequestId === "restart-request-1");
    expect(firstAlert?.occurrenceCount).toBe(1);

    const second = await harness.restartService.readRestartAlerts();
    const secondAlert = second.alerts.find((entry) => entry.restartRequestId === "restart-request-1");
    expect(secondAlert?.occurrenceCount).toBe(1);
    expect(secondAlert?.id).toBe(firstAlert?.id);
  });

  it("audits acknowledge and rejects manual resolve while active", async () => {
    const harness = await createHarness();
    await seedPendingRestart(harness, {
      requestAgeMs: 60_000,
      heartbeatAt: isoOffset(-70_000),
      lastAppliedVersionId: "version-applied-old",
    });

    const alerts = await harness.restartService.readRestartAlerts();
    const alert = alerts.alerts.find((entry) => entry.restartRequestId === "restart-request-1");
    expect(alert).toBeDefined();

    const acknowledged = await harness.restartService.acknowledgeRestartAlert(alert!.id, {
      actor: "operator",
      note: "investigating",
    });
    expect(acknowledged.accepted).toBe(true);
    expect(acknowledged.alert?.status).toBe("acknowledged");

    const events = await harness.alertRepository.listEvents("test", alert!.id);
    expect(events.map((event) => event.action)).toEqual(expect.arrayContaining(["acknowledged"]));

    const resolved = await harness.restartService.resolveRestartAlert(alert!.id, {
      actor: "operator",
      note: "manual resolution attempt",
    });
    expect(resolved.accepted).toBe(false);
    expect(resolved.statusCode).toBe(409);
    expect(resolved.reason).toContain("still active");
  });
});
