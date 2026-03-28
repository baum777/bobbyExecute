import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ControlRecoveryRehearsalEvidenceRecord } from "../../src/control/control-governance.js";
import type { SchemaMigrationStatus } from "../../src/persistence/schema-migrations.js";
import type { ControlPlaneBackupSnapshot } from "../../src/recovery/control-plane-backup.js";

const mocks = vi.hoisted(() => ({
  inspectSchemaStatus: vi.fn(),
  migrateSchema: vi.fn(),
  captureControlPlaneBackup: vi.fn(),
  validateControlPlaneBackupRoundTrip: vi.fn(),
  recordDatabaseRehearsalEvidence: vi.fn(),
}));

vi.mock("../../src/persistence/schema-migrations.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/persistence/schema-migrations.js")>(
    "../../src/persistence/schema-migrations.js"
  );
  return {
    ...actual,
    inspectSchemaStatus: mocks.inspectSchemaStatus,
    migrateSchema: mocks.migrateSchema,
  };
});

vi.mock("../../src/recovery/control-plane-backup.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/recovery/control-plane-backup.js")>(
    "../../src/recovery/control-plane-backup.js"
  );
  return {
    ...actual,
    captureControlPlaneBackup: mocks.captureControlPlaneBackup,
    validateControlPlaneBackupRoundTrip: mocks.validateControlPlaneBackupRoundTrip,
  };
});

