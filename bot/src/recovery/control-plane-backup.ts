import { createHash } from "node:crypto";
import type { ControlLivePromotionRecord, ControlAuditEvent } from "../control/control-governance.js";
import type {
  RuntimeConfigActiveRecord,
  RuntimeConfigChangeLogRecord,
  RuntimeConfigVersionRecord,
} from "../persistence/runtime-config-repository.js";
import type {
  RuntimeVisibilityRecord,
} from "../persistence/runtime-visibility-repository.js";
import type {
  WorkerRestartRequestRecord,
} from "../persistence/worker-restart-repository.js";
import type {
  WorkerRestartAlertEventRecord,
  WorkerRestartAlertRecord,
} from "../persistence/worker-restart-alert-repository.js";
import {
  assertSchemaReady,
  inspectSchemaStatus,
  type SchemaMigrationConnection,
  type SchemaMigrationStatus,
} from "../persistence/schema-migrations.js";

type DbRow = Record<string, unknown>;

export interface ControlPlaneBackupSnapshot {
  capturedAt: string;
  environment: string;
  schemaStatus: SchemaMigrationStatus;
  runtimeConfig: {
    active: DbRow | null;
    versions: DbRow[];
    changeLog: DbRow[];
  };
  runtimeVisibility: DbRow | null;
  workerRestarts: DbRow[];
  restartAlerts: {
    alerts: DbRow[];
    events: DbRow[];
  };
  governance: {
    audits: DbRow[];
    livePromotions: DbRow[];
  };
}

export interface ControlPlaneBackupSummary {
  environment: string;
  capturedAt: string;
  schemaState: SchemaMigrationStatus["state"];
  counts: {
    runtimeConfigVersions: number;
    runtimeConfigActive: number;
    runtimeConfigChangeLog: number;
    runtimeVisibility: number;
    workerRestarts: number;
    restartAlerts: number;
    restartAlertEvents: number;
    governanceAudits: number;
    livePromotions: number;
  };
  totalRecords: number;
}

type ControlPlaneBackupCanonicalTableName =
  | "runtime_config_versions"
  | "runtime_config_active"
  | "config_change_log"
  | "runtime_visibility_snapshots"
  | "worker_restart_requests"
  | "worker_restart_alerts"
  | "worker_restart_alert_events"
  | "control_operator_audit_log"
  | "control_live_promotions";

const CANONICAL_TABLE_NAMES: ControlPlaneBackupCanonicalTableName[] = [
  "runtime_config_versions",
  "runtime_config_active",
  "config_change_log",
  "runtime_visibility_snapshots",
  "worker_restart_requests",
  "worker_restart_alerts",
  "worker_restart_alert_events",
  "control_operator_audit_log",
  "control_live_promotions",
];

const SUMMARY_COUNT_KEY_BY_TABLE: Record<
  ControlPlaneBackupCanonicalTableName,
  keyof ControlPlaneBackupSummary["counts"]
> = {
  runtime_config_versions: "runtimeConfigVersions",
  runtime_config_active: "runtimeConfigActive",
  config_change_log: "runtimeConfigChangeLog",
  runtime_visibility_snapshots: "runtimeVisibility",
  worker_restart_requests: "workerRestarts",
  worker_restart_alerts: "restartAlerts",
  worker_restart_alert_events: "restartAlertEvents",
  control_operator_audit_log: "governanceAudits",
  control_live_promotions: "livePromotions",
};

export type ControlPlaneBackupValidationStatus =
  | "exact_match"
  | "content_mismatch"
  | "count_or_metadata_mismatch";

export interface ControlPlaneBackupRoundTripValidationResult {
  before: ControlPlaneBackupSummary;
  after: ControlPlaneBackupSummary;
  matched: boolean;
  countsMatched: boolean;
  contentMatched: boolean;
  status: ControlPlaneBackupValidationStatus;
  mismatchTables: ControlPlaneBackupCanonicalTableName[];
  countMismatchTables: ControlPlaneBackupCanonicalTableName[];
  metadataMismatches: string[];
}

