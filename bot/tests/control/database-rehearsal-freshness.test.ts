import { describe, expect, it } from "vitest";
import type { ControlRecoveryRehearsalEvidenceRecord } from "../../src/control/control-governance.js";
import {
  buildDatabaseRehearsalFreshnessStatus,
  evaluateDatabaseRehearsalGate,
  syncDatabaseRehearsalFreshnessState,
} from "../../src/control/control-governance.js";
import { InMemoryControlGovernanceRepository } from "../../src/persistence/control-governance-repository.js";
import type { SchemaMigrationStatus } from "../../src/persistence/schema-migrations.js";

function buildReadySchemaStatus(): SchemaMigrationStatus {
  return {
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
}

function buildEvidence(
  environment: string,
  executedAt: string,
  input: {
    status?: ControlRecoveryRehearsalEvidenceRecord["status"];
    executionSource?: ControlRecoveryRehearsalEvidenceRecord["executionSource"];
  } = {}
): ControlRecoveryRehearsalEvidenceRecord {
  const source = input.executionSource ?? "automated";
  const status = input.status ?? "passed";
  return {
    id: `rehearsal-${environment}-${executedAt}-${source}-${status}`,
    environment,
    rehearsalKind: "disposable_restore",
    status,
    executionSource: source,
    executionContext: {
      orchestration: source === "automated" ? "render_cron" : "manual_cli",
      provider: source === "automated" ? "render" : undefined,
      serviceName: source === "automated" ? "bobbyexecute-rehearsal-refresh" : undefined,
      schedule: source === "automated" ? "0 3 * * *" : undefined,
      trigger: source === "automated" ? "scheduled_refresh" : "manual_refresh",
    },
    executedAt,
    recordedAt: executedAt,
    actorId: source === "automated" ? "render-rehearsal-refresh" : "operator",
    actorDisplayName: source === "automated" ? "Render rehearsal refresh" : "Operator",
    actorRole: "admin",
    sessionId: `${source}:${executedAt}`,
    sourceContext: { label: "canonical-production", kind: "canonical" },
    targetContext: { label: "disposable-rehearsal", kind: "disposable" },
    sourceDatabaseFingerprint: "source-fingerprint",
    targetDatabaseFingerprint: "target-fingerprint",
    sourceSchemaStatus: buildReadySchemaStatus(),
    targetSchemaStatusBefore: buildReadySchemaStatus(),
    targetSchemaStatusAfter: buildReadySchemaStatus(),
    restoreValidation: {
      matched: status === "passed",
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
    summary: `${source} rehearsal ${status}`,
    failureReason: status === "failed" ? "simulated failure" : undefined,
  };
}

describe("database rehearsal freshness", () => {
  it("marks fresh automated evidence as healthy", async () => {
    const repository = new InMemoryControlGovernanceRepository();
    const environment = "test";
    const executedAt = "2026-03-27T11:58:00.000Z";
    await repository.recordDatabaseRehearsalEvidence(buildEvidence(environment, executedAt));

    const current = buildDatabaseRehearsalFreshnessStatus(await repository.listDatabaseRehearsalEvidence(environment), {
      environment,
      nowMs: Date.parse("2026-03-27T12:00:00.000Z"),
    });

    expect(current.freshnessStatus).toBe("healthy");
    expect(current.blockedByFreshness).toBe(false);
    expect(current.manualFallbackActive).toBe(false);
    expect(current.automationHealth).toBe("healthy");
    expect(current.alert?.status).toBe("resolved");
    expect(evaluateDatabaseRehearsalGate(current.latestEvidence, { targetMode: "live" })?.status).toBe("fresh");
  });

  it("marks manual fallback evidence as warning and keeps freshness aligned", async () => {
    const repository = new InMemoryControlGovernanceRepository();
    const environment = "test";
    await repository.recordDatabaseRehearsalEvidence(
      buildEvidence(environment, "2026-03-27T09:00:00.000Z", { status: "failed", executionSource: "automated" })
    );
    await repository.recordDatabaseRehearsalEvidence(
      buildEvidence(environment, "2026-03-27T11:30:00.000Z", { status: "passed", executionSource: "manual" })
    );

    const current = buildDatabaseRehearsalFreshnessStatus(await repository.listDatabaseRehearsalEvidence(environment), {
      environment,
      nowMs: Date.parse("2026-03-27T12:00:00.000Z"),
    });

    expect(current.freshnessStatus).toBe("warning");
    expect(current.manualFallbackActive).toBe(true);
    expect(current.automationHealth).toBe("degraded");
    expect(current.reasonCode).toBe("automated_rehearsal_missing");
    expect(evaluateDatabaseRehearsalGate(current.latestEvidence, { targetMode: "live" })?.status).toBe("fresh");
  });

  it("opens and persists stale and failed alert states", async () => {
    const staleRepository = new InMemoryControlGovernanceRepository();
    const staleEnvironment = "stale";
    await staleRepository.recordDatabaseRehearsalEvidence(
      buildEvidence(staleEnvironment, "2026-03-19T12:00:00.000Z")
    );

    const staleStatus = await syncDatabaseRehearsalFreshnessState(staleRepository, staleEnvironment, {
      nowMs: Date.parse("2026-03-27T12:00:00.000Z"),
    });
    expect(staleStatus?.freshnessStatus).toBe("stale");
    expect(staleStatus?.hasOpenAlert).toBe(true);
    expect((await staleRepository.loadDatabaseRehearsalFreshnessAlert(staleEnvironment))?.status).toBe("open");

    const failedRepository = new InMemoryControlGovernanceRepository();
    const failedEnvironment = "failed";
    await failedRepository.recordDatabaseRehearsalEvidence(
      buildEvidence(failedEnvironment, "2026-03-27T11:40:00.000Z", { status: "failed", executionSource: "automated" })
    );
    await failedRepository.recordDatabaseRehearsalEvidence(
      buildEvidence(failedEnvironment, "2026-03-27T11:20:00.000Z", { status: "failed", executionSource: "automated" })
    );
    await failedRepository.recordDatabaseRehearsalEvidence(
      buildEvidence(failedEnvironment, "2026-03-27T10:50:00.000Z", { status: "passed", executionSource: "automated" })
    );

    const failedStatus = await syncDatabaseRehearsalFreshnessState(failedRepository, failedEnvironment, {
      nowMs: Date.parse("2026-03-27T12:00:00.000Z"),
    });
    expect(failedStatus?.freshnessStatus).toBe("failed");
    expect(failedStatus?.reasonCode).toBe("automated_rehearsal_repeated_failure");
    expect(failedStatus?.automationHealth).toBe("unhealthy");
    expect(failedStatus?.hasOpenAlert).toBe(true);
    expect((await failedRepository.loadDatabaseRehearsalFreshnessAlert(failedEnvironment))?.severity).toBe("critical");
  });

  it("resolves an existing alert when fresh evidence returns", async () => {
    const repository = new InMemoryControlGovernanceRepository();
    const environment = "recovery";
    await repository.recordDatabaseRehearsalEvidence(
      buildEvidence(environment, "2026-03-19T12:00:00.000Z")
    );

    const initial = await syncDatabaseRehearsalFreshnessState(repository, environment, {
      nowMs: Date.parse("2026-03-27T12:00:00.000Z"),
    });
    expect(initial?.hasOpenAlert).toBe(true);

    await repository.recordDatabaseRehearsalEvidence(
      buildEvidence(environment, "2026-03-27T11:58:00.000Z")
    );

    const recovered = await syncDatabaseRehearsalFreshnessState(repository, environment, {
      nowMs: Date.parse("2026-03-27T12:00:00.000Z"),
    });

    expect(recovered?.freshnessStatus).toBe("healthy");
    expect(recovered?.hasOpenAlert).toBe(false);
    expect((await repository.loadDatabaseRehearsalFreshnessAlert(environment))?.status).toBe("resolved");
    expect((await repository.listDatabaseRehearsalFreshnessAlertEvents(environment, 10))).toHaveLength(2);
  });
});