const readyStatus: SchemaMigrationStatus = {
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

const migratableStatus: SchemaMigrationStatus = {
  state: "missing_but_migratable",
  ready: false,
  migrationTablePresent: false,
  message: "schema_migrations table is missing.",
  migrationsDir: "migrations",
  availableMigrations: [],
  appliedMigrations: [],
  pendingMigrations: [],
  checksumMismatches: [],
  unknownAppliedVersions: [],
};

function buildSnapshot(environment: string, capturedAt: string): ControlPlaneBackupSnapshot {
  return {
    capturedAt,
    environment,
    schemaStatus: readyStatus,
    runtimeConfig: {
      active: null,
      versions: [],
      changeLog: [],
    },
    runtimeVisibility: null,
    workerRestarts: [],
    restartAlerts: {
      alerts: [],
      events: [],
    },
    governance: {
      audits: [],
      livePromotions: [],
    },
  };
}

function buildSummary(environment: string, capturedAt: string, schemaState: string) {
  return {
    environment,
    capturedAt,
    schemaState,
    counts: {} as Record<string, number>,
    totalRecords: 0,
  };
}

describe("disposable database rehearsal", () => {
  beforeEach(() => {
    mocks.inspectSchemaStatus.mockReset();
    mocks.migrateSchema.mockReset();
    mocks.captureControlPlaneBackup.mockReset();
    mocks.validateControlPlaneBackupRoundTrip.mockReset();
    mocks.recordDatabaseRehearsalEvidence.mockReset();
  });

  it("runs the expected sequence and persists a passed rehearsal", async () => {
    const order: string[] = [];
    let targetReady = false;
    const sourceConnection = { name: "source" };
    const targetConnection = { name: "target" };
    const sourceSnapshot = buildSnapshot("test", "2026-03-28T00:00:00.000Z");
    const sourceSummary = buildSummary("test", sourceSnapshot.capturedAt, "ready");
    const targetSummary = buildSummary("test", "2026-03-28T00:01:00.000Z", "ready");

    mocks.inspectSchemaStatus.mockImplementation(async (connection: { name?: string }) => {
      if (connection.name === "source") {
        order.push("inspect:source");
        return readyStatus;
      }
      order.push(targetReady ? "inspect:target:after" : "inspect:target:before");
      return targetReady ? readyStatus : migratableStatus;
    });
    mocks.migrateSchema.mockImplementation(async () => {
      order.push("migrate:target");
      targetReady = true;
      return readyStatus;
    });
    mocks.captureControlPlaneBackup.mockImplementation(async (connection: { name?: string }) => {
      if (connection.name === "source") {
        order.push("capture:source");
        return sourceSnapshot;
      }
      order.push("capture:target");
      return buildSnapshot("test", "2026-03-28T00:02:00.000Z");
    });
    mocks.validateControlPlaneBackupRoundTrip.mockImplementation(async () => {
      order.push("validate");
      return {
        before: sourceSummary,
        after: targetSummary,
        matched: true,
      };
    });
    mocks.recordDatabaseRehearsalEvidence.mockImplementation(async (evidence: ControlRecoveryRehearsalEvidenceRecord) => {
      order.push(`persist:${evidence.status}`);
    });

    const { runDisposableDatabaseRehearsal } = await import("../../src/recovery/disposable-db-rehearsal.js");
    const result = await runDisposableDatabaseRehearsal({
      environment: "test",
      sourceConnection: sourceConnection as never,
      targetConnection: targetConnection as never,
      evidenceRepository: {
        ensureSchema: async () => undefined,
        recordAuditEvent: async () => undefined,
        recordDatabaseRehearsalEvidence: mocks.recordDatabaseRehearsalEvidence,
        loadLatestDatabaseRehearsalEvidence: async () => null,
        saveLivePromotionRequest: async () => undefined,
        loadLivePromotionRequest: async () => null,
        listLivePromotionRequests: async () => [],
        listAuditEvents: async () => [],
      },
      sourceContext: { label: "canonical-production", kind: "canonical" },
      targetContext: { label: "disposable-target", kind: "disposable" },
      actor: {
        actorId: "rehearsal-runner",
        displayName: "Rehearsal Runner",
        role: "admin",
        sessionId: "session-1",
      },
      sourceDatabaseUrl: "postgres://source-db",
      targetDatabaseUrl: "postgres://target-db",
      migrationsDir: "migrations",
      executionSource: "automated",
      executionContext: {
        orchestration: "render_cron",
        provider: "render",
        serviceName: "bobbyexecute-rehearsal-test",
        schedule: "0 3 * * *",
        trigger: "scheduled_refresh",
      },
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("passed");
    expect(result.evidenceStored).toBe(true);
    expect(result.summary).toContain("passed");
    expect(mocks.recordDatabaseRehearsalEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        executionSource: "automated",
        executionContext: expect.objectContaining({
          orchestration: "render_cron",
          provider: "render",
        }),
      })
    );
    expect(order).toEqual([
      "inspect:source",
      "inspect:target:before",
      "migrate:target",
      "inspect:target:after",
      "capture:source",
      "capture:target",
      "validate",
      "persist:passed",
    ]);
  });

  it("records a failed rehearsal when validation does not match", async () => {
    const sourceConnection = { name: "source" };
    const targetConnection = { name: "target" };
    const sourceSnapshot = buildSnapshot("test", "2026-03-28T00:00:00.000Z");
    const sourceSummary = buildSummary("test", sourceSnapshot.capturedAt, "ready");
    const targetSummary = buildSummary("test", "2026-03-28T00:01:00.000Z", "ready");

    mocks.inspectSchemaStatus.mockResolvedValue(readyStatus);
    mocks.captureControlPlaneBackup.mockImplementation(async (connection: { name?: string }) => {
      return connection.name === "source" ? sourceSnapshot : buildSnapshot("test", "2026-03-28T00:02:00.000Z");
    });
    mocks.validateControlPlaneBackupRoundTrip.mockResolvedValue({
      before: sourceSummary,
      after: targetSummary,
      matched: false,
    });

    const { runDisposableDatabaseRehearsal } = await import("../../src/recovery/disposable-db-rehearsal.js");
    const result = await runDisposableDatabaseRehearsal({
      environment: "test",
      sourceConnection: sourceConnection as never,
      targetConnection: targetConnection as never,
      evidenceRepository: {
        ensureSchema: async () => undefined,
        recordAuditEvent: async () => undefined,
        recordDatabaseRehearsalEvidence: mocks.recordDatabaseRehearsalEvidence,
        loadLatestDatabaseRehearsalEvidence: async () => null,
        saveLivePromotionRequest: async () => undefined,
        loadLivePromotionRequest: async () => null,
        listLivePromotionRequests: async () => [],
        listAuditEvents: async () => [],
      },
      sourceContext: { label: "canonical-production", kind: "canonical" },
      targetContext: { label: "disposable-target", kind: "disposable" },
      actor: {
        actorId: "rehearsal-runner",
        displayName: "Rehearsal Runner",
        role: "admin",
        sessionId: "session-1",
      },
      sourceDatabaseUrl: "postgres://source-db",
      targetDatabaseUrl: "postgres://target-db",
      migrationsDir: "migrations",
      executionSource: "automated",
      executionContext: {
        orchestration: "render_cron",
        provider: "render",
        serviceName: "bobbyexecute-rehearsal-test",
        schedule: "0 3 * * *",
        trigger: "scheduled_refresh",
      },
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.evidenceStored).toBe(true);
    expect(result.failureReason).toContain("restore validation counts did not match");
    expect(mocks.recordDatabaseRehearsalEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        failureReason: expect.stringContaining("restore validation counts did not match"),
      })
    );
  });

  it("treats evidence persistence failure as a failed rehearsal", async () => {
    const sourceConnection = { name: "source" };
    const targetConnection = { name: "target" };
    const sourceSnapshot = buildSnapshot("test", "2026-03-28T00:00:00.000Z");

    mocks.inspectSchemaStatus.mockResolvedValue(readyStatus);
    mocks.captureControlPlaneBackup.mockResolvedValue(sourceSnapshot);
    mocks.validateControlPlaneBackupRoundTrip.mockResolvedValue({
      before: buildSummary("test", sourceSnapshot.capturedAt, "ready"),
      after: buildSummary("test", "2026-03-28T00:01:00.000Z", "ready"),
      matched: true,
    });
    mocks.recordDatabaseRehearsalEvidence.mockRejectedValue(new Error("write failed"));

    const { runDisposableDatabaseRehearsal } = await import("../../src/recovery/disposable-db-rehearsal.js");
    const result = await runDisposableDatabaseRehearsal({
      environment: "test",
      sourceConnection: sourceConnection as never,
      targetConnection: targetConnection as never,
      evidenceRepository: {
        ensureSchema: async () => undefined,
        recordAuditEvent: async () => undefined,
        recordDatabaseRehearsalEvidence: mocks.recordDatabaseRehearsalEvidence,
        loadLatestDatabaseRehearsalEvidence: async () => null,
        saveLivePromotionRequest: async () => undefined,
        loadLivePromotionRequest: async () => null,
        listLivePromotionRequests: async () => [],
        listAuditEvents: async () => [],
      },
      sourceContext: { label: "canonical-production", kind: "canonical" },
      targetContext: { label: "disposable-target", kind: "disposable" },
      actor: {
        actorId: "rehearsal-runner",
        displayName: "Rehearsal Runner",
        role: "admin",
        sessionId: "session-1",
      },
      sourceDatabaseUrl: "postgres://source-db",
      targetDatabaseUrl: "postgres://target-db",
      migrationsDir: "migrations",
      executionSource: "automated",
      executionContext: {
        orchestration: "render_cron",
        provider: "render",
        serviceName: "bobbyexecute-rehearsal-test",
        schedule: "0 3 * * *",
        trigger: "scheduled_refresh",
      },
    });

    expect(result.success).toBe(false);
    expect(result.evidenceStored).toBe(false);
    expect(result.failureReason).toContain("evidence persistence failed");
  });

  it("rejects identical source and target database URLs", async () => {
    const { runDisposableDatabaseRehearsal } = await import("../../src/recovery/disposable-db-rehearsal.js");

    await expect(
      runDisposableDatabaseRehearsal({
        environment: "test",
        sourceConnection: { name: "source" } as never,
        targetConnection: { name: "target" } as never,
        evidenceRepository: {
          ensureSchema: async () => undefined,
          recordAuditEvent: async () => undefined,
          recordDatabaseRehearsalEvidence: mocks.recordDatabaseRehearsalEvidence,
          loadLatestDatabaseRehearsalEvidence: async () => null,
          saveLivePromotionRequest: async () => undefined,
          loadLivePromotionRequest: async () => null,
          listLivePromotionRequests: async () => [],
          listAuditEvents: async () => [],
        },
        sourceContext: { label: "canonical-production", kind: "canonical" },
        targetContext: { label: "disposable-target", kind: "disposable" },
        actor: {
          actorId: "rehearsal-runner",
          displayName: "Rehearsal Runner",
          role: "admin",
          sessionId: "session-1",
        },
        sourceDatabaseUrl: "postgres://same-db",
        targetDatabaseUrl: "postgres://same-db",
        migrationsDir: "migrations",
        executionSource: "automated",
        executionContext: {
          orchestration: "render_cron",
          provider: "render",
          serviceName: "bobbyexecute-rehearsal-test",
          schedule: "0 3 * * *",
          trigger: "scheduled_refresh",
        },
      })
    ).rejects.toThrow(/identical/);
  });
});
