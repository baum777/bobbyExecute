import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntimeConfigTestManager } from "../helpers/runtime-config-test-kit.js";
import { createRuntimeVisibilityRepository, type RuntimeVisibilitySnapshot } from "../../src/persistence/runtime-visibility-repository.js";
import {
  InMemoryWorkerRestartRepository,
  type WorkerRestartRequestRecord,
} from "../../src/persistence/worker-restart-repository.js";
import { WorkerRestartService } from "../../src/control/worker-restart-service.js";
import type {
  WorkerRestartOrchestrator,
  WorkerRestartOrchestrationRequest,
} from "../../src/control/restart-orchestrator.js";

function buildVisibilitySnapshot(): RuntimeVisibilitySnapshot {
  return {
    environment: "test",
    worker: {
      workerId: "worker-restart-test",
      lastHeartbeatAt: "2026-03-27T12:00:00.000Z",
      lastCycleAt: "2026-03-27T11:59:30.000Z",
      lastSeenReloadNonce: 0,
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
        cycleCount: 2,
        decisionCount: 2,
        executionCount: 1,
        blockedCount: 1,
        errorCount: 0,
      },
      lastCycleAt: "2026-03-27T11:59:30.000Z",
      lastDecisionAt: "2026-03-27T11:59:30.000Z",
      lastState: {
        stage: "risk",
        traceId: "trace-restart",
        timestamp: "2026-03-27T11:59:30.000Z",
        blocked: false,
      },
      degradedState: {
        active: false,
        consecutiveCycles: 0,
        recoveryCount: 1,
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
      cycleCount: 2,
      decisionCount: 2,
      executionCount: 1,
      blockedCount: 1,
      errorCount: 0,
      lastCycleAtEpochMs: Date.parse("2026-03-27T11:59:30.000Z"),
      lastDecisionAtEpochMs: Date.parse("2026-03-27T11:59:30.000Z"),
    },
  };
}

function createOrchestrator(options: {
  configured?: boolean;
  accepted?: boolean;
  method?: "deploy_hook" | "render_api";
  requestImpl?: (input: WorkerRestartOrchestrationRequest) => Promise<any>;
} = {}): WorkerRestartOrchestrator & { calls: Array<Parameters<WorkerRestartOrchestrator["requestRestart"]>[0]> } {
  const calls: Array<Parameters<WorkerRestartOrchestrator["requestRestart"]>[0]> = [];
  return {
    calls,
    configured: options.configured ?? true,
    method: options.method ?? "deploy_hook",
    targetService: "bobbyexecute-runtime-staging",
    describe() {
      return {
        configured: this.configured,
        method: this.method,
        targetService: this.targetService,
        targetWorker: "bobbyexecute-runtime-staging",
      };
    },
    async requestRestart(input) {
      calls.push(input);
      if (options.requestImpl) {
        return options.requestImpl(input);
      }
      return {
        accepted: options.accepted ?? true,
        method: this.method,
        targetService: this.targetService ?? input.targetService,
        providerStatusCode: options.accepted === false ? 502 : 202,
        providerRequestId: "provider-request-123",
        providerMessage: options.accepted === false ? "deploy hook rejected" : "deploy hook accepted",
      };
    },
  };
}

async function createHarness(options: {
  orchestrator?: WorkerRestartOrchestrator & { calls: Array<Parameters<WorkerRestartOrchestrator["requestRestart"]>[0]> };
  cooldownMs?: number;
} = {}) {
  const { manager } = await createRuntimeConfigTestManager();
  const visibilityRepository = await createRuntimeVisibilityRepository();
  await visibilityRepository.save(buildVisibilitySnapshot());
  const restartRepository = new InMemoryWorkerRestartRepository();
  const orchestrator = options.orchestrator ?? createOrchestrator();
  const service = new WorkerRestartService({
    runtimeConfigManager: manager,
    runtimeVisibilityRepository: visibilityRepository,
    restartRepository,
    environment: "test",
    workerServiceName: "bobbyexecute-runtime-staging",
    orchestrator,
    cooldownMs: options.cooldownMs,
    convergenceTimeoutMs: 60_000,
  });

  return {
    manager,
    visibilityRepository,
    restartRepository,
    orchestrator,
    service,
  };
}

