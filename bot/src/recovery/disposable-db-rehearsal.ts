import { createHash, randomUUID } from "node:crypto";
import {
  captureControlPlaneBackup,
  summarizeControlPlaneBackup,
  type ControlPlaneBackupSnapshot,
  validateControlPlaneBackupRoundTrip,
} from "./control-plane-backup.js";
import type {
  ControlGovernanceRepositoryWithAudits,
  ControlRecoveryRehearsalContext,
  ControlRecoveryRehearsalExecutionContext,
  ControlRecoveryRehearsalExecutionSource,
  ControlRecoveryRehearsalEvidenceRecord,
  ControlRecoveryRehearsalStatus,
  ControlRecoveryRehearsalValidation,
  ControlRecoverySnapshotSummary,
  ControlOperatorRole,
} from "../control/control-governance.js";
import {
  inspectSchemaStatus,
  migrateSchema,
  type SchemaMigrationConnection,
  type SchemaMigrationStatus,
} from "../persistence/schema-migrations.js";

export interface DisposableDatabaseRehearsalActor {
  actorId: string;
  displayName: string;
  role: ControlOperatorRole;
  sessionId: string;
}

export interface DisposableDatabaseRehearsalConfig {
  environment: string;
  sourceConnection: SchemaMigrationConnection;
  targetConnection: SchemaMigrationConnection;
  evidenceRepository: ControlGovernanceRepositoryWithAudits;
  sourceContext: ControlRecoveryRehearsalContext;
  targetContext: ControlRecoveryRehearsalContext;
  actor: DisposableDatabaseRehearsalActor;
  sourceDatabaseUrl: string;
  targetDatabaseUrl: string;
  migrationsDir?: string;
  rehearsalId?: string;
  sourceSnapshot?: ControlPlaneBackupSnapshot;
  executionSource?: ControlRecoveryRehearsalExecutionSource;
  executionContext?: ControlRecoveryRehearsalExecutionContext;
}

export interface DisposableDatabaseRehearsalResult {
  success: boolean;
  rehearsalId: string;
  environment: string;
  executedAt: string;
  sourceContext: ControlRecoveryRehearsalContext;
  targetContext: ControlRecoveryRehearsalContext;
  sourceSchemaStatus?: SchemaMigrationStatus;
  targetSchemaStatusBefore?: SchemaMigrationStatus;
  targetSchemaStatusAfter?: SchemaMigrationStatus;
  restoreValidation?: ControlRecoveryRehearsalValidation;
  sourceSnapshotSummary?: ControlRecoverySnapshotSummary;
  evidenceStored: boolean;
  status: ControlRecoveryRehearsalStatus;
  summary: string;
  failureReason?: string;
  sourceDatabaseFingerprint: string;
  targetDatabaseFingerprint: string;
  evidence?: ControlRecoveryRehearsalEvidenceRecord;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value.trim(), "utf8").digest("hex");
}