export function summarizeControlPlaneBackup(snapshot: ControlPlaneBackupSnapshot): ControlPlaneBackupSummary {
  const counts = {
    runtimeConfigVersions: snapshot.runtimeConfig.versions.length,
    runtimeConfigActive: snapshot.runtimeConfig.active ? 1 : 0,
    runtimeConfigChangeLog: snapshot.runtimeConfig.changeLog.length,
    runtimeVisibility: snapshot.runtimeVisibility ? 1 : 0,
    workerRestarts: snapshot.workerRestarts.length,
    restartAlerts: snapshot.restartAlerts.alerts.length,
    restartAlertEvents: snapshot.restartAlerts.events.length,
    governanceAudits: snapshot.governance.audits.length,
    livePromotions: snapshot.governance.livePromotions.length,
  };

  return {
    environment: snapshot.environment,
    capturedAt: snapshot.capturedAt,
    schemaState: snapshot.schemaStatus.state,
    counts,
    totalRecords: Object.values(counts).reduce((sum, value) => sum + value, 0),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonicalizeForStableJson(value: unknown): unknown {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeForStableJson(entry));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort((left, right) => left.localeCompare(right));
    const normalized: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      normalized[key] = canonicalizeForStableJson(record[key]);
    }
    return normalized;
  }

  return value;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalizeForStableJson(value));
}

function hashRows(rows: DbRow[]): string {
  const serializedRows = rows.map((row) => stableSerialize(row)).sort((left, right) => left.localeCompare(right));
  return createHash("sha256").update(serializedRows.join("\n"), "utf8").digest("hex");
}

function extractCanonicalRows(
  snapshot: ControlPlaneBackupSnapshot
): Record<ControlPlaneBackupCanonicalTableName, DbRow[]> {
  return {
    runtime_config_versions: snapshot.runtimeConfig.versions,
    runtime_config_active: snapshot.runtimeConfig.active ? [snapshot.runtimeConfig.active] : [],
    config_change_log: snapshot.runtimeConfig.changeLog,
    runtime_visibility_snapshots: snapshot.runtimeVisibility ? [snapshot.runtimeVisibility] : [],
    worker_restart_requests: snapshot.workerRestarts,
    worker_restart_alerts: snapshot.restartAlerts.alerts,
    worker_restart_alert_events: snapshot.restartAlerts.events,
    control_operator_audit_log: snapshot.governance.audits,
    control_live_promotions: snapshot.governance.livePromotions,
  };
}

