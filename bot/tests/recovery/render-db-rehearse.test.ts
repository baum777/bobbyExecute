import { afterEach, describe, expect, it, vi } from "vitest";
import type { DisposableDatabaseRehearsalResult } from "../../src/recovery/disposable-db-rehearsal.js";
import {
  parseRenderDatabaseRehearsalRefreshConfig,
  runRenderDatabaseRehearsalRefresh,
  type RenderDatabaseRehearsalRefreshConfig,
} from "../../src/scripts/render-db-rehearse.js";

const envBackup = new Map<string, string | undefined>();

function setEnv(key: string, value: string | undefined): void {
  if (!envBackup.has(key)) {
    envBackup.set(key, process.env[key]);
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of envBackup.entries()) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  envBackup.clear();
  vi.restoreAllMocks();
});

function buildConnection(name: string) {
  return {
    name,
    async connect() {
      return {
        async query<T>(_text?: string, _params?: readonly unknown[]) {
          return { rows: [] as T[] };
        },
        release() {
          return undefined;
        },
      };
    },
    async end() {
      return undefined;
    },
  };
}

function buildResult(overrides: Partial<DisposableDatabaseRehearsalResult> = {}): DisposableDatabaseRehearsalResult {
  return {
    success: true,
    rehearsalId: "rehearsal-id",
    environment: "production",
    executedAt: "2026-03-28T00:00:00.000Z",
    sourceContext: { label: "canonical-production", kind: "canonical" },
    targetContext: { label: "disposable-rehearsal", kind: "disposable" },
    sourceSchemaStatus: undefined,
    targetSchemaStatusBefore: undefined,
    targetSchemaStatusAfter: undefined,
    restoreValidation: undefined,
    sourceSnapshotSummary: undefined,
    evidenceStored: true,
    status: "passed",
    summary: "passed",
    failureReason: undefined,
    sourceDatabaseFingerprint: "source-fingerprint",
    targetDatabaseFingerprint: "target-fingerprint",
    evidence: undefined,
    ...overrides,
  };
}

