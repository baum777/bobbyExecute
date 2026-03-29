import { describe, expect, it } from "vitest";
import { migrateSchema, type SchemaMigrationClient, type SchemaMigrationConnection, type SchemaMigrationRow } from "../../src/persistence/schema-migrations.js";
import {
  captureControlPlaneBackup,
  restoreControlPlaneBackup,
  summarizeControlPlaneBackup,
  validateControlPlaneBackupRoundTrip,
  type ControlPlaneBackupSnapshot,
} from "../../src/recovery/control-plane-backup.js";

type DbRow = Record<string, unknown>;

class MemoryControlPlaneClient implements SchemaMigrationClient {
  constructor(private readonly state: MemoryControlPlaneState) {}

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: readonly unknown[] = []
  ): Promise<{ rows: T[] }> {
    const sql = text.trim();

    if (sql.startsWith("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present")) {
      return { rows: [{ present: this.state.schemaPresent } as T] };
    }

    if (sql.startsWith("SELECT version, name, checksum, applied_at FROM schema_migrations")) {
      return {
        rows: [...this.state.appliedRows]
          .sort((left, right) => left.version.localeCompare(right.version))
          .map((row) => ({ ...row }) as T),
      };
    }

    if (sql.startsWith("CREATE TABLE IF NOT EXISTS schema_migrations")) {
      this.state.schemaPresent = true;
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO schema_migrations")) {
      const [version, name, checksum] = params as [string, string, string];
      const next: SchemaMigrationRow = {
        version,
        name,
        checksum,
        applied_at: new Date().toISOString(),
      };
      const existing = this.state.appliedRows.find((row) => row.version === version);
      if (existing) {
        Object.assign(existing, next);
      } else {
        this.state.appliedRows.push(next);
      }
      return { rows: [] };
    }

    if (
      sql === "BEGIN" ||
      sql === "COMMIT" ||
      sql === "ROLLBACK" ||
      sql.startsWith("SELECT pg_advisory_xact_lock(") ||
      sql.startsWith("CREATE TABLE IF NOT EXISTS") ||
      sql.startsWith("CREATE INDEX IF NOT EXISTS") ||
      sql.startsWith("ALTER TABLE")
    ) {
      return { rows: [] };
    }

    if (sql.startsWith("DELETE FROM ")) {
      const match = sql.match(/^DELETE FROM ([a-z_]+) WHERE environment = \$1/i);
      if (!match) {
        throw new Error(`Unexpected delete SQL: ${sql}`);
      }
      this.state.deleteEnvironment(match[1], String(params[0] ?? ""));
      return { rows: [] };
    }

    if (sql.startsWith("SELECT * FROM ")) {
      const match = sql.match(/^SELECT \* FROM ([a-z_]+) WHERE environment = \$1/i);
      if (!match) {
        throw new Error(`Unexpected select SQL: ${sql}`);
      }
      const table = match[1];
      const rows = this.state.selectEnvironment(table, String(params[0] ?? ""));
      if (/LIMIT 1/i.test(sql)) {
        return { rows: (rows[0] ? [{ ...rows[0] }] : []) as T[] };
      }
      return { rows: rows.map((row) => ({ ...row }) as T) };
    }

    if (sql.startsWith("INSERT INTO runtime_config_versions")) {
      const row = mapRuntimeConfigVersion(params);
      this.state.tables.runtime_config_versions.push(row);
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO runtime_config_active")) {
      const row = mapRuntimeConfigActive(params);
      this.state.tables.runtime_config_active.push(row);
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO config_change_log")) {
      const row = mapConfigChangeLog(params);
      this.state.tables.config_change_log.push(row);
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO runtime_visibility_snapshots")) {
      const row = mapRuntimeVisibility(params);
      this.state.tables.runtime_visibility_snapshots.push(row);
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO worker_restart_requests")) {
      const row = mapWorkerRestartRequest(params);
      this.state.tables.worker_restart_requests.push(row);
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO worker_restart_alerts")) {
      const row = mapWorkerRestartAlert(params);
      this.state.tables.worker_restart_alerts.push(row);
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO worker_restart_alert_events")) {
      const row = mapWorkerRestartAlertEvent(params);
      this.state.tables.worker_restart_alert_events.push(row);
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO control_operator_audit_log")) {
      const row = mapControlAuditEvent(params);
      this.state.tables.control_operator_audit_log.push(row);
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO control_live_promotions")) {
      const row = mapControlLivePromotion(params);
      this.state.tables.control_live_promotions.push(row);
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL in recovery test: ${sql}`);
  }

  release(): void {}
}

interface MemoryControlPlaneState {
  schemaPresent: boolean;
  appliedRows: SchemaMigrationRow[];
  tables: {
    runtime_config_versions: DbRow[];
    runtime_config_active: DbRow[];
    config_change_log: DbRow[];
    runtime_visibility_snapshots: DbRow[];
    worker_restart_requests: DbRow[];
    worker_restart_alerts: DbRow[];
    worker_restart_alert_events: DbRow[];
    control_operator_audit_log: DbRow[];
    control_live_promotions: DbRow[];
  };
  deleteEnvironment(table: keyof MemoryControlPlaneState["tables"], environment: string): void;
  selectEnvironment(table: keyof MemoryControlPlaneState["tables"], environment: string): DbRow[];
}

class MemoryControlPlaneConnection implements SchemaMigrationConnection {
  readonly state: MemoryControlPlaneState = {
    schemaPresent: false,
    appliedRows: [],
    tables: {
      runtime_config_versions: [],
      runtime_config_active: [],
      config_change_log: [],
      runtime_visibility_snapshots: [],
      worker_restart_requests: [],
      worker_restart_alerts: [],
      worker_restart_alert_events: [],
      control_operator_audit_log: [],
      control_live_promotions: [],
    },
    deleteEnvironment(table: keyof MemoryControlPlaneState["tables"], environment: string) {
      this.tables[table] = this.tables[table].filter((row) => row.environment !== environment);
    },
    selectEnvironment(table: keyof MemoryControlPlaneState["tables"], environment: string) {
      return this.tables[table].filter((row) => row.environment === environment);
    },
  };

  async connect(): Promise<SchemaMigrationClient> {
    return new MemoryControlPlaneClient(this.state);
  }
}

class CorruptingMemoryControlPlaneClient extends MemoryControlPlaneClient {
  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: readonly unknown[] = []
  ): Promise<{ rows: T[] }> {
    const sql = text.trim();
    if (sql.startsWith("INSERT INTO runtime_config_versions")) {
      const corrupted = [...params];
      const originalHash = typeof corrupted[5] === "string" ? corrupted[5] : "unknown-hash";
      corrupted[5] = `${originalHash}-corrupted`;
      return super.query<T>(text, corrupted);
    }
    return super.query<T>(text, params);
  }
}

class CorruptingMemoryControlPlaneConnection extends MemoryControlPlaneConnection {
  async connect(): Promise<SchemaMigrationClient> {
    return new CorruptingMemoryControlPlaneClient(this.state);
  }
}

function mapRuntimeConfigVersion(params: readonly unknown[]): DbRow {
  const [id, environment, version_number, schema_version, config_json, config_hash, previous_version_id, status, created_by, reason, created_at, activated_at, activated_by, applied_at, applied_by] =
    params;
  return {
    id,
    environment,
    version_number,
    schema_version,
    config_json,
    config_hash,
    previous_version_id,
    status,
    created_by,
    reason,
    created_at,
    activated_at,
    activated_by,
    applied_at,
    applied_by,
  };
}

function mapRuntimeConfigActive(params: readonly unknown[]): DbRow {
  const [environment, active_version_id, requested_version_id, applied_version_id, last_valid_version_id, reload_nonce, paused, pause_scope, pause_reason, kill_switch, kill_switch_reason, pending_apply, pending_reason, requires_restart, requested_at, applied_at, updated_at] =
    params;
  return {
    environment,
    active_version_id,
    requested_version_id,
    applied_version_id,
    last_valid_version_id,
    reload_nonce,
    paused,
    pause_scope,
    pause_reason,
    kill_switch,
    kill_switch_reason,
    pending_apply,
    pending_reason,
    requires_restart,
    requested_at,
    applied_at,
    updated_at,
  };
}

function mapConfigChangeLog(params: readonly unknown[]): DbRow {
  const [id, environment, version_id, action, actor, accepted, before_config, after_config, before_overlay, after_overlay, reason, rejection_reason, result_version_id, reload_nonce, created_at] =
    params;
  return {
    id,
    environment,
    version_id,
    action,
    actor,
    accepted,
    before_config,
    after_config,
    before_overlay,
    after_overlay,
    reason,
    rejection_reason,
    result_version_id,
    reload_nonce,
    created_at,
  };
}

function mapRuntimeVisibility(params: readonly unknown[]): DbRow {
  const [id, environment, worker_id, snapshot_json, last_heartbeat_at, last_cycle_at, last_seen_reload_nonce, last_applied_version_id, last_valid_version_id, degraded, degraded_reason, error_state, observed_at, updated_at] =
    params;
  return {
    id,
    environment,
    worker_id,
    snapshot_json,
    last_heartbeat_at,
    last_cycle_at,
    last_seen_reload_nonce,
    last_applied_version_id,
    last_valid_version_id,
    degraded,
    degraded_reason,
    error_state,
    observed_at,
    updated_at,
  };
}

function mapWorkerRestartRequest(params: readonly unknown[]): DbRow {
  const [id, environment, request_key, actor, reason, target_version_id, target_service, target_worker, method, status, accepted, restart_required, restart_required_reason, requested_at, updated_at, deadline_at, rejection_reason, failure_reason, provider_status_code, provider_request_id, provider_message, convergence_observed_at, cleared_at] =
    params;
  return {
    id,
    environment,
    request_key,
    actor,
    reason,
    target_version_id,
    target_service,
    target_worker,
    method,
    status,
    accepted,
    restart_required,
    restart_required_reason,
    requested_at,
    updated_at,
    deadline_at,
    rejection_reason,
    failure_reason,
    provider_status_code,
    provider_request_id,
    provider_message,
    convergence_observed_at,
    cleared_at,
  };
}

function mapWorkerRestartAlert(params: readonly unknown[]): DbRow {
  const [id, environment, dedupe_key, restart_request_id, worker_service, target_worker, target_version_id, source_category, reason_code, severity, status, summary, recommended_action, metadata_json, condition_signature, occurrence_count, first_seen_at, last_seen_at, last_evaluated_at, acknowledged_at, acknowledged_by, acknowledgment_note, resolved_at, resolved_by, resolution_note, last_restart_request_status, last_restart_request_updated_at, last_worker_heartbeat_at, last_applied_version_id, requested_version_id, created_at, updated_at] =
    params;
  return {
    id,
    environment,
    dedupe_key,
    restart_request_id,
    worker_service,
    target_worker,
    target_version_id,
    source_category,
    reason_code,
    severity,
    status,
    summary,
    recommended_action,
    metadata_json,
    condition_signature,
    occurrence_count,
    first_seen_at,
    last_seen_at,
    last_evaluated_at,
    acknowledged_at,
    acknowledged_by,
    acknowledgment_note,
    resolved_at,
    resolved_by,
    resolution_note,
    last_restart_request_status,
    last_restart_request_updated_at,
    last_worker_heartbeat_at,
    last_applied_version_id,
    requested_version_id,
    created_at,
    updated_at,
  };
}

function mapWorkerRestartAlertEvent(params: readonly unknown[]): DbRow {
  const [id, environment, alert_id, action, actor, accepted, before_status, after_status, reason_code, summary, note, metadata_json, notification_sink_name, notification_sink_type, notification_destination_name, notification_destination_type, notification_formatter_profile, notification_destination_priority, notification_destination_tags_json, notification_event_type, notification_status, notification_dedupe_key, notification_payload_fingerprint, notification_attempt_count, notification_failure_reason, notification_suppression_reason, notification_route_reason, notification_response_status, notification_response_body, notification_scope, created_at] =
    params;
  return {
    id,
    environment,
    alert_id,
    action,
    actor,
    accepted,
    before_status,
    after_status,
    reason_code,
    summary,
    note,
    metadata_json,
    notification_sink_name,
    notification_sink_type,
    notification_destination_name,
    notification_destination_type,
    notification_formatter_profile,
    notification_destination_priority,
    notification_destination_tags_json,
    notification_event_type,
    notification_status,
    notification_dedupe_key,
    notification_payload_fingerprint,
    notification_attempt_count,
    notification_failure_reason,
    notification_suppression_reason,
    notification_route_reason,
    notification_response_status,
    notification_response_body,
    notification_scope,
    created_at,
  };
}

function mapControlAuditEvent(params: readonly unknown[]): DbRow {
  const [id, environment, action, target, result, actor_id, actor_display_name, actor_role, session_id, request_id, reason, note, created_at, event_json] =
    params;
  return {
    id,
    environment,
    action,
    target,
    result,
    actor_id,
    actor_display_name,
    actor_role,
    session_id,
    request_id,
    reason,
    note,
    created_at,
    event_json,
  };
}

function mapControlLivePromotion(params: readonly unknown[]): DbRow {
  const [id, environment, target_mode, workflow_status, application_status, requested_at, updated_at, record_json] =
    params;
  return {
    id,
    environment,
    target_mode,
    workflow_status,
    application_status,
    requested_at,
    updated_at,
    record_json,
  };
}

function seedSampleState(connection: MemoryControlPlaneConnection, environment: string): void {
  const { tables } = connection.state;
  tables.runtime_config_versions.push({
    id: "runtime-config-v1",
    environment,
    version_number: 1,
    schema_version: 1,
    config_json: { mode: "paper" },
    config_hash: "hash-1",
    previous_version_id: null,
    status: "active",
    created_by: "bootstrap",
    reason: "seed",
    created_at: "2026-03-28T00:00:00.000Z",
    activated_at: "2026-03-28T00:00:00.000Z",
    activated_by: "bootstrap",
    applied_at: "2026-03-28T00:00:00.000Z",
    applied_by: "bootstrap",
  });
  tables.runtime_config_active.push({
    environment,
    active_version_id: "runtime-config-v1",
    requested_version_id: "runtime-config-v1",
    applied_version_id: "runtime-config-v1",
    last_valid_version_id: "runtime-config-v1",
    reload_nonce: 0,
    paused: false,
    pause_scope: null,
    pause_reason: null,
    kill_switch: false,
    kill_switch_reason: null,
    pending_apply: false,
    pending_reason: null,
    requires_restart: false,
    requested_at: "2026-03-28T00:00:00.000Z",
    applied_at: "2026-03-28T00:00:00.000Z",
    updated_at: "2026-03-28T00:00:00.000Z",
  });
  tables.config_change_log.push({
    id: "change-1",
    environment,
    version_id: "runtime-config-v1",
    action: "seed",
    actor: "bootstrap",
    accepted: true,
    before_config: null,
    after_config: { mode: "paper" },
    before_overlay: null,
    after_overlay: { reloadNonce: 0, paused: false, killSwitch: false, pendingRestart: false },
    reason: "seed",
    rejection_reason: null,
    result_version_id: "runtime-config-v1",
    reload_nonce: 0,
    created_at: "2026-03-28T00:00:00.000Z",
  });
  tables.runtime_visibility_snapshots.push({
    id: "visibility-1",
    environment,
    worker_id: "worker-1",
    snapshot_json: {
      environment,
      worker: { workerId: "worker-1", lastHeartbeatAt: "2026-03-28T00:00:00.000Z", degraded: false, observedAt: "2026-03-28T00:00:00.000Z" },
      runtime: { status: "running", mode: "paper" },
      metrics: { cycleCount: 1 },
    },
    last_heartbeat_at: "2026-03-28T00:00:00.000Z",
    last_cycle_at: "2026-03-28T00:00:00.000Z",
    last_seen_reload_nonce: 0,
    last_applied_version_id: "runtime-config-v1",
    last_valid_version_id: "runtime-config-v1",
    degraded: false,
    degraded_reason: null,
    error_state: null,
    observed_at: "2026-03-28T00:00:00.000Z",
    updated_at: "2026-03-28T00:00:00.000Z",
  });
  tables.worker_restart_requests.push({
    id: "restart-1",
    environment,
    request_key: "restart-request-key",
    actor: "operator",
    reason: "roll out runtime",
    target_version_id: "runtime-config-v1",
    target_service: "worker-service",
    target_worker: "worker-1",
    method: "deploy_hook",
    status: "dispatched",
    accepted: true,
    restart_required: true,
    restart_required_reason: "mode change",
    requested_at: "2026-03-28T00:01:00.000Z",
    updated_at: "2026-03-28T00:02:00.000Z",
    deadline_at: "2026-03-28T00:05:00.000Z",
    rejection_reason: null,
    failure_reason: null,
    provider_status_code: 202,
    provider_request_id: "provider-1",
    provider_message: "accepted",
    convergence_observed_at: "2026-03-28T00:03:00.000Z",
    cleared_at: null,
  });
  tables.worker_restart_alerts.push({
    id: "alert-1",
    environment,
    dedupe_key: "alert-dedupe",
    restart_request_id: "restart-1",
    worker_service: "worker-service",
    target_worker: "worker-1",
    target_version_id: "runtime-config-v1",
    source_category: "restart_timeout",
    reason_code: "timeout",
    severity: "critical",
    status: "open",
    summary: "Worker restart timed out",
    recommended_action: "inspect worker",
    metadata_json: { severity: "critical" },
    condition_signature: "sig-1",
    occurrence_count: 1,
    first_seen_at: "2026-03-28T00:02:00.000Z",
    last_seen_at: "2026-03-28T00:02:00.000Z",
    last_evaluated_at: "2026-03-28T00:02:00.000Z",
    acknowledged_at: null,
    acknowledged_by: null,
    acknowledgment_note: null,
    resolved_at: null,
    resolved_by: null,
    resolution_note: null,
    last_restart_request_status: "dispatched",
    last_restart_request_updated_at: "2026-03-28T00:02:00.000Z",
    last_worker_heartbeat_at: "2026-03-28T00:00:00.000Z",
    last_applied_version_id: "runtime-config-v1",
    requested_version_id: "runtime-config-v1",
    created_at: "2026-03-28T00:02:00.000Z",
    updated_at: "2026-03-28T00:02:00.000Z",
  });
  tables.worker_restart_alert_events.push({
    id: "event-1",
    environment,
    alert_id: "alert-1",
    action: "opened",
    actor: "system",
    accepted: true,
    before_status: null,
    after_status: "open",
    reason_code: "timeout",
    summary: "Worker restart timed out",
    note: "wait for convergence",
    metadata_json: { source: "test" },
    notification_sink_name: "primary",
    notification_sink_type: "webhook",
    notification_destination_name: "ops",
    notification_destination_type: "webhook",
    notification_formatter_profile: "default",
    notification_destination_priority: 1,
    notification_destination_tags_json: ["ops"],
    notification_event_type: "alert_opened",
    notification_status: "sent",
    notification_dedupe_key: "dedupe-1",
    notification_payload_fingerprint: "fingerprint-1",
    notification_attempt_count: 1,
    notification_failure_reason: null,
    notification_suppression_reason: null,
    notification_route_reason: "critical alert",
    notification_response_status: 200,
    notification_response_body: "ok",
    notification_scope: "external",
    created_at: "2026-03-28T00:02:05.000Z",
  });
  tables.control_operator_audit_log.push({
    id: "audit-1",
    environment,
    action: "restart_worker",
    target: "/control/restart-worker",
    result: "allowed",
    actor_id: "operator-1",
    actor_display_name: "Operator One",
    actor_role: "admin",
    session_id: "session-1",
    request_id: "request-1",
    reason: "roll out runtime",
    note: "allowed",
    created_at: "2026-03-28T00:01:30.000Z",
    event_json: { action: "restart_worker" },
  });
  tables.control_live_promotions.push({
    id: "promotion-1",
    environment,
    target_mode: "live_limited",
    workflow_status: "approved",
    application_status: "pending_restart",
    requested_at: "2026-03-28T00:01:10.000Z",
    updated_at: "2026-03-28T00:01:20.000Z",
    record_json: {
      id: "promotion-1",
      environment,
      targetMode: "live_limited",
      workflowStatus: "approved",
      applicationStatus: "pending_restart",
    },
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("control-plane recovery backup", () => {
  it("captures, restores, and validates the Postgres-backed control state snapshot", async () => {
    const environment = "recovery-test";
    const connection = new MemoryControlPlaneConnection();
    await migrateSchema(connection);
    seedSampleState(connection, environment);

    const snapshot = await captureControlPlaneBackup(connection, environment);
    const summary = summarizeControlPlaneBackup(snapshot);
    expect(summary.environment).toBe(environment);
    expect(summary.counts.runtimeConfigVersions).toBe(1);
    expect(summary.counts.workerRestarts).toBe(1);
    expect(summary.counts.restartAlerts).toBe(1);
    expect(summary.counts.governanceAudits).toBe(1);

    connection.state.tables.runtime_config_versions = [];
    connection.state.tables.runtime_config_active = [];
    connection.state.tables.config_change_log = [];
    connection.state.tables.runtime_visibility_snapshots = [];
    connection.state.tables.worker_restart_requests = [];
    connection.state.tables.worker_restart_alerts = [];
    connection.state.tables.worker_restart_alert_events = [];
    connection.state.tables.control_operator_audit_log = [];
    connection.state.tables.control_live_promotions = [];

    await restoreControlPlaneBackup(connection, snapshot);

    const restored = await captureControlPlaneBackup(connection, environment);
    const restoredSummary = summarizeControlPlaneBackup(restored);
    expect(restoredSummary).toMatchObject({
      environment,
      schemaState: summary.schemaState,
      counts: summary.counts,
      totalRecords: summary.totalRecords,
    });
    expect(restoredSummary.capturedAt).not.toBe(summary.capturedAt);
    expect(restored.runtimeConfig.versions[0]?.id).toBe("runtime-config-v1");
    expect(restored.workerRestarts[0]?.request_key).toBe("restart-request-key");
    expect(restored.restartAlerts.events[0]?.notification_destination_name).toBe("ops");

    const validation = await validateControlPlaneBackupRoundTrip(connection, clone(snapshot));
    expect(validation.matched).toBe(true);
    expect(validation.status).toBe("exact_match");
    expect(validation.countsMatched).toBe(true);
    expect(validation.contentMatched).toBe(true);
    expect(validation.mismatchTables).toHaveLength(0);
    expect(validation.after.counts.runtimeConfigVersions).toBe(1);
  });

  it("fails semantic validation when restored content differs despite matching counts", async () => {
    const environment = "recovery-content-mismatch";
    const connection = new CorruptingMemoryControlPlaneConnection();
    await migrateSchema(connection);
    seedSampleState(connection, environment);

    const snapshot = await captureControlPlaneBackup(connection, environment);
    const validation = await validateControlPlaneBackupRoundTrip(connection, clone(snapshot));

    expect(validation.matched).toBe(false);
    expect(validation.countsMatched).toBe(true);
    expect(validation.contentMatched).toBe(false);
    expect(validation.status).toBe("content_mismatch");
    expect(validation.mismatchTables).toContain("runtime_config_versions");
  });
});
