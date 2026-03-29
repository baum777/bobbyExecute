import { afterEach, describe, expect, it, vi } from "vitest";
import type { ControlRecoveryRehearsalEvidenceRecord, ControlRecoveryRehearsalOperationalStatus } from "../../src/control/control-governance.js";
import {
  syncDatabaseRehearsalFreshnessState,
} from "../../src/control/control-governance.js";
import {
  DatabaseRehearsalFreshnessNotificationService,
  type DatabaseRehearsalFreshnessNotificationSink,
  type DatabaseRehearsalFreshnessNotificationServiceOptions,
} from "../../src/control/database-rehearsal-notification-service.js";
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
      countsMatched: status === "passed",
      contentMatched: status === "passed",
      status: status === "passed" ? "exact_match" : "content_mismatch",
      mismatchTables: status === "passed" ? [] : ["runtime_config_versions"],
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
    summary: `${source} rehearsal ${status}`,
    failureReason: status === "failed" ? "simulated failure" : undefined,
  };
}

function buildDestination(overrides: {
  name: string;
  slot?: "primary" | "secondary" | "staging";
  priority?: number;
  formatterProfile?: "generic" | "slack";
  allowWarning?: boolean;
  recoveryEnabled?: boolean;
  repeatedFailureSummaryEnabled?: boolean;
}): NonNullable<DatabaseRehearsalFreshnessNotificationServiceOptions["destinations"]>[number] {
  return {
    slot: overrides.slot ?? "primary",
    name: overrides.name,
    enabled: true,
    priority: overrides.priority ?? 10,
    formatterProfile: overrides.formatterProfile ?? "generic",
    url: `https://${overrides.name}.example.test/webhook`,
    token: undefined,
    headerName: undefined,
    cooldownMs: 60_000,
    required: true,
    recoveryEnabled: overrides.recoveryEnabled ?? true,
    repeatedFailureSummaryEnabled: overrides.repeatedFailureSummaryEnabled ?? true,
    allowWarning: overrides.allowWarning ?? false,
    environmentScope: "all",
    tags: [overrides.name],
  };
}

function buildInternalSink(): DatabaseRehearsalFreshnessNotificationSink {
  return {
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
  };
}

async function createHarness() {
  const alertRepository = new InMemoryControlGovernanceRepository();
  const notify = vi.fn(async () => new Response("ok", { status: 202 }));
  vi.stubGlobal("fetch", notify as unknown as typeof fetch);

  const service = new DatabaseRehearsalFreshnessNotificationService({
    environment: "test",
    alertRepository,
    sinks: [buildInternalSink()],
    destinations: [
      buildDestination({
        name: "primary",
        slot: "primary",
        priority: 10,
        allowWarning: true,
        recoveryEnabled: true,
        repeatedFailureSummaryEnabled: true,
      }),
      buildDestination({
        name: "secondary",
        slot: "secondary",
        priority: 20,
        formatterProfile: "slack",
        allowWarning: false,
        recoveryEnabled: true,
        repeatedFailureSummaryEnabled: true,
      }),
    ],
    notificationCooldownMs: 60_000,
    notificationTimeoutMs: 1_000,
    logger: console,
  });

  return { alertRepository, service, notify };
}

async function syncStatus(
  alertRepository: InMemoryControlGovernanceRepository,
  environment: string,
  nowMs: number
): Promise<ControlRecoveryRehearsalOperationalStatus | undefined> {
  return syncDatabaseRehearsalFreshnessState(alertRepository, environment, { nowMs });
}