async function withClient<T>(
  connection: SchemaMigrationConnection,
  work: (client: Awaited<ReturnType<SchemaMigrationConnection["connect"]>>) => Promise<T>
): Promise<T> {
  const client = await connection.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

async function queryRows<T extends DbRow>(client: Awaited<ReturnType<SchemaMigrationConnection["connect"]>>, sql: string, params: unknown[]): Promise<T[]> {
  const result = await client.query<T>(sql, params);
  return result.rows.map((row) => clone(row));
}

function rowValue(row: DbRow | null | undefined, key: string): unknown {
  return row ? row[key] ?? null : null;
}

function rowValueOrUndefined(row: DbRow | null | undefined, key: string): unknown {
  return row ? row[key] ?? undefined : undefined;
}

export async function captureControlPlaneBackup(
  connection: SchemaMigrationConnection,
  environment: string,
  options: { migrationsDir?: string } = {}
): Promise<ControlPlaneBackupSnapshot> {
  const schemaStatus = await inspectSchemaStatus(connection, options);
  const capturedAt = new Date().toISOString();

  return withClient(connection, async (client) => {
    const runtimeConfigVersions = await queryRows<DbRow>(
      client,
      `SELECT * FROM runtime_config_versions WHERE environment = $1 ORDER BY version_number ASC, created_at ASC`,
      [environment]
    );
    const runtimeConfigActive = await queryRows<DbRow>(
      client,
      `SELECT * FROM runtime_config_active WHERE environment = $1 LIMIT 1`,
      [environment]
    );
    const runtimeConfigChangeLog = await queryRows<DbRow>(
      client,
      `SELECT * FROM config_change_log WHERE environment = $1 ORDER BY created_at ASC`,
      [environment]
    );
    const runtimeVisibility = await queryRows<DbRow>(
      client,
      `SELECT * FROM runtime_visibility_snapshots WHERE environment = $1 LIMIT 1`,
      [environment]
    );
    const workerRestarts = await queryRows<DbRow>(
      client,
      `SELECT * FROM worker_restart_requests WHERE environment = $1 ORDER BY requested_at ASC, updated_at ASC`,
      [environment]
    );
    const restartAlerts = await queryRows<DbRow>(
      client,
      `SELECT * FROM worker_restart_alerts WHERE environment = $1 ORDER BY first_seen_at ASC, updated_at ASC`,
      [environment]
    );
    const restartAlertEvents = await queryRows<DbRow>(
      client,
      `SELECT * FROM worker_restart_alert_events WHERE environment = $1 ORDER BY created_at ASC`,
      [environment]
    );
    const audits = await queryRows<DbRow>(
      client,
      `SELECT * FROM control_operator_audit_log WHERE environment = $1 ORDER BY created_at ASC`,
      [environment]
    );
    const livePromotions = await queryRows<DbRow>(
      client,
      `SELECT * FROM control_live_promotions WHERE environment = $1 ORDER BY requested_at ASC, updated_at ASC`,
      [environment]
    );

    return {
      capturedAt,
      environment,
      schemaStatus,
      runtimeConfig: {
        active: runtimeConfigActive[0] ?? null,
        versions: runtimeConfigVersions,
        changeLog: runtimeConfigChangeLog,
      },
      runtimeVisibility: runtimeVisibility[0] ?? null,
      workerRestarts,
      restartAlerts: {
        alerts: restartAlerts,
        events: restartAlertEvents,
      },
      governance: {
        audits,
        livePromotions,
      },
    };
  });
}

async function deleteEnvironmentRows(
  client: Awaited<ReturnType<SchemaMigrationConnection["connect"]>>,
  environment: string
): Promise<void> {
  for (const sql of [
    `DELETE FROM control_operator_audit_log WHERE environment = $1`,
    `DELETE FROM control_live_promotions WHERE environment = $1`,
    `DELETE FROM worker_restart_alert_events WHERE environment = $1`,
    `DELETE FROM worker_restart_alerts WHERE environment = $1`,
    `DELETE FROM worker_restart_requests WHERE environment = $1`,
    `DELETE FROM runtime_visibility_snapshots WHERE environment = $1`,
    `DELETE FROM config_change_log WHERE environment = $1`,
    `DELETE FROM runtime_config_active WHERE environment = $1`,
    `DELETE FROM runtime_config_versions WHERE environment = $1`,
  ]) {
    await client.query(sql, [environment]);
  }
}

function ensureSnapshotEnvironment(snapshot: ControlPlaneBackupSnapshot): void {
  if (!snapshot.environment || snapshot.environment.trim() === "") {
    throw new Error("backup snapshot is missing an environment");
  }

  const rows = [
    ...snapshot.runtimeConfig.versions,
    ...(snapshot.runtimeConfig.active ? [snapshot.runtimeConfig.active] : []),
    ...snapshot.runtimeConfig.changeLog,
    ...(snapshot.runtimeVisibility ? [snapshot.runtimeVisibility] : []),
    ...snapshot.workerRestarts,
    ...snapshot.restartAlerts.alerts,
    ...snapshot.restartAlerts.events,
    ...snapshot.governance.audits,
    ...snapshot.governance.livePromotions,
  ];

  for (const row of rows) {
    if ((row.environment as string | undefined) && String(row.environment) !== snapshot.environment) {
      throw new Error(`backup snapshot contains mixed environments: ${String(row.environment)} !== ${snapshot.environment}`);
    }
  }
}

function toJson(value: unknown): unknown {
  if (value == null) {
    return null;
  }
  return value;
}

async function restoreRuntimeConfig(
  client: Awaited<ReturnType<SchemaMigrationConnection["connect"]>>,
  snapshot: ControlPlaneBackupSnapshot
): Promise<void> {
  for (const row of snapshot.runtimeConfig.versions) {
    await client.query(
      `
        INSERT INTO runtime_config_versions (
          id, environment, version_number, schema_version, config_json, config_hash, previous_version_id,
          status, created_by, reason, created_at, activated_at, activated_by, applied_at, applied_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `,
      [
        row.id,
        row.environment,
        row.version_number,
        row.schema_version,
        toJson(row.config_json),
        row.config_hash,
        row.previous_version_id ?? null,
        row.status,
        row.created_by,
        row.reason ?? null,
        row.created_at,
        row.activated_at ?? null,
        row.activated_by ?? null,
        row.applied_at ?? null,
        row.applied_by ?? null,
      ]
    );
  }

  if (snapshot.runtimeConfig.active) {
    const row = snapshot.runtimeConfig.active;
    await client.query(
      `
        INSERT INTO runtime_config_active (
          environment, active_version_id, requested_version_id, applied_version_id, last_valid_version_id,
          reload_nonce, paused, pause_scope, pause_reason, kill_switch, kill_switch_reason, pending_apply,
          pending_reason, requires_restart, requested_at, applied_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      `,
      [
        row.environment,
        row.active_version_id,
        row.requested_version_id,
        row.applied_version_id,
        row.last_valid_version_id,
        row.reload_nonce,
        row.paused,
        row.pause_scope ?? null,
        row.pause_reason ?? null,
        row.kill_switch,
        row.kill_switch_reason ?? null,
        row.pending_apply,
        row.pending_reason ?? null,
        row.requires_restart,
        row.requested_at,
        row.applied_at ?? null,
        row.updated_at,
      ]
    );
  }

  for (const row of snapshot.runtimeConfig.changeLog) {
    await client.query(
      `
        INSERT INTO config_change_log (
          id, environment, version_id, action, actor, accepted, before_config, after_config, before_overlay,
          after_overlay, reason, rejection_reason, result_version_id, reload_nonce, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `,
      [
        row.id,
        row.environment,
        row.version_id ?? null,
        row.action,
        row.actor,
        row.accepted,
        toJson(row.before_config),
        toJson(row.after_config),
        toJson(row.before_overlay),
        toJson(row.after_overlay),
        row.reason ?? null,
        row.rejection_reason ?? null,
        row.result_version_id ?? null,
        row.reload_nonce,
        row.created_at,
      ]
    );
  }
}

async function restoreRuntimeVisibility(
  client: Awaited<ReturnType<SchemaMigrationConnection["connect"]>>,
  snapshot: ControlPlaneBackupSnapshot
): Promise<void> {
  if (!snapshot.runtimeVisibility) {
    return;
  }

  const row = snapshot.runtimeVisibility;
  await client.query(
    `
      INSERT INTO runtime_visibility_snapshots (
        id, environment, worker_id, snapshot_json, last_heartbeat_at, last_cycle_at, last_seen_reload_nonce,
        last_applied_version_id, last_valid_version_id, degraded, degraded_reason, error_state, observed_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `,
    [
      row.id,
      row.environment,
      row.worker_id,
      toJson(row.snapshot_json),
      row.last_heartbeat_at,
      row.last_cycle_at ?? null,
      row.last_seen_reload_nonce ?? null,
      row.last_applied_version_id ?? null,
      row.last_valid_version_id ?? null,
      row.degraded,
      row.degraded_reason ?? null,
      row.error_state ?? null,
      row.observed_at,
      row.updated_at,
    ]
  );
}

async function restoreWorkerRestartState(
  client: Awaited<ReturnType<SchemaMigrationConnection["connect"]>>,
  snapshot: ControlPlaneBackupSnapshot
): Promise<void> {
  for (const row of snapshot.workerRestarts) {
    await client.query(
      `
        INSERT INTO worker_restart_requests (
          id, environment, request_key, actor, reason, target_version_id, target_service, target_worker,
          method, status, accepted, restart_required, restart_required_reason, requested_at, updated_at,
          deadline_at, rejection_reason, failure_reason, provider_status_code, provider_request_id,
          provider_message, convergence_observed_at, cleared_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
        )
      `,
      [
        row.id,
        row.environment,
        row.request_key ?? null,
        row.actor,
        row.reason ?? null,
        row.target_version_id ?? null,
        row.target_service,
        row.target_worker ?? null,
        row.method,
        row.status,
        row.accepted,
        row.restart_required,
        row.restart_required_reason ?? null,
        row.requested_at,
        row.updated_at,
        row.deadline_at ?? null,
        row.rejection_reason ?? null,
        row.failure_reason ?? null,
        row.provider_status_code ?? null,
        row.provider_request_id ?? null,
        row.provider_message ?? null,
        row.convergence_observed_at ?? null,
        row.cleared_at ?? null,
      ]
    );
  }

  for (const row of snapshot.restartAlerts.alerts) {
    await client.query(
      `
        INSERT INTO worker_restart_alerts (
          id, environment, dedupe_key, restart_request_id, worker_service, target_worker, target_version_id,
          source_category, reason_code, severity, status, summary, recommended_action, metadata_json,
          condition_signature, occurrence_count, first_seen_at, last_seen_at, last_evaluated_at,
          acknowledged_at, acknowledged_by, acknowledgment_note, resolved_at, resolved_by, resolution_note,
          last_restart_request_status, last_restart_request_updated_at, last_worker_heartbeat_at,
          last_applied_version_id, requested_version_id, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
        )
      `,
      [
        row.id,
        row.environment,
        row.dedupe_key,
        row.restart_request_id ?? null,
        row.worker_service,
        row.target_worker ?? null,
        row.target_version_id ?? null,
        row.source_category,
        row.reason_code,
        row.severity,
        row.status,
        row.summary,
        row.recommended_action,
        toJson(row.metadata_json),
        row.condition_signature,
        row.occurrence_count,
        row.first_seen_at,
        row.last_seen_at,
        row.last_evaluated_at,
        row.acknowledged_at ?? null,
        row.acknowledged_by ?? null,
        row.acknowledgment_note ?? null,
        row.resolved_at ?? null,
        row.resolved_by ?? null,
        row.resolution_note ?? null,
        row.last_restart_request_status ?? null,
        row.last_restart_request_updated_at ?? null,
        row.last_worker_heartbeat_at ?? null,
        row.last_applied_version_id ?? null,
        row.requested_version_id ?? null,
        row.created_at,
        row.updated_at,
      ]
    );
  }

  for (const row of snapshot.restartAlerts.events) {
    await client.query(
      `
        INSERT INTO worker_restart_alert_events (
          id, environment, alert_id, action, actor, accepted, before_status, after_status, reason_code, summary,
          note, metadata_json, notification_sink_name, notification_sink_type, notification_destination_name,
          notification_destination_type, notification_formatter_profile, notification_destination_priority,
          notification_destination_tags_json, notification_event_type, notification_status, notification_dedupe_key,
          notification_payload_fingerprint, notification_attempt_count, notification_failure_reason,
          notification_suppression_reason, notification_route_reason, notification_response_status,
          notification_response_body, notification_scope, created_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31
        )
      `,
      [
        row.id,
        row.environment,
        row.alert_id,
        row.action,
        row.actor,
        row.accepted,
        row.before_status ?? null,
        row.after_status ?? null,
        row.reason_code ?? null,
        row.summary ?? null,
        row.note ?? null,
        toJson(row.metadata_json),
        row.notification_sink_name ?? null,
        row.notification_sink_type ?? null,
        row.notification_destination_name ?? null,
        row.notification_destination_type ?? null,
        row.notification_formatter_profile ?? null,
        row.notification_destination_priority ?? null,
        toJson(row.notification_destination_tags_json),
        row.notification_event_type ?? null,
        row.notification_status ?? null,
        row.notification_dedupe_key ?? null,
        row.notification_payload_fingerprint ?? null,
        row.notification_attempt_count ?? null,
        row.notification_failure_reason ?? null,
        row.notification_suppression_reason ?? null,
        row.notification_route_reason ?? null,
        row.notification_response_status ?? null,
        row.notification_response_body ?? null,
        row.notification_scope ?? null,
        row.created_at,
      ]
    );
  }
}

async function restoreGovernanceState(
  client: Awaited<ReturnType<SchemaMigrationConnection["connect"]>>,
  snapshot: ControlPlaneBackupSnapshot
): Promise<void> {
  for (const row of snapshot.governance.audits) {
    await client.query(
      `
        INSERT INTO control_operator_audit_log (
          id, environment, action, target, result, actor_id, actor_display_name, actor_role, session_id,
          request_id, reason, note, created_at, event_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `,
      [
        row.id,
        row.environment,
        row.action,
        row.target,
        row.result,
        row.actor_id,
        row.actor_display_name,
        row.actor_role,
        row.session_id,
        row.request_id ?? null,
        row.reason ?? null,
        row.note ?? null,
        row.created_at,
        toJson(row.event_json),
      ]
    );
  }

  for (const row of snapshot.governance.livePromotions) {
    await client.query(
      `
        INSERT INTO control_live_promotions (
          id, environment, target_mode, workflow_status, application_status, requested_at, updated_at, record_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [
        row.id,
        row.environment,
        row.target_mode,
        row.workflow_status,
        row.application_status,
        row.requested_at,
        row.updated_at,
        toJson(row.record_json),
      ]
    );
  }
}

export async function restoreControlPlaneBackup(
  connection: SchemaMigrationConnection,
  snapshot: ControlPlaneBackupSnapshot
): Promise<void> {
  ensureSnapshotEnvironment(snapshot);
  await assertSchemaReady(connection);

  await withClient(connection, async (client) => {
    await client.query("BEGIN");
    try {
      await deleteEnvironmentRows(client, snapshot.environment);
      await restoreRuntimeConfig(client, snapshot);
      await restoreRuntimeVisibility(client, snapshot);
      await restoreWorkerRestartState(client, snapshot);
      await restoreGovernanceState(client, snapshot);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
}

export async function validateControlPlaneBackupRoundTrip(
  connection: SchemaMigrationConnection,
  snapshot: ControlPlaneBackupSnapshot
): Promise<ControlPlaneBackupRoundTripValidationResult> {
  const before = summarizeControlPlaneBackup(snapshot);
  await restoreControlPlaneBackup(connection, snapshot);
  const restored = await captureControlPlaneBackup(connection, snapshot.environment, {
    migrationsDir: snapshot.schemaStatus.migrationsDir,
  });
  const after = summarizeControlPlaneBackup(restored);

  const metadataMismatches: string[] = [];
  if (before.environment !== after.environment) {
    metadataMismatches.push("environment");
  }
  if (before.schemaState !== after.schemaState) {
    metadataMismatches.push("schema_state");
  }

  const countMismatchTables = CANONICAL_TABLE_NAMES.filter((tableName) => {
    const countKey = SUMMARY_COUNT_KEY_BY_TABLE[tableName];
    return before.counts[countKey] !== after.counts[countKey];
  });
  if (before.totalRecords !== after.totalRecords) {
    metadataMismatches.push("total_records");
  }
  const countsMatched = countMismatchTables.length === 0 && before.totalRecords === after.totalRecords;

  const beforeRows = extractCanonicalRows(snapshot);
  const afterRows = extractCanonicalRows(restored);
  const mismatchTables = CANONICAL_TABLE_NAMES.filter((tableName) => hashRows(beforeRows[tableName]) !== hashRows(afterRows[tableName]));
  const contentMatched = mismatchTables.length === 0;

  const status: ControlPlaneBackupValidationStatus =
    countsMatched && metadataMismatches.length === 0 && contentMatched
      ? "exact_match"
      : countsMatched && metadataMismatches.length === 0
        ? "content_mismatch"
        : "count_or_metadata_mismatch";

  return {
    before,
    after,
    matched: status === "exact_match",
    countsMatched,
    contentMatched,
    status,
    mismatchTables,
    countMismatchTables,
    metadataMismatches,
  };
}
