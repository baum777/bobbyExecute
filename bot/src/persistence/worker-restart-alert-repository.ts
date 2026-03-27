import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { WorkerRestartRecordStatus } from "./worker-restart-repository.js";

export type WorkerRestartAlertSeverity = "info" | "warning" | "critical";
export type WorkerRestartAlertStatus = "open" | "acknowledged" | "resolved";
export type WorkerRestartAlertSourceCategory =
  | "orchestration_failure"
  | "restart_timeout"
  | "missing_worker_heartbeat"
  | "applied_version_stalled"
  | "repeated_restart_failures"
  | "convergence_timeout";

export interface WorkerRestartAlertRecord {
  id: string;
  environment: string;
  dedupeKey: string;
  restartRequestId?: string;
  workerService: string;
  targetWorker?: string;
  targetVersionId?: string;
  sourceCategory: WorkerRestartAlertSourceCategory;
  reasonCode: string;
  severity: WorkerRestartAlertSeverity;
  status: WorkerRestartAlertStatus;
  summary: string;
  recommendedAction: string;
  metadata?: Record<string, unknown>;
  conditionSignature: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastEvaluatedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  acknowledgmentNote?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  lastRestartRequestStatus?: WorkerRestartRecordStatus;
  lastRestartRequestUpdatedAt?: string;
  lastWorkerHeartbeatAt?: string;
  lastAppliedVersionId?: string;
  requestedVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerRestartAlertEventRecord {
  id: string;
  environment: string;
  alertId: string;
  action:
    | "opened"
    | "updated"
    | "escalated"
    | "reopened"
    | "acknowledged"
    | "acknowledge_rejected"
    | "resolved"
    | "resolve_rejected"
    | "notification_failed";
  actor: string;
  accepted: boolean;
  beforeStatus?: WorkerRestartAlertStatus;
  afterStatus?: WorkerRestartAlertStatus;
  reasonCode?: string;
  summary?: string;
  note?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface WorkerRestartAlertRepository {
  kind: "postgres" | "memory";
  ensureSchema(): Promise<void>;
  load(environment: string, id: string): Promise<WorkerRestartAlertRecord | null>;
  loadByDedupeKey(environment: string, dedupeKey: string): Promise<WorkerRestartAlertRecord | null>;
  list(environment: string, limit?: number): Promise<WorkerRestartAlertRecord[]>;
  listOpen(environment: string, limit?: number): Promise<WorkerRestartAlertRecord[]>;
  save(record: WorkerRestartAlertRecord): Promise<WorkerRestartAlertRecord>;
  recordEvent(record: WorkerRestartAlertEventRecord): Promise<WorkerRestartAlertEventRecord>;
  listEvents(environment: string, alertId: string, limit?: number): Promise<WorkerRestartAlertEventRecord[]>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mapRecord(row: Record<string, unknown>): WorkerRestartAlertRecord {
  return {
    id: String(row.id),
    environment: String(row.environment),
    dedupeKey: String(row.dedupe_key),
    restartRequestId: row.restart_request_id == null ? undefined : String(row.restart_request_id),
    workerService: String(row.worker_service),
    targetWorker: row.target_worker == null ? undefined : String(row.target_worker),
    targetVersionId: row.target_version_id == null ? undefined : String(row.target_version_id),
    sourceCategory: String(row.source_category) as WorkerRestartAlertSourceCategory,
    reasonCode: String(row.reason_code),
    severity: String(row.severity) as WorkerRestartAlertSeverity,
    status: String(row.status) as WorkerRestartAlertStatus,
    summary: String(row.summary),
    recommendedAction: String(row.recommended_action),
    metadata: row.metadata_json == null ? undefined : clone(row.metadata_json as Record<string, unknown>),
    conditionSignature: String(row.condition_signature),
    occurrenceCount: Number(row.occurrence_count),
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    lastEvaluatedAt: String(row.last_evaluated_at),
    acknowledgedAt: row.acknowledged_at == null ? undefined : String(row.acknowledged_at),
    acknowledgedBy: row.acknowledged_by == null ? undefined : String(row.acknowledged_by),
    acknowledgmentNote: row.acknowledgment_note == null ? undefined : String(row.acknowledgment_note),
    resolvedAt: row.resolved_at == null ? undefined : String(row.resolved_at),
    resolvedBy: row.resolved_by == null ? undefined : String(row.resolved_by),
    resolutionNote: row.resolution_note == null ? undefined : String(row.resolution_note),
    lastRestartRequestStatus:
      row.last_restart_request_status == null
        ? undefined
        : (String(row.last_restart_request_status) as WorkerRestartRecordStatus),
    lastRestartRequestUpdatedAt:
      row.last_restart_request_updated_at == null ? undefined : String(row.last_restart_request_updated_at),
    lastWorkerHeartbeatAt: row.last_worker_heartbeat_at == null ? undefined : String(row.last_worker_heartbeat_at),
    lastAppliedVersionId: row.last_applied_version_id == null ? undefined : String(row.last_applied_version_id),
    requestedVersionId: row.requested_version_id == null ? undefined : String(row.requested_version_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapEvent(row: Record<string, unknown>): WorkerRestartAlertEventRecord {
  return {
    id: String(row.id),
    environment: String(row.environment),
    alertId: String(row.alert_id),
    action: String(row.action) as WorkerRestartAlertEventRecord["action"],
    actor: String(row.actor),
    accepted: Boolean(row.accepted),
    beforeStatus: row.before_status == null ? undefined : (String(row.before_status) as WorkerRestartAlertStatus),
    afterStatus: row.after_status == null ? undefined : (String(row.after_status) as WorkerRestartAlertStatus),
    reasonCode: row.reason_code == null ? undefined : String(row.reason_code),
    summary: row.summary == null ? undefined : String(row.summary),
    note: row.note == null ? undefined : String(row.note),
    metadata: row.metadata_json == null ? undefined : clone(row.metadata_json as Record<string, unknown>),
    createdAt: String(row.created_at),
  };
}

function buildRecord(record: WorkerRestartAlertRecord): WorkerRestartAlertRecord {
  return clone(record);
}

function buildEvent(record: WorkerRestartAlertEventRecord): WorkerRestartAlertEventRecord {
  return clone(record);
}

export class InMemoryWorkerRestartAlertRepository implements WorkerRestartAlertRepository {
  kind = "memory" as const;

  private readonly alerts = new Map<string, Map<string, WorkerRestartAlertRecord>>();
  private readonly events = new Map<string, WorkerRestartAlertEventRecord[]>();

  async ensureSchema(): Promise<void> {
    return;
  }

  private getEnvironmentAlerts(environment: string): Map<string, WorkerRestartAlertRecord> {
    const existing = this.alerts.get(environment);
    if (existing) {
      return existing;
    }

    const created = new Map<string, WorkerRestartAlertRecord>();
    this.alerts.set(environment, created);
    return created;
  }

  private getEnvironmentEvents(environment: string): WorkerRestartAlertEventRecord[] {
    const existing = this.events.get(environment);
    if (existing) {
      return existing;
    }

    const created: WorkerRestartAlertEventRecord[] = [];
    this.events.set(environment, created);
    return created;
  }

  async load(environment: string, id: string): Promise<WorkerRestartAlertRecord | null> {
    const alerts = this.getEnvironmentAlerts(environment);
    for (const record of alerts.values()) {
      if (record.id === id) {
        return buildRecord(record);
      }
    }
    return null;
  }

  async loadByDedupeKey(environment: string, dedupeKey: string): Promise<WorkerRestartAlertRecord | null> {
    const alerts = this.getEnvironmentAlerts(environment);
    const record = alerts.get(dedupeKey);
    return record ? buildRecord(record) : null;
  }

  async list(environment: string, limit = 100): Promise<WorkerRestartAlertRecord[]> {
    const alerts = this.getEnvironmentAlerts(environment);
    return [...alerts.values()]
      .sort((left, right) => {
        const leftTime = Date.parse(left.lastSeenAt ?? left.updatedAt ?? left.firstSeenAt);
        const rightTime = Date.parse(right.lastSeenAt ?? right.updatedAt ?? right.firstSeenAt);
        return rightTime - leftTime;
      })
      .slice(0, limit)
      .map((record) => buildRecord(record));
  }

  async listOpen(environment: string, limit = 100): Promise<WorkerRestartAlertRecord[]> {
    return (await this.list(environment, limit)).filter((record) => record.status !== "resolved");
  }

  async save(record: WorkerRestartAlertRecord): Promise<WorkerRestartAlertRecord> {
    const alerts = this.getEnvironmentAlerts(record.environment);
    alerts.set(record.dedupeKey, buildRecord(record));
    return buildRecord(record);
  }

  async recordEvent(record: WorkerRestartAlertEventRecord): Promise<WorkerRestartAlertEventRecord> {
    const events = this.getEnvironmentEvents(record.environment);
    events.push(buildEvent(record));
    return buildEvent(record);
  }

  async listEvents(environment: string, alertId: string, limit = 100): Promise<WorkerRestartAlertEventRecord[]> {
    const events = this.getEnvironmentEvents(environment);
    return events
      .filter((event) => event.alertId === alertId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, limit)
      .map((event) => buildEvent(event));
  }
}

export class PostgresWorkerRestartAlertRepository implements WorkerRestartAlertRepository {
  kind = "postgres" as const;

  constructor(private readonly pool: Pool) {}

  private async withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await work(client);
    } finally {
      client.release();
    }
  }

  async ensureSchema(): Promise<void> {
    await this.withClient(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS worker_restart_alerts (
          id text PRIMARY KEY,
          environment text NOT NULL,
          dedupe_key text NOT NULL,
          restart_request_id text,
          worker_service text NOT NULL,
          target_worker text,
          target_version_id text,
          source_category text NOT NULL,
          reason_code text NOT NULL,
          severity text NOT NULL,
          status text NOT NULL,
          summary text NOT NULL,
          recommended_action text NOT NULL,
          metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
          condition_signature text NOT NULL,
          occurrence_count integer NOT NULL DEFAULT 1,
          first_seen_at timestamptz NOT NULL,
          last_seen_at timestamptz NOT NULL,
          last_evaluated_at timestamptz NOT NULL,
          acknowledged_at timestamptz,
          acknowledged_by text,
          acknowledgment_note text,
          resolved_at timestamptz,
          resolved_by text,
          resolution_note text,
          last_restart_request_status text,
          last_restart_request_updated_at timestamptz,
          last_worker_heartbeat_at timestamptz,
          last_applied_version_id text,
          requested_version_id text,
          created_at timestamptz NOT NULL,
          updated_at timestamptz NOT NULL
        )
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS worker_restart_alerts_environment_dedupe_key_idx
        ON worker_restart_alerts (environment, dedupe_key)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS worker_restart_alerts_environment_status_updated_idx
        ON worker_restart_alerts (environment, status, updated_at DESC)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS worker_restart_alerts_environment_request_idx
        ON worker_restart_alerts (environment, restart_request_id)
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS worker_restart_alert_events (
          id text PRIMARY KEY,
          environment text NOT NULL,
          alert_id text NOT NULL REFERENCES worker_restart_alerts (id) ON DELETE CASCADE,
          action text NOT NULL,
          actor text NOT NULL,
          accepted boolean NOT NULL DEFAULT true,
          before_status text,
          after_status text,
          reason_code text,
          summary text,
          note text,
          metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS worker_restart_alert_events_environment_alert_idx
        ON worker_restart_alert_events (environment, alert_id, created_at DESC)
      `);
    });
  }

  async load(environment: string, id: string): Promise<WorkerRestartAlertRecord | null> {
    const result = await this.withClient((client) =>
      client.query(
        `
          SELECT *
          FROM worker_restart_alerts
          WHERE environment = $1 AND id = $2
          LIMIT 1
        `,
        [environment, id]
      )
    );
    const row = result.rows[0];
    return row ? mapRecord(row as Record<string, unknown>) : null;
  }

  async loadByDedupeKey(environment: string, dedupeKey: string): Promise<WorkerRestartAlertRecord | null> {
    const result = await this.withClient((client) =>
      client.query(
        `
          SELECT *
          FROM worker_restart_alerts
          WHERE environment = $1 AND dedupe_key = $2
          LIMIT 1
        `,
        [environment, dedupeKey]
      )
    );
    const row = result.rows[0];
    return row ? mapRecord(row as Record<string, unknown>) : null;
  }

  async list(environment: string, limit = 100): Promise<WorkerRestartAlertRecord[]> {
    const result = await this.withClient((client) =>
      client.query(
        `
          SELECT *
          FROM worker_restart_alerts
          WHERE environment = $1
          ORDER BY last_seen_at DESC, updated_at DESC
          LIMIT $2
        `,
        [environment, limit]
      )
    );
    return result.rows.map((row) => mapRecord(row as Record<string, unknown>));
  }

  async listOpen(environment: string, limit = 100): Promise<WorkerRestartAlertRecord[]> {
    const result = await this.withClient((client) =>
      client.query(
        `
          SELECT *
          FROM worker_restart_alerts
          WHERE environment = $1 AND status <> 'resolved'
          ORDER BY last_seen_at DESC, updated_at DESC
          LIMIT $2
        `,
        [environment, limit]
      )
    );
    return result.rows.map((row) => mapRecord(row as Record<string, unknown>));
  }

  async save(record: WorkerRestartAlertRecord): Promise<WorkerRestartAlertRecord> {
    await this.withClient(async (client) => {
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
          ON CONFLICT (environment, dedupe_key) DO UPDATE SET
            id = EXCLUDED.id,
            restart_request_id = EXCLUDED.restart_request_id,
            worker_service = EXCLUDED.worker_service,
            target_worker = EXCLUDED.target_worker,
            target_version_id = EXCLUDED.target_version_id,
            source_category = EXCLUDED.source_category,
            reason_code = EXCLUDED.reason_code,
            severity = EXCLUDED.severity,
            status = EXCLUDED.status,
            summary = EXCLUDED.summary,
            recommended_action = EXCLUDED.recommended_action,
            metadata_json = EXCLUDED.metadata_json,
            condition_signature = EXCLUDED.condition_signature,
            occurrence_count = EXCLUDED.occurrence_count,
            first_seen_at = EXCLUDED.first_seen_at,
            last_seen_at = EXCLUDED.last_seen_at,
            last_evaluated_at = EXCLUDED.last_evaluated_at,
            acknowledged_at = EXCLUDED.acknowledged_at,
            acknowledged_by = EXCLUDED.acknowledged_by,
            acknowledgment_note = EXCLUDED.acknowledgment_note,
            resolved_at = EXCLUDED.resolved_at,
            resolved_by = EXCLUDED.resolved_by,
            resolution_note = EXCLUDED.resolution_note,
            last_restart_request_status = EXCLUDED.last_restart_request_status,
            last_restart_request_updated_at = EXCLUDED.last_restart_request_updated_at,
            last_worker_heartbeat_at = EXCLUDED.last_worker_heartbeat_at,
            last_applied_version_id = EXCLUDED.last_applied_version_id,
            requested_version_id = EXCLUDED.requested_version_id,
            updated_at = EXCLUDED.updated_at
        `,
        [
          record.id,
          record.environment,
          record.dedupeKey,
          record.restartRequestId ?? null,
          record.workerService,
          record.targetWorker ?? null,
          record.targetVersionId ?? null,
          record.sourceCategory,
          record.reasonCode,
          record.severity,
          record.status,
          record.summary,
          record.recommendedAction,
          JSON.stringify(record.metadata ?? {}),
          record.conditionSignature,
          record.occurrenceCount,
          record.firstSeenAt,
          record.lastSeenAt,
          record.lastEvaluatedAt,
          record.acknowledgedAt ?? null,
          record.acknowledgedBy ?? null,
          record.acknowledgmentNote ?? null,
          record.resolvedAt ?? null,
          record.resolvedBy ?? null,
          record.resolutionNote ?? null,
          record.lastRestartRequestStatus ?? null,
          record.lastRestartRequestUpdatedAt ?? null,
          record.lastWorkerHeartbeatAt ?? null,
          record.lastAppliedVersionId ?? null,
          record.requestedVersionId ?? null,
          record.createdAt,
          record.updatedAt,
        ]
      );
    });

    return buildRecord(record);
  }

  async recordEvent(record: WorkerRestartAlertEventRecord): Promise<WorkerRestartAlertEventRecord> {
    await this.withClient(async (client) => {
      await client.query(
        `
          INSERT INTO worker_restart_alert_events (
            id, environment, alert_id, action, actor, accepted, before_status, after_status,
            reason_code, summary, note, metadata_json, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `,
        [
          record.id,
          record.environment,
          record.alertId,
          record.action,
          record.actor,
          record.accepted,
          record.beforeStatus ?? null,
          record.afterStatus ?? null,
          record.reasonCode ?? null,
          record.summary ?? null,
          record.note ?? null,
          JSON.stringify(record.metadata ?? {}),
          record.createdAt,
        ]
      );
    });

    return buildEvent(record);
  }

  async listEvents(environment: string, alertId: string, limit = 100): Promise<WorkerRestartAlertEventRecord[]> {
    const result = await this.withClient((client) =>
      client.query(
        `
          SELECT *
          FROM worker_restart_alert_events
          WHERE environment = $1 AND alert_id = $2
          ORDER BY created_at DESC
          LIMIT $3
        `,
        [environment, alertId, limit]
      )
    );
    return result.rows.map((row) => mapEvent(row as Record<string, unknown>));
  }
}

export async function createWorkerRestartAlertRepository(
  databaseUrl?: string
): Promise<WorkerRestartAlertRepository> {
  if (!databaseUrl || databaseUrl.trim() === "") {
    return new InMemoryWorkerRestartAlertRepository();
  }

  return new PostgresWorkerRestartAlertRepository(new Pool({ connectionString: databaseUrl }));
}