describe("database rehearsal freshness notification service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("notifies when stale freshness opens", async () => {
    const { alertRepository, service, notify } = await createHarness();
    const environment = "stale";
    await alertRepository.recordDatabaseRehearsalEvidence(buildEvidence(environment, "2026-03-19T12:00:00.000Z"));

    const status = await syncStatus(alertRepository, environment, Date.parse("2026-03-27T12:00:00.000Z"));
    expect(status?.freshnessStatus).toBe("stale");
    expect(status?.alert?.status).toBe("open");

    const result = await service.dispatch({
      actor: "system",
      alert: status?.alert ?? expect.fail("missing stale freshness alert"),
      status: status ?? expect.fail("missing stale freshness status"),
    });

    expect(result?.notification.externallyNotified).toBe(true);
    expect(result?.notification.latestDeliveryStatus).toBe("sent");
    expect(notify).toHaveBeenCalledTimes(2);

    const saved = await alertRepository.loadDatabaseRehearsalFreshnessAlert(environment);
    expect(saved?.notification?.externallyNotified).toBe(true);
    expect(saved?.notification?.eventType).toBe("freshness_stale_opened");
    expect(saved?.notification?.latestDeliveryStatus).toBe("sent");
    expect(saved?.notification?.destinations[0]?.latestDeliveryStatus).toBe("sent");
  });

  it("keeps warning freshness local-only", async () => {
    const { alertRepository, service, notify } = await createHarness();
    const environment = "warning";
    await alertRepository.recordDatabaseRehearsalEvidence(buildEvidence(environment, "2026-03-21T12:00:00.000Z"));

    const status = await syncStatus(alertRepository, environment, Date.parse("2026-03-27T12:00:00.000Z"));
    expect(status?.freshnessStatus).toBe("warning");
    expect(status?.manualFallbackActive).toBe(false);

    const result = await service.dispatch({
      actor: "system",
      alert: status?.alert ?? expect.fail("missing warning freshness alert"),
      status: status ?? expect.fail("missing warning freshness status"),
    });

    expect(result).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
    expect((await alertRepository.listDatabaseRehearsalFreshnessAlertEvents(environment, 10)).some((event) => event.notificationScope === "external")).toBe(false);
  });

  it("notifies when repeated automated failures escalate", async () => {
    const { alertRepository, service, notify } = await createHarness();
    const environment = "failed";
    await alertRepository.recordDatabaseRehearsalEvidence(
      buildEvidence(environment, "2026-03-27T10:50:00.000Z", { status: "passed" })
    );
    await alertRepository.recordDatabaseRehearsalEvidence(
      buildEvidence(environment, "2026-03-27T11:20:00.000Z", { status: "failed" })
    );
    await alertRepository.recordDatabaseRehearsalEvidence(
      buildEvidence(environment, "2026-03-27T11:40:00.000Z", { status: "failed" })
    );

    const status = await syncStatus(alertRepository, environment, Date.parse("2026-03-27T12:00:00.000Z"));
    expect(status?.freshnessStatus).toBe("failed");
    expect(status?.alert?.severity).toBe("critical");

    const result = await service.dispatch({
      actor: "system",
      alert: status?.alert ?? expect.fail("missing failed freshness alert"),
      status: status ?? expect.fail("missing failed freshness status"),
    });

    expect(result?.notification.eventType).toBe("freshness_repeated_failure");
    expect(result?.notification.latestDeliveryStatus).toBe("sent");
    expect(notify).toHaveBeenCalledTimes(2);

    const events = await alertRepository.listDatabaseRehearsalFreshnessAlertEvents(environment, 10);
    expect(events.some((event) => event.notificationEventType === "freshness_repeated_failure" && event.notificationStatus === "sent")).toBe(true);
  });

  it("suppresses repeated sends during cooldown", async () => {
    const { alertRepository, service, notify } = await createHarness();
    const environment = "cooldown";
    await alertRepository.recordDatabaseRehearsalEvidence(buildEvidence(environment, "2026-03-19T12:00:00.000Z"));

    const status = await syncStatus(alertRepository, environment, Date.parse("2026-03-27T12:00:00.000Z"));
    const first = await service.dispatch({
      actor: "system",
      alert: status?.alert ?? expect.fail("missing stale freshness alert"),
      status: status ?? expect.fail("missing stale freshness status"),
    });
    expect(first?.notification.latestDeliveryStatus).toBe("sent");

    const secondStatus = await syncStatus(alertRepository, environment, Date.parse("2026-03-27T12:00:30.000Z"));
    const second = await service.dispatch({
      actor: "system",
      alert: secondStatus?.alert ?? expect.fail("missing stale freshness alert"),
      status: secondStatus ?? expect.fail("missing stale freshness status"),
    });

    expect(second?.notification.latestDeliveryStatus).toBe("suppressed");
    expect(notify).toHaveBeenCalledTimes(2);
    expect((await alertRepository.listDatabaseRehearsalFreshnessAlertEvents(environment, 20)).some((event) => event.notificationStatus === "suppressed")).toBe(true);
  });

  it("sends a recovery notification after a notified degradation resolves", async () => {
    const { alertRepository, service, notify } = await createHarness();
    const environment = "recovery";
    await alertRepository.recordDatabaseRehearsalEvidence(buildEvidence(environment, "2026-03-19T12:00:00.000Z"));

    const staleStatus = await syncStatus(alertRepository, environment, Date.parse("2026-03-27T12:00:00.000Z"));
    const staleResult = await service.dispatch({
      actor: "system",
      alert: staleStatus?.alert ?? expect.fail("missing stale freshness alert"),
      status: staleStatus ?? expect.fail("missing stale freshness status"),
    });
    expect(staleResult?.notification.externallyNotified).toBe(true);

    await alertRepository.recordDatabaseRehearsalEvidence(buildEvidence(environment, "2026-03-27T11:58:00.000Z"));
    const recoveredStatus = await syncStatus(alertRepository, environment, Date.parse("2026-03-27T12:00:00.000Z"));
    expect(recoveredStatus?.freshnessStatus).toBe("healthy");
    expect(recoveredStatus?.alert?.status).toBe("resolved");
    expect(recoveredStatus?.alert?.notification?.externallyNotified).toBe(true);

    const recoveredResult = await service.dispatch({
      actor: "system",
      alert: recoveredStatus?.alert ?? expect.fail("missing recovered freshness alert"),
      status: recoveredStatus ?? expect.fail("missing recovered freshness status"),
    });

    expect(recoveredResult?.notification.recoveryNotificationSent).toBe(true);
    expect(recoveredResult?.notification.eventType).toBe("freshness_recovered");
    expect(notify).toHaveBeenCalledTimes(4);
  });

  it("keeps canonical freshness state intact when delivery fails", async () => {
    const alertRepository = new InMemoryControlGovernanceRepository();
    const notify = vi.fn(async () => new Response("provider unavailable", { status: 503 }));
    vi.stubGlobal("fetch", notify as unknown as typeof fetch);
    const service = new DatabaseRehearsalFreshnessNotificationService({
      environment: "test",
      alertRepository,
      sinks: [buildInternalSink()],
      destinations: [
        buildDestination({
          name: "primary",
          slot: "primary",
          allowWarning: true,
          recoveryEnabled: true,
          repeatedFailureSummaryEnabled: true,
        }),
      ],
      notificationCooldownMs: 60_000,
      notificationTimeoutMs: 1_000,
      logger: console,
    });

    const environment = "delivery-failed";
    await alertRepository.recordDatabaseRehearsalEvidence(buildEvidence(environment, "2026-03-19T12:00:00.000Z"));
    const status = await syncStatus(alertRepository, environment, Date.parse("2026-03-27T12:00:00.000Z"));
    const result = await service.dispatch({
      actor: "system",
      alert: status?.alert ?? expect.fail("missing stale freshness alert"),
      status: status ?? expect.fail("missing stale freshness status"),
    });

    expect(result?.notification.latestDeliveryStatus).toBe("failed");
    expect(result?.notification.externallyNotified).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);

    const after = await syncStatus(alertRepository, environment, Date.parse("2026-03-27T12:00:00.000Z"));
    expect(after?.freshnessStatus).toBe("stale");
    expect(after?.blockedByFreshness).toBe(true);
    expect(after?.alert?.status).toBe("open");
  });
});