describe("Render-side rehearsal refresh", () => {
  it("runs the disposable rehearsal path with automated Render metadata", async () => {
    const sourceConnection = buildConnection("source");
    const targetConnection = buildConnection("target");
    const openConnection = vi.fn((url: string) => (url === "postgres://source" ? sourceConnection : targetConnection));
    const closeConnection = vi.fn(async () => undefined);
    const buildEvidenceRepository = vi.fn(() => ({
      ensureSchema: async () => undefined,
      recordAuditEvent: async () => undefined,
      recordDatabaseRehearsalEvidence: async () => undefined,
      loadLatestDatabaseRehearsalEvidence: async () => null,
      saveLivePromotionRequest: async () => undefined,
      loadLivePromotionRequest: async () => null,
      listLivePromotionRequests: async () => [],
      listAuditEvents: async () => [],
    }));
    const runRehearsal = vi.fn(async (config: any) =>
      buildResult({
        evidence: {
          id: "rehearsal-id",
          environment: "production",
          rehearsalKind: "disposable_restore",
          status: "passed",
          executionSource: "automated",
          executionContext: {
            orchestration: "render_cron",
            provider: "render",
            serviceName: config.executionContext?.serviceName ?? "bobbyexecute-rehearsal-production",
            schedule: "0 3 * * *",
            trigger: "scheduled_refresh",
          },
          executedAt: "2026-03-28T00:00:00.000Z",
          recordedAt: "2026-03-28T00:00:00.000Z",
          actorId: "render-rehearsal-bobbyexecute-rehearsal-production",
          actorDisplayName: "Render rehearsal refresh (bobbyexecute-rehearsal-production)",
          actorRole: "admin",
          sessionId: "render:bobbyexecute-rehearsal-production",
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
            before: {
              environment: "production",
              capturedAt: "2026-03-28T00:00:00.000Z",
              schemaState: "ready",
              counts: {},
              totalRecords: 0,
            },
            after: {
              environment: "production",
              capturedAt: "2026-03-28T00:00:00.000Z",
              schemaState: "ready",
              counts: {},
              totalRecords: 0,
            },
          },
          summary: "fresh disposable restore rehearsal",
        },
      })
    );

    const config: RenderDatabaseRehearsalRefreshConfig = {
      sourceDatabaseUrl: "postgres://source",
      targetDatabaseUrl: "postgres://target",
      environment: "production",
      sourceContextLabel: "canonical-production",
      targetContextLabel: "disposable-rehearsal",
      sourceContextKind: "canonical",
      targetContextKind: "disposable",
      renderServiceName: "bobbyexecute-rehearsal-production",
      cronSchedule: "0 3 * * *",
      executionSource: "automated",
      executionContext: {
        orchestration: "render_cron",
        provider: "render",
        serviceName: "bobbyexecute-rehearsal-production",
        schedule: "0 3 * * *",
        trigger: "scheduled_refresh",
      },
      actor: {
        actorId: "render-rehearsal-bobbyexecute-rehearsal-production",
        displayName: "Render rehearsal refresh (bobbyexecute-rehearsal-production)",
        role: "admin",
        sessionId: "render:bobbyexecute-rehearsal-production",
      },
      migrationsDir: "migrations",
      rehearsalId: "rehearsal-id",
    };

    const result = await runRenderDatabaseRehearsalRefresh(config, {
      openConnection,
      closeConnection,
      buildEvidenceRepository,
      runRehearsal,
    });

    expect(result.success).toBe(true);
    expect(openConnection).toHaveBeenCalledTimes(2);
    expect(buildEvidenceRepository).toHaveBeenCalledWith(sourceConnection);
    expect(runRehearsal).toHaveBeenCalledWith(
      expect.objectContaining({
        executionSource: "automated",
        executionContext: expect.objectContaining({
          provider: "render",
          orchestration: "render_cron",
          serviceName: "bobbyexecute-rehearsal-production",
        }),
        sourceContext: { label: "canonical-production", kind: "canonical" },
        targetContext: { label: "disposable-rehearsal", kind: "disposable" },
      })
    );
    expect(closeConnection).toHaveBeenCalledTimes(2);
  });

  it("rejects missing orchestration config before parsing a Render run", () => {
    setEnv("SOURCE_DATABASE_URL", "postgres://source");
    setEnv("TARGET_DATABASE_URL", "postgres://target");
    setEnv("RUNTIME_CONFIG_ENV", "production");
    setEnv("REHEARSAL_SOURCE_CONTEXT", "canonical-production");
    setEnv("REHEARSAL_TARGET_CONTEXT", "disposable-rehearsal");
    setEnv("REHEARSAL_RENDER_SERVICE_NAME", "bobbyexecute-rehearsal-production");
    setEnv("REHEARSAL_CRON_SCHEDULE", "0 3 * * *");
    setEnv("REHEARSAL_EXECUTION_SOURCE", undefined);
    setEnv("REHEARSAL_ORCHESTRATION_MODE", undefined);
    setEnv("REHEARSAL_AUTOMATION_PROVIDER", undefined);

    expect(() => parseRenderDatabaseRehearsalRefreshConfig([])).toThrow(/REHEARSAL_EXECUTION_SOURCE/);
  });

  it("rejects identical source and target database URLs", async () => {
    const config: RenderDatabaseRehearsalRefreshConfig = {
      sourceDatabaseUrl: "postgres://same",
      targetDatabaseUrl: "postgres://same",
      environment: "production",
      sourceContextLabel: "canonical-production",
      targetContextLabel: "disposable-rehearsal",
      sourceContextKind: "canonical",
      targetContextKind: "disposable",
      renderServiceName: "bobbyexecute-rehearsal-production",
      cronSchedule: "0 3 * * *",
      executionSource: "automated",
      executionContext: {
        orchestration: "render_cron",
        provider: "render",
        serviceName: "bobbyexecute-rehearsal-production",
        schedule: "0 3 * * *",
        trigger: "scheduled_refresh",
      },
      actor: {
        actorId: "render-rehearsal-bobbyexecute-rehearsal-production",
        displayName: "Render rehearsal refresh (bobbyexecute-rehearsal-production)",
        role: "admin",
        sessionId: "render:bobbyexecute-rehearsal-production",
      },
    };

    await expect(
      runRenderDatabaseRehearsalRefresh(config, {
        openConnection: vi.fn(),
        closeConnection: vi.fn(),
        buildEvidenceRepository: vi.fn(),
        runRehearsal: vi.fn(),
      })
    ).rejects.toThrow(/identical/);
  });

  it("surfaces failed automatic executions without pretending the evidence is fresh", async () => {
    const config: RenderDatabaseRehearsalRefreshConfig = {
      sourceDatabaseUrl: "postgres://source",
      targetDatabaseUrl: "postgres://target",
      environment: "production",
      sourceContextLabel: "canonical-production",
      targetContextLabel: "disposable-rehearsal",
      sourceContextKind: "canonical",
      targetContextKind: "disposable",
      renderServiceName: "bobbyexecute-rehearsal-production",
      cronSchedule: "0 3 * * *",
      executionSource: "automated",
      executionContext: {
        orchestration: "render_cron",
        provider: "render",
        serviceName: "bobbyexecute-rehearsal-production",
        schedule: "0 3 * * *",
        trigger: "scheduled_refresh",
      },
      actor: {
        actorId: "render-rehearsal-bobbyexecute-rehearsal-production",
        displayName: "Render rehearsal refresh (bobbyexecute-rehearsal-production)",
        role: "admin",
        sessionId: "render:bobbyexecute-rehearsal-production",
      },
    };

    const runRehearsal = vi.fn(async () =>
      buildResult({
        success: false,
        status: "failed",
        evidenceStored: true,
        failureReason: "restore validation counts did not match after disposable rehearsal",
        summary: "Disposable database rehearsal failed. Source ready:ready, target ready:ready, restore matched=false.",
      })
    );

    const result = await runRenderDatabaseRehearsalRefresh(config, {
      openConnection: vi.fn((url: string) => buildConnection(url)),
      closeConnection: vi.fn(async () => undefined),
      buildEvidenceRepository: vi.fn(() => ({
        ensureSchema: async () => undefined,
        recordAuditEvent: async () => undefined,
        recordDatabaseRehearsalEvidence: async () => undefined,
        loadLatestDatabaseRehearsalEvidence: async () => null,
        saveLivePromotionRequest: async () => undefined,
        loadLivePromotionRequest: async () => null,
        listLivePromotionRequests: async () => [],
        listAuditEvents: async () => [],
      })),
      runRehearsal,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.failureReason).toContain("restore validation counts did not match");
    expect(runRehearsal).toHaveBeenCalledTimes(1);
  });
});