function trimOrThrow(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required.`);
  }
  return trimmed;
}

function emptySnapshotSummary(environment: string, schemaState: string, capturedAt: string): ControlRecoverySnapshotSummary {
  return {
    environment,
    capturedAt,
    schemaState,
    counts: {},
    totalRecords: 0,
  };
}

function formatStatusLabel(status: SchemaMigrationStatus): string {
  return `${status.state}${status.ready ? ":ready" : ":not-ready"}`;
}

function buildSummary(
  status: ControlRecoveryRehearsalStatus,
  sourceSchemaStatus?: SchemaMigrationStatus,
  targetSchemaStatusBefore?: SchemaMigrationStatus,
  targetSchemaStatusAfter?: SchemaMigrationStatus,
  restoreValidation?: ControlRecoveryRehearsalValidation,
  failureReason?: string
): string {
  if (status === "passed") {
    return `Disposable database rehearsal passed. Source ${sourceSchemaStatus ? formatStatusLabel(sourceSchemaStatus) : "unknown"}, target ${targetSchemaStatusAfter ? formatStatusLabel(targetSchemaStatusAfter) : "unknown"}, restore status=${restoreValidation?.status ?? "count_or_metadata_mismatch"}.`;
  }

  const source = sourceSchemaStatus ? formatStatusLabel(sourceSchemaStatus) : "unknown";
  const target = targetSchemaStatusBefore ? formatStatusLabel(targetSchemaStatusBefore) : "unknown";
  const restore = restoreValidation
    ? `restore status=${restoreValidation.status}, countsMatched=${restoreValidation.countsMatched}, contentMatched=${restoreValidation.contentMatched}`
    : "restore unavailable";
  return `Disposable database rehearsal failed. Source ${source}, target ${target}, ${restore}.${failureReason ? ` Reason: ${failureReason}` : ""}`;
}

async function tryPersistEvidence(
  repository: ControlGovernanceRepositoryWithAudits,
  evidence: ControlRecoveryRehearsalEvidenceRecord
): Promise<{ stored: boolean; failureReason?: string }> {
  try {
    await repository.recordDatabaseRehearsalEvidence(evidence);
    return { stored: true };
  } catch (error) {
    return {
      stored: false,
      failureReason: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildEvidenceRecord(input: {
  rehearsalId: string;
  environment: string;
  executedAt: string;
  actor: DisposableDatabaseRehearsalActor;
  sourceContext: ControlRecoveryRehearsalContext;
  targetContext: ControlRecoveryRehearsalContext;
  sourceDatabaseUrl: string;
  targetDatabaseUrl: string;
  sourceSchemaStatus: SchemaMigrationStatus;
  targetSchemaStatusBefore: SchemaMigrationStatus;
  targetSchemaStatusAfter?: SchemaMigrationStatus;
  restoreValidation: ControlRecoveryRehearsalValidation;
  status: ControlRecoveryRehearsalStatus;
  executionSource: ControlRecoveryRehearsalExecutionSource;
  executionContext: ControlRecoveryRehearsalExecutionContext;
  summary: string;
  failureReason?: string;
}): ControlRecoveryRehearsalEvidenceRecord {
  return {
    id: input.rehearsalId,
    environment: input.environment,
    rehearsalKind: "disposable_restore",
    status: input.status,
    executionSource: input.executionSource,
    executionContext: input.executionContext,
    executedAt: input.executedAt,
    recordedAt: input.executedAt,
    actorId: input.actor.actorId,
    actorDisplayName: input.actor.displayName,
    actorRole: input.actor.role,
    sessionId: input.actor.sessionId,
    sourceContext: input.sourceContext,
    targetContext: input.targetContext,
    sourceDatabaseFingerprint: fingerprint(input.sourceDatabaseUrl),
    targetDatabaseFingerprint: fingerprint(input.targetDatabaseUrl),
    sourceSchemaStatus: input.sourceSchemaStatus,
    targetSchemaStatusBefore: input.targetSchemaStatusBefore,
    targetSchemaStatusAfter: input.targetSchemaStatusAfter,
    restoreValidation: input.restoreValidation,
    summary: input.summary,
    failureReason: input.failureReason,
  };
}

function validateRehearsalConfig(config: DisposableDatabaseRehearsalConfig): void {
  trimOrThrow(config.environment, "environment");
  trimOrThrow(config.sourceDatabaseUrl, "sourceDatabaseUrl");
  trimOrThrow(config.targetDatabaseUrl, "targetDatabaseUrl");
  trimOrThrow(config.sourceContext.label, "sourceContext.label");
  trimOrThrow(config.targetContext.label, "targetContext.label");
  trimOrThrow(config.actor.actorId, "actor.actorId");
  trimOrThrow(config.actor.displayName, "actor.displayName");
  trimOrThrow(config.actor.sessionId, "actor.sessionId");

  if (config.targetContext.kind !== "disposable") {
    throw new Error("targetContext.kind must be 'disposable' for a disposable rehearsal.");
  }

  if (config.sourceDatabaseUrl.trim() === config.targetDatabaseUrl.trim()) {
    throw new Error("source and target database URLs are identical; refusing to rehearse against the canonical source database.");
  }

  if (fingerprint(config.sourceDatabaseUrl) === fingerprint(config.targetDatabaseUrl)) {
    throw new Error("source and target database fingerprints match; refusing to rehearse against the canonical source database.");
  }
}

async function captureTargetSnapshot(
  targetConnection: SchemaMigrationConnection,
  environment: string,
  migrationsDir?: string
): Promise<ControlPlaneBackupSnapshot | undefined> {
  try {
    return await captureControlPlaneBackup(targetConnection, environment, migrationsDir ? { migrationsDir } : {});
  } catch {
    return undefined;
  }
}

export async function runDisposableDatabaseRehearsal(
  config: DisposableDatabaseRehearsalConfig
): Promise<DisposableDatabaseRehearsalResult> {
  validateRehearsalConfig(config);

  const rehearsalId = config.rehearsalId ?? randomUUID();
  const executedAt = new Date().toISOString();
  const environment = config.environment.trim();
  const sourceDatabaseFingerprint = fingerprint(config.sourceDatabaseUrl);
  const targetDatabaseFingerprint = fingerprint(config.targetDatabaseUrl);
  const executionSource = config.executionSource ?? "manual";
  const executionContext = config.executionContext ?? { orchestration: "manual_cli" as const };
  let sourceSchemaStatus: SchemaMigrationStatus | undefined;
  let targetSchemaStatusBefore: SchemaMigrationStatus | undefined;
  let targetSchemaStatusAfter: SchemaMigrationStatus | undefined;
  let sourceSnapshot: ControlPlaneBackupSnapshot | undefined = config.sourceSnapshot;
  let restoreValidation: ControlRecoveryRehearsalValidation | undefined;
  let status: ControlRecoveryRehearsalStatus = "failed";
  let failureReason: string | undefined;
  let evidenceStored = false;
  let evidence: ControlRecoveryRehearsalEvidenceRecord | undefined;

  try {
    sourceSchemaStatus = await inspectSchemaStatus(config.sourceConnection, config.migrationsDir ? { migrationsDir: config.migrationsDir } : {});
    if (!sourceSchemaStatus.ready) {
      throw new Error(`source database schema is not ready: ${sourceSchemaStatus.message}`);
    }

    targetSchemaStatusBefore = await inspectSchemaStatus(config.targetConnection, config.migrationsDir ? { migrationsDir: config.migrationsDir } : {});
    if (targetSchemaStatusBefore.state === "unrecoverable") {
      throw new Error(`target database schema is unrecoverable: ${targetSchemaStatusBefore.message}`);
    }

    if (!targetSchemaStatusBefore.ready) {
      await migrateSchema(config.targetConnection, config.migrationsDir ? { migrationsDir: config.migrationsDir } : {});
      targetSchemaStatusAfter = await inspectSchemaStatus(config.targetConnection, config.migrationsDir ? { migrationsDir: config.migrationsDir } : {});
      if (!targetSchemaStatusAfter.ready) {
        throw new Error(`target database did not become ready after migration: ${targetSchemaStatusAfter.message}`);
      }
    } else {
      targetSchemaStatusAfter = targetSchemaStatusBefore;
    }

    if (!sourceSnapshot) {
      sourceSnapshot = await captureControlPlaneBackup(config.sourceConnection, environment, config.migrationsDir ? { migrationsDir: config.migrationsDir } : {});
    }

    if (sourceSnapshot.environment !== environment) {
      throw new Error(`source snapshot environment '${sourceSnapshot.environment}' does not match rehearsal environment '${environment}'.`);
    }

    if (!sourceSnapshot.schemaStatus.ready) {
      throw new Error(`source backup snapshot is not ready: ${sourceSnapshot.schemaStatus.message}`);
    }

    const targetSnapshotBefore = await captureTargetSnapshot(config.targetConnection, environment, config.migrationsDir);
    const validation = await validateControlPlaneBackupRoundTrip(config.targetConnection, sourceSnapshot);
    restoreValidation = validation;
    status = validation.matched ? "passed" : "failed";
    if (!validation.matched) {
      failureReason = `restore validation failed with status '${validation.status}' after disposable rehearsal`;
    }

    const sourceSummary = summarizeControlPlaneBackup(sourceSnapshot);
    const targetSchemaState = targetSchemaStatusAfter?.state ?? targetSchemaStatusBefore?.state ?? "unavailable";
    const targetSummary = targetSnapshotBefore ? summarizeControlPlaneBackup(targetSnapshotBefore) : emptySnapshotSummary(environment, targetSchemaState, executedAt);
    if (!restoreValidation) {
      restoreValidation = {
        matched: false,
        countsMatched: false,
        contentMatched: false,
        status: "count_or_metadata_mismatch",
        mismatchTables: [],
        countMismatchTables: [],
        metadataMismatches: ["restore_validation_unavailable"],
        before: sourceSummary,
        after: targetSummary,
      };
    }

    const summary = buildSummary(status, sourceSchemaStatus, targetSchemaStatusBefore, targetSchemaStatusAfter, restoreValidation, failureReason);
    evidence = buildEvidenceRecord({
      rehearsalId,
      environment,
      executedAt,
      actor: config.actor,
      sourceContext: config.sourceContext,
      targetContext: config.targetContext,
      sourceDatabaseUrl: config.sourceDatabaseUrl,
      targetDatabaseUrl: config.targetDatabaseUrl,
      sourceSchemaStatus,
      targetSchemaStatusBefore,
      targetSchemaStatusAfter,
      restoreValidation,
      status,
      executionSource,
      executionContext,
      summary,
      failureReason,
    });
    const persisted = await tryPersistEvidence(config.evidenceRepository, evidence);
    evidenceStored = persisted.stored;
    if (!persisted.stored) {
      status = "failed";
      failureReason = `evidence persistence failed: ${persisted.failureReason}`;
      evidence = buildEvidenceRecord({
        rehearsalId,
        environment,
        executedAt,
        actor: config.actor,
        sourceContext: config.sourceContext,
        targetContext: config.targetContext,
        sourceDatabaseUrl: config.sourceDatabaseUrl,
        targetDatabaseUrl: config.targetDatabaseUrl,
        sourceSchemaStatus,
        targetSchemaStatusBefore,
        targetSchemaStatusAfter,
        restoreValidation,
        status,
        executionSource,
        executionContext,
        summary: buildSummary(status, sourceSchemaStatus, targetSchemaStatusBefore, targetSchemaStatusAfter, restoreValidation, failureReason),
        failureReason,
      });
    }
  } catch (error) {
    failureReason = error instanceof Error ? error.message : String(error);
    const sourceSummary = sourceSnapshot ? summarizeControlPlaneBackup(sourceSnapshot) : emptySnapshotSummary(environment, sourceSchemaStatus?.state ?? "unavailable", executedAt);
    const targetSchemaState = targetSchemaStatusAfter?.state ?? targetSchemaStatusBefore?.state ?? "unavailable";
    const targetSummary = emptySnapshotSummary(environment, targetSchemaState, executedAt);
    restoreValidation = restoreValidation ?? {
      matched: false,
      countsMatched: false,
      contentMatched: false,
      status: "count_or_metadata_mismatch",
      mismatchTables: [],
      countMismatchTables: [],
      metadataMismatches: ["restore_validation_unavailable"],
      before: sourceSummary,
      after: targetSummary,
    };
    const summary = buildSummary(status, sourceSchemaStatus, targetSchemaStatusBefore, targetSchemaStatusAfter, restoreValidation, failureReason);

    if (sourceSchemaStatus && targetSchemaStatusBefore) {
      evidence = buildEvidenceRecord({
        rehearsalId,
        environment,
        executedAt,
        actor: config.actor,
        sourceContext: config.sourceContext,
        targetContext: config.targetContext,
        sourceDatabaseUrl: config.sourceDatabaseUrl,
        targetDatabaseUrl: config.targetDatabaseUrl,
        sourceSchemaStatus,
        targetSchemaStatusBefore,
        targetSchemaStatusAfter,
        restoreValidation,
        status,
        executionSource,
        executionContext,
        summary,
        failureReason,
      });
      const persisted = await tryPersistEvidence(config.evidenceRepository, evidence);
      evidenceStored = persisted.stored;
      if (!persisted.stored) {
        failureReason = `${failureReason}; evidence persistence failed: ${persisted.failureReason}`;
        evidence = buildEvidenceRecord({
          rehearsalId,
          environment,
          executedAt,
          actor: config.actor,
          sourceContext: config.sourceContext,
          targetContext: config.targetContext,
          sourceDatabaseUrl: config.sourceDatabaseUrl,
          targetDatabaseUrl: config.targetDatabaseUrl,
          sourceSchemaStatus,
          targetSchemaStatusBefore,
          targetSchemaStatusAfter,
          restoreValidation,
          status,
          executionSource,
          executionContext,
          summary: buildSummary(status, sourceSchemaStatus, targetSchemaStatusBefore, targetSchemaStatusAfter, restoreValidation, failureReason),
          failureReason,
        });
      }
    }
  }

  const finalSummary = buildSummary(status, sourceSchemaStatus, targetSchemaStatusBefore, targetSchemaStatusAfter, restoreValidation, failureReason);
  return {
    success: status === "passed" && evidenceStored,
    rehearsalId,
    environment,
    executedAt,
    sourceContext: config.sourceContext,
    targetContext: config.targetContext,
    sourceSchemaStatus,
    targetSchemaStatusBefore,
    targetSchemaStatusAfter,
    restoreValidation,
    sourceSnapshotSummary: sourceSnapshot ? summarizeControlPlaneBackup(sourceSnapshot) : undefined,
    evidenceStored,
    status,
    summary: evidence?.summary ?? finalSummary,
    failureReason,
    sourceDatabaseFingerprint,
    targetDatabaseFingerprint,
    evidence,
  };
}