describe("worker restart service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects restart requests when no restart is required", async () => {
    const harness = await createHarness();
    const response = await harness.service.requestRestart({
      actor: "operator",
      reason: "no-op restart",
      idempotencyKey: "restart-noop",
    });

    expect(response.accepted).toBe(false);
    expect(response.statusCode).toBe(409);
    expect(response.restart.required).toBe(false);
    expect(response.restart.requested).toBe(false);
    expect(harness.orchestrator.calls).toHaveLength(0);
  });

  it("accepts a justified restart and leaves the restart pending until worker convergence", async () => {
    const harness = await createHarness();
    await harness.manager.setMode("paper", {
      actor: "operator",
      reason: "paper promotion",
    });

    const first = await harness.service.requestRestart({
      actor: "operator",
      reason: "paper promotion",
      idempotencyKey: "restart-1",
    });

    expect(first.accepted).toBe(true);
    expect(first.statusCode).toBe(202);
    expect(first.restart.required).toBe(true);
    expect(first.restart.requested).toBe(true);
    expect(first.restart.inProgress).toBe(true);
    expect(first.restart.pendingVersionId).toBe(first.runtimeConfig.requestedVersionId);
    expect(first.restart.lastOutcome).toBe("dispatched");
    expect(harness.orchestrator.calls).toHaveLength(1);

    const snapshot = await harness.service.readSnapshot();
    expect(snapshot.restart).toMatchObject({
      required: true,
      requested: true,
      inProgress: true,
      pendingVersionId: first.runtimeConfig.requestedVersionId,
      lastOutcome: "dispatched",
    });

    const second = await harness.service.requestRestart({
      actor: "operator",
      reason: "duplicate request",
      idempotencyKey: "restart-1",
    });

    expect(second.accepted).toBe(true);
    expect(second.statusCode).toBe(202);
    expect(harness.orchestrator.calls).toHaveLength(1);
  });

  it("rejects restart requests when orchestration is disabled", async () => {
    const harness = await createHarness({
      orchestrator: createOrchestrator({ configured: false }),
    });
    await harness.manager.setMode("paper", {
      actor: "operator",
      reason: "paper promotion",
    });

    const response = await harness.service.requestRestart({
      actor: "operator",
      reason: "paper promotion",
      idempotencyKey: "restart-disabled",
    });

    expect(response.accepted).toBe(false);
    expect(response.statusCode).toBe(503);
    expect(response.restart.lastOutcome).toBe("unconfigured");
    expect(response.message).toContain("not configured");
    expect(harness.orchestrator.calls).toHaveLength(0);
  });

  it("rate limits repeat restart attempts after a terminal failure", async () => {
    const harness = await createHarness({ cooldownMs: 60 * 60 * 1000 });
    await harness.manager.setMode("paper", {
      actor: "operator",
      reason: "paper promotion",
    });

    const status = harness.manager.getRuntimeConfigStatus();
    const requestedAt = new Date(Date.now() - 30_000).toISOString();
    const failedRecord: WorkerRestartRequestRecord = {
      id: "restart-failed-1",
      environment: "test",
      actor: "operator",
      reason: "prior failure",
      targetVersionId: status.requestedVersionId,
      targetService: "bobbyexecute-runtime-staging",
      targetWorker: "bobbyexecute-runtime-staging",
      method: "deploy_hook",
      status: "failed",
      accepted: false,
      restartRequired: true,
      restartRequiredReason: "runtime config change requires restart",
      requestedAt,
      updatedAt: requestedAt,
      rejectionReason: "previous restart failed",
      failureReason: "previous restart failed",
    };
    await harness.restartRepository.save(failedRecord);

    const response = await harness.service.requestRestart({
      actor: "operator",
      reason: "retry restart",
      idempotencyKey: "restart-rate-limit",
    });

    expect(response.accepted).toBe(false);
    expect(response.statusCode).toBe(429);
    expect(response.restart.lastOutcome).toBe("cooldown");
    expect(response.message).toContain("rate-limited");
    expect(harness.orchestrator.calls).toHaveLength(0);
  });

  it("converts orchestration rejection into a failed restart request", async () => {
    const harness = await createHarness({
      orchestrator: createOrchestrator({
        requestImpl: async () => ({
          accepted: false,
          method: "deploy_hook",
          targetService: "bobbyexecute-runtime-staging",
          providerStatusCode: 502,
          providerMessage: "deploy hook rejected",
        }),
      }),
    });
    await harness.manager.setMode("paper", {
      actor: "operator",
      reason: "paper promotion",
    });

    const response = await harness.service.requestRestart({
      actor: "operator",
      reason: "paper promotion",
      idempotencyKey: "restart-provider-failure",
    });

    expect(response.accepted).toBe(false);
    expect(response.statusCode).toBe(502);
    expect(response.restart.lastOutcome).toBe("failed");
    expect(response.restart.lastOutcomeReason).toContain("deploy hook rejected");
    expect(harness.orchestrator.calls).toHaveLength(1);
  });
});
