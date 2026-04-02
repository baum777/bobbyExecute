import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, createControlServer } from "../../src/server/index.js";
import { InMemoryControlGovernanceRepository } from "../../src/persistence/control-governance-repository.js";
import { createRuntimeVisibilityRepository, type RuntimeVisibilitySnapshot } from "../../src/persistence/runtime-visibility-repository.js";
import type { ControlRecoveryRehearsalEvidenceRecord } from "../../src/control/control-governance.js";
import {
  syncDatabaseRehearsalFreshnessState,
} from "../../src/control/control-governance.js";
import {
  DatabaseRehearsalFreshnessNotificationService,
  type DatabaseRehearsalFreshnessNotificationSink,
} from "../../src/control/database-rehearsal-notification-service.js";
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

function buildRehearsalEvidence(environment: string, executedAt: string): ControlRecoveryRehearsalEvidenceRecord {
  return {
    id: `rehearsal-${environment}-${executedAt}`,
    environment,
    rehearsalKind: "disposable_restore",
    status: "passed",
    executionSource: "automated",
    executionContext: {
      orchestration: "render_cron",
      provider: "render",
      serviceName: "bobbyexecute-rehearsal-staging",
      schedule: "0 3 * * *",
      trigger: "scheduled_refresh",
    },
    executedAt,
    recordedAt: executedAt,
    actorId: "render-rehearsal-refresh",
    actorDisplayName: "Render rehearsal refresh",
    actorRole: "admin",
    sessionId: `render:${executedAt}`,
    sourceContext: { label: "canonical-production", kind: "canonical" },
    targetContext: { label: "disposable-rehearsal", kind: "disposable" },
    sourceDatabaseFingerprint: "source-fingerprint",
    targetDatabaseFingerprint: "target-fingerprint",
    sourceSchemaStatus: {
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
    },
    targetSchemaStatusBefore: {
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
    },
    targetSchemaStatusAfter: {
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
    },
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
}

describe("visibility-backed read surfaces", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "read-surface-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it("surfaces the latest rehearsal freshness and execution source on control status", async () => {
    const visibilityRepository = await createRuntimeVisibilityRepository();
    await visibilityRepository.save(buildVisibilitySnapshot());
    const governanceRepository = new InMemoryControlGovernanceRepository();
    const { manager } = await createRuntimeConfigTestManager();
    const runtimeEnvironment = manager.getRuntimeConfigStatus().environment ?? "test";
    await governanceRepository.recordDatabaseRehearsalEvidence(
      buildRehearsalEvidence(
        runtimeEnvironment,
        new Date(Date.now() - 30 * 60 * 1000).toISOString()
      )
    );
    const server = await createControlServer({
      port: 0,
      host: "127.0.0.1",
      runtimeVisibilityRepository: visibilityRepository,
      runtimeEnvironment,
      runtimeConfigManager: manager,
      governanceRepository,
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
      expect(body.databaseRehearsal).toMatchObject({
        status: "fresh",
        latestEvidence: {
          executionSource: "automated",
          executionContext: {
            orchestration: "render_cron",
            provider: "render",
            serviceName: "bobbyexecute-rehearsal-staging",
          },
        },
      });
      expect(body.databaseRehearsalStatus).toMatchObject({
        freshnessStatus: "healthy",
        blockedByFreshness: false,
        hasOpenAlert: false,
        latestEvidenceExecutionSource: "automated",
        latestEvidenceStatus: "passed",
      });
    } finally {
      await server.close();
    }
  });

  it("surfaces rehearsal notification delivery details on control status", async () => {
    const visibilityRepository = await createRuntimeVisibilityRepository();
    await visibilityRepository.save(buildVisibilitySnapshot());
    const governanceRepository = new InMemoryControlGovernanceRepository();
    const { manager } = await createRuntimeConfigTestManager();
    const runtimeEnvironment = manager.getRuntimeConfigStatus().environment ?? "test";
    await governanceRepository.recordDatabaseRehearsalEvidence(
      buildRehearsalEvidence(
        runtimeEnvironment,
        new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString()
      )
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 202 })) as unknown as typeof fetch
    );

    const notificationService = new DatabaseRehearsalFreshnessNotificationService({
      environment: runtimeEnvironment,
      alertRepository: governanceRepository,
      sinks: [
        {
          kind: "structured_log",
          name: "structured-log",
          scope: "internal",
          configured: true,
          async notify() {
            return {
              status: "sent",
              reason: "structured log recorded",
            };
          },
        } satisfies DatabaseRehearsalFreshnessNotificationSink,
      ],
      destinations: [
        {
          slot: "primary",
          name: "primary",
          enabled: true,
          priority: 10,
          formatterProfile: "generic",
          url: "https://primary.example.test/webhook",
          required: true,
          recoveryEnabled: true,
          repeatedFailureSummaryEnabled: true,
          allowWarning: true,
          environmentScope: "all",
          tags: ["primary"],
        },
      ],
      notificationCooldownMs: 60_000,
      notificationTimeoutMs: 1_000,
      logger: console,
    });
    const staleStatus = await syncDatabaseRehearsalFreshnessState(governanceRepository, runtimeEnvironment, {
      nowMs: Date.parse("2026-03-27T12:00:00.000Z"),
    });
    await notificationService.dispatch({
      actor: "system",
      alert: staleStatus?.alert ?? expect.fail("missing stale freshness alert"),
      status: staleStatus ?? expect.fail("missing stale freshness status"),
    });
    vi.unstubAllGlobals();

    const server = await createControlServer({
      port: 0,
      host: "127.0.0.1",
      runtimeVisibilityRepository: visibilityRepository,
      runtimeEnvironment,
      runtimeConfigManager: manager,
      governanceRepository,
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
      expect(body.databaseRehearsalStatus).toMatchObject({
        freshnessStatus: "stale",
        blockedByFreshness: true,
        hasOpenAlert: true,
      });
    } finally {
      await server.close();
    }
  });
});
