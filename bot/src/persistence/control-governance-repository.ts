import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type {
  ControlAuditEvent,
  ControlGovernanceRepository,
  ControlGovernanceRepositoryWithAudits,
  ControlRecoveryRehearsalAlertEventRecord,
  ControlRecoveryRehearsalAlertRecord,
  ControlRecoveryRehearsalEvidenceRecord,
  ControlLivePromotionRecord,
} from "../control/control-governance.js";
import { assertSchemaReady } from "./schema-migrations.js";

interface MemoryGovernanceState {
  audits: ControlAuditEvent[];
  promotions: ControlLivePromotionRecord[];
  rehearsals: ControlRecoveryRehearsalEvidenceRecord[];
  rehearsalAlerts: ControlRecoveryRehearsalAlertRecord[];
  rehearsalAlertEvents: ControlRecoveryRehearsalAlertEventRecord[];
}

function clonePromotion(record: ControlLivePromotionRecord): ControlLivePromotionRecord {
  return JSON.parse(JSON.stringify(record)) as ControlLivePromotionRecord;
}

function cloneAudit(record: ControlAuditEvent): ControlAuditEvent {
  return JSON.parse(JSON.stringify(record)) as ControlAuditEvent;
}

function fromJson<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

function mapPromotionRow(row: Record<string, unknown>): ControlLivePromotionRecord {
  return fromJson<ControlLivePromotionRecord>(row.record_json);
}

function mapAuditRow(row: Record<string, unknown>): ControlAuditEvent {
  return fromJson<ControlAuditEvent>(row.event_json);
}

function mapRehearsalRow(row: Record<string, unknown>): ControlRecoveryRehearsalEvidenceRecord {
  return fromJson<ControlRecoveryRehearsalEvidenceRecord>(row.evidence_json);
}

function mapFreshnessAlertRow(row: Record<string, unknown>): ControlRecoveryRehearsalAlertRecord {
  return fromJson<ControlRecoveryRehearsalAlertRecord>(row.record_json);
}

function mapFreshnessAlertEventRow(row: Record<string, unknown>): ControlRecoveryRehearsalAlertEventRecord {
  return fromJson<ControlRecoveryRehearsalAlertEventRecord>(row.event_json);
}

export class InMemoryControlGovernanceRepository implements ControlGovernanceRepositoryWithAudits {
  private readonly state: MemoryGovernanceState = {
    audits: [],
    promotions: [],
    rehearsals: [],
    rehearsalAlerts: [],
    rehearsalAlertEvents: [],
  };

  async ensureSchema(): Promise<void> {
    return;
  }

  async recordAuditEvent(input: ControlAuditEvent): Promise<void> {
    this.state.audits.push({
      ...cloneAudit({
        ...input,
        id: input.id ?? randomUUID(),
        createdAt: input.createdAt ?? new Date().toISOString(),
      }),
    });
  }

  async recordDatabaseRehearsalEvidence(input: ControlRecoveryRehearsalEvidenceRecord): Promise<void> {
    this.state.rehearsals.push(JSON.parse(JSON.stringify(input)) as ControlRecoveryRehearsalEvidenceRecord);
  }

  async loadLatestDatabaseRehearsalEvidence(environment: string): Promise<ControlRecoveryRehearsalEvidenceRecord | null> {
    const record = [...this.state.rehearsals]
      .filter((entry) => entry.environment === environment)
      .sort((left, right) => Date.parse(right.executedAt) - Date.parse(left.executedAt))[0];
    return record ? (JSON.parse(JSON.stringify(record)) as ControlRecoveryRehearsalEvidenceRecord) : null;
  }

  async listDatabaseRehearsalEvidence(environment: string, limit = 50): Promise<ControlRecoveryRehearsalEvidenceRecord[]> {
    return this.state.rehearsals
      .filter((entry) => entry.environment === environment)
      .sort((left, right) => Date.parse(right.executedAt) - Date.parse(left.executedAt))
      .slice(0, Math.min(Math.max(limit, 1), 500))
      .map((record) => JSON.parse(JSON.stringify(record)) as ControlRecoveryRehearsalEvidenceRecord);
  }

  async loadDatabaseRehearsalFreshnessAlert(environment: string): Promise<ControlRecoveryRehearsalAlertRecord | null> {
    const record = [...this.state.rehearsalAlerts]
      .filter((entry) => entry.environment === environment)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
    return record ? (JSON.parse(JSON.stringify(record)) as ControlRecoveryRehearsalAlertRecord) : null;
  }

  async saveDatabaseRehearsalFreshnessAlert(record: ControlRecoveryRehearsalAlertRecord): Promise<void> {
    const next = JSON.parse(JSON.stringify(record)) as ControlRecoveryRehearsalAlertRecord;
    const index = this.state.rehearsalAlerts.findIndex((entry) => entry.id === next.id);
    if (index >= 0) {
      this.state.rehearsalAlerts[index] = next;
      return;
    }
    this.state.rehearsalAlerts.push(next);
  }

  async recordDatabaseRehearsalFreshnessAlertEvent(event: ControlRecoveryRehearsalAlertEventRecord): Promise<void> {
    this.state.rehearsalAlertEvents.push(JSON.parse(JSON.stringify(event)) as ControlRecoveryRehearsalAlertEventRecord);
  }

  async listDatabaseRehearsalFreshnessAlertEvents(
    environment: string,
    limit = 50
  ): Promise<ControlRecoveryRehearsalAlertEventRecord[]> {
    return this.state.rehearsalAlertEvents
      .filter((entry) => entry.environment === environment)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, Math.min(Math.max(limit, 1), 500))
      .map((record) => JSON.parse(JSON.stringify(record)) as ControlRecoveryRehearsalAlertEventRecord);
  }

  async saveLivePromotionRequest(record: ControlLivePromotionRecord): Promise<void> {
    const next = clonePromotion(record);
    const index = this.state.promotions.findIndex((entry) => entry.id === next.id);
    if (index >= 0) {
      this.state.promotions[index] = next;
      return;
    }
    this.state.promotions.push(next);
  }

  async loadLivePromotionRequest(id: string): Promise<ControlLivePromotionRecord | null> {
    const record = this.state.promotions.find((entry) => entry.id === id);
    return record ? clonePromotion(record) : null;
  }

  async listLivePromotionRequests(environment: string, limit = 20): Promise<ControlLivePromotionRecord[]> {
    return this.state.promotions
      .filter((entry) => entry.environment === environment)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, limit)
      .map((record) => clonePromotion(record));
  }

  async listAuditEvents(environment: string, limit = 50): Promise<ControlAuditEvent[]> {
    return this.state.audits
      .filter((entry) => entry.environment === environment)
      .sort((left, right) => Date.parse(right.createdAt ?? new Date().toISOString()) - Date.parse(left.createdAt ?? new Date().toISOString()))
      .slice(0, limit)
      .map((record) => cloneAudit(record));
  }
}

export class PostgresControlGovernanceRepository implements ControlGovernanceRepositoryWithAudits {
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
    await assertSchemaReady(this.pool);
  }

  async recordAuditEvent(input: ControlAuditEvent): Promise<void> {
    const record = {
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    await this.withClient(async (client) => {
      await client.query(
        `
          INSERT INTO control_operator_audit_log (
            id, environment, action, target, result, actor_id, actor_display_name, actor_role,
            session_id, request_id, reason, note, created_at, event_json
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        `,
        [
          record.id,
          record.environment,
          record.action,
          record.target,
          record.result,
          record.actorId,
          record.actorDisplayName,
          record.actorRole,
          record.sessionId,
          record.requestId ?? null,
          record.reason ?? null,
          record.note ?? null,
          record.createdAt,
          JSON.stringify(record),
        ]
      );
    });
  }

  async recordDatabaseRehearsalEvidence(input: ControlRecoveryRehearsalEvidenceRecord): Promise<void> {
    const record = {
      ...input,
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    };
    await this.withClient(async (client) => {
      await client.query(
        `
          INSERT INTO control_database_rehearsal_evidence (
            id, environment, rehearsal_kind, status, executed_at, recorded_at, actor_id, actor_display_name,
            actor_role, session_id, source_context_json, target_context_json, source_database_fingerprint,
            target_database_fingerprint, source_schema_status_json, target_schema_status_before_json,
            target_schema_status_after_json, restore_validation_json, summary, failure_reason, evidence_json
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
          )
          ON CONFLICT (id) DO UPDATE SET
            environment = EXCLUDED.environment,
            rehearsal_kind = EXCLUDED.rehearsal_kind,
            status = EXCLUDED.status,
            executed_at = EXCLUDED.executed_at,
            recorded_at = EXCLUDED.recorded_at,
            actor_id = EXCLUDED.actor_id,
            actor_display_name = EXCLUDED.actor_display_name,
            actor_role = EXCLUDED.actor_role,
            session_id = EXCLUDED.session_id,
            source_context_json = EXCLUDED.source_context_json,
            target_context_json = EXCLUDED.target_context_json,
            source_database_fingerprint = EXCLUDED.source_database_fingerprint,
            target_database_fingerprint = EXCLUDED.target_database_fingerprint,
            source_schema_status_json = EXCLUDED.source_schema_status_json,
            target_schema_status_before_json = EXCLUDED.target_schema_status_before_json,
            target_schema_status_after_json = EXCLUDED.target_schema_status_after_json,
            restore_validation_json = EXCLUDED.restore_validation_json,
            summary = EXCLUDED.summary,
            failure_reason = EXCLUDED.failure_reason,
            evidence_json = EXCLUDED.evidence_json
        `,
        [
          record.id,
          record.environment,
          record.rehearsalKind,
          record.status,
          record.executedAt,
          record.recordedAt,
          record.actorId,
          record.actorDisplayName,
          record.actorRole,
          record.sessionId,
          JSON.stringify(record.sourceContext),
          JSON.stringify(record.targetContext),
          record.sourceDatabaseFingerprint,
          record.targetDatabaseFingerprint,
          JSON.stringify(record.sourceSchemaStatus),
          JSON.stringify(record.targetSchemaStatusBefore),
          record.targetSchemaStatusAfter ? JSON.stringify(record.targetSchemaStatusAfter) : null,
          JSON.stringify(record.restoreValidation),
          record.summary,
          record.failureReason ?? null,
          JSON.stringify(record),
        ]
      );
    });
  }

  async loadLatestDatabaseRehearsalEvidence(environment: string): Promise<ControlRecoveryRehearsalEvidenceRecord | null> {
    const result = await this.withClient((client) =>
      client.query(`SELECT evidence_json FROM control_database_rehearsal_evidence WHERE environment = $1 ORDER BY executed_at DESC LIMIT 1`, [environment])
    );
    const row = result.rows[0];
    return row ? mapRehearsalRow(row as Record<string, unknown>) : null;
  }

  async listDatabaseRehearsalEvidence(environment: string, limit = 50): Promise<ControlRecoveryRehearsalEvidenceRecord[]> {
    const result = await this.withClient((client) =>
      client.query(
        `SELECT evidence_json FROM control_database_rehearsal_evidence WHERE environment = $1 ORDER BY executed_at DESC LIMIT $2`,
        [environment, Math.min(Math.max(limit, 1), 500)]
      )
    );
    return result.rows.map((row) => mapRehearsalRow(row as Record<string, unknown>));
  }

  async loadDatabaseRehearsalFreshnessAlert(environment: string): Promise<ControlRecoveryRehearsalAlertRecord | null> {
    const result = await this.withClient((client) =>
      client.query(
        `SELECT record_json FROM control_database_rehearsal_freshness_alerts WHERE environment = $1 ORDER BY updated_at DESC LIMIT 1`,
        [environment]
      )
    );
    const row = result.rows[0];
    return row ? mapFreshnessAlertRow(row as Record<string, unknown>) : null;
  }

  async saveDatabaseRehearsalFreshnessAlert(record: ControlRecoveryRehearsalAlertRecord): Promise<void> {
    const next = {
      ...record,
      createdAt: record.createdAt ?? new Date().toISOString(),
      updatedAt: record.updatedAt ?? new Date().toISOString(),
    };
    await this.withClient(async (client) => {
      await client.query(
        `
          INSERT INTO control_database_rehearsal_freshness_alerts (
            id, environment, reason_code, severity, status, summary, recommended_action,
            freshness_status, blocked_by_freshness, freshness_window_ms, warning_threshold_ms,
            freshness_age_ms, last_successful_rehearsal_at, last_failed_rehearsal_at,
            latest_evidence_id, latest_evidence_executed_at, latest_evidence_status,
            latest_evidence_execution_source, latest_automated_run_at, latest_automated_run_status,
            latest_manual_run_at, latest_manual_run_status, repeated_automation_failure_count,
            automation_health, manual_fallback_active, first_seen_at, last_seen_at, last_evaluated_at,
            acknowledged_at, acknowledged_by, acknowledgment_note, resolved_at, resolved_by,
            resolution_note, created_at, updated_at, record_json
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
            $26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37
          )
          ON CONFLICT (environment) DO UPDATE SET
            id = EXCLUDED.id,
            reason_code = EXCLUDED.reason_code,
            severity = EXCLUDED.severity,
            status = EXCLUDED.status,
            summary = EXCLUDED.summary,
            recommended_action = EXCLUDED.recommended_action,
            freshness_status = EXCLUDED.freshness_status,
            blocked_by_freshness = EXCLUDED.blocked_by_freshness,
            freshness_window_ms = EXCLUDED.freshness_window_ms,
            warning_threshold_ms = EXCLUDED.warning_threshold_ms,
            freshness_age_ms = EXCLUDED.freshness_age_ms,
            last_successful_rehearsal_at = EXCLUDED.last_successful_rehearsal_at,
            last_failed_rehearsal_at = EXCLUDED.last_failed_rehearsal_at,
            latest_evidence_id = EXCLUDED.latest_evidence_id,
            latest_evidence_executed_at = EXCLUDED.latest_evidence_executed_at,
            latest_evidence_status = EXCLUDED.latest_evidence_status,
            latest_evidence_execution_source = EXCLUDED.latest_evidence_execution_source,
            latest_automated_run_at = EXCLUDED.latest_automated_run_at,
            latest_automated_run_status = EXCLUDED.latest_automated_run_status,
            latest_manual_run_at = EXCLUDED.latest_manual_run_at,
            latest_manual_run_status = EXCLUDED.latest_manual_run_status,
            repeated_automation_failure_count = EXCLUDED.repeated_automation_failure_count,
            automation_health = EXCLUDED.automation_health,
            manual_fallback_active = EXCLUDED.manual_fallback_active,
            first_seen_at = LEAST(control_database_rehearsal_freshness_alerts.first_seen_at, EXCLUDED.first_seen_at),
            last_seen_at = EXCLUDED.last_seen_at,
            last_evaluated_at = EXCLUDED.last_evaluated_at,
            acknowledged_at = EXCLUDED.acknowledged_at,
            acknowledged_by = EXCLUDED.acknowledged_by,
            acknowledgment_note = EXCLUDED.acknowledgment_note,
            resolved_at = EXCLUDED.resolved_at,
            resolved_by = EXCLUDED.resolved_by,
            resolution_note = EXCLUDED.resolution_note,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            record_json = EXCLUDED.record_json
        `,
        [
          next.id,
          next.environment,
          next.reasonCode,
          next.severity,
          next.status,
          next.summary,
          next.recommendedAction,
          next.freshnessStatus,
          next.blockedByFreshness,
          next.freshnessWindowMs,
          next.warningThresholdMs,
          next.freshnessAgeMs ?? null,
          next.lastSuccessfulRehearsalAt ?? null,
          next.lastFailedRehearsalAt ?? null,
          next.latestEvidenceId ?? null,
          next.latestEvidenceExecutedAt ?? null,
          next.latestEvidenceStatus ?? null,
          next.latestEvidenceExecutionSource ?? null,
          next.latestAutomatedRunAt ?? null,
          next.latestAutomatedRunStatus ?? null,
          next.latestManualRunAt ?? null,
          next.latestManualRunStatus ?? null,
          next.repeatedAutomationFailureCount,
          next.automationHealth,
          next.manualFallbackActive,
          next.firstSeenAt,
          next.lastSeenAt,
          next.lastEvaluatedAt,
          next.acknowledgedAt ?? null,
          next.acknowledgedBy ?? null,
          next.acknowledgmentNote ?? null,
          next.resolvedAt ?? null,
          next.resolvedBy ?? null,
          next.resolutionNote ?? null,
          next.createdAt,
          next.updatedAt,
          JSON.stringify(next),
        ]
      );
    });
  }

  async recordDatabaseRehearsalFreshnessAlertEvent(event: ControlRecoveryRehearsalAlertEventRecord): Promise<void> {
    const next = {
      ...event,
      createdAt: event.createdAt ?? new Date().toISOString(),
    };
    await this.withClient(async (client) => {
      await client.query(
        `
          INSERT INTO control_database_rehearsal_freshness_alert_events (
            id, environment, alert_id, action, accepted, before_status, after_status, reason_code, summary,
            note, metadata_json, created_at, event_json
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `,
        [
          next.id,
          next.environment,
          next.alertId,
          next.action,
          next.accepted,
          next.beforeStatus ?? null,
          next.afterStatus ?? null,
          next.reasonCode ?? null,
          next.summary ?? null,
          next.note ?? null,
          next.metadata ? JSON.stringify(next.metadata) : null,
          next.createdAt,
          JSON.stringify(next),
        ]
      );
    });
  }

  async listDatabaseRehearsalFreshnessAlertEvents(
    environment: string,
    limit = 50
  ): Promise<ControlRecoveryRehearsalAlertEventRecord[]> {
    const result = await this.withClient((client) =>
      client.query(
        `SELECT event_json FROM control_database_rehearsal_freshness_alert_events WHERE environment = $1 ORDER BY created_at DESC LIMIT $2`,
        [environment, Math.min(Math.max(limit, 1), 500)]
      )
    );
    return result.rows.map((row) => mapFreshnessAlertEventRow(row as Record<string, unknown>));
  }

  async saveLivePromotionRequest(record: ControlLivePromotionRecord): Promise<void> {
    const next = {
      ...record,
      updatedAt: record.updatedAt ?? new Date().toISOString(),
    };
    await this.withClient(async (client) => {
      await client.query(
        `
          INSERT INTO control_live_promotions (
            id, environment, target_mode, workflow_status, application_status, requested_at, updated_at, record_json
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (id) DO UPDATE SET
            environment = EXCLUDED.environment,
            target_mode = EXCLUDED.target_mode,
            workflow_status = EXCLUDED.workflow_status,
            application_status = EXCLUDED.application_status,
            requested_at = EXCLUDED.requested_at,
            updated_at = EXCLUDED.updated_at,
            record_json = EXCLUDED.record_json
        `,
        [
          next.id,
          next.environment,
          next.targetMode,
          next.workflowStatus,
          next.applicationStatus,
          next.requestedAt,
          next.updatedAt,
          JSON.stringify(next),
        ]
      );
    });
  }

  async loadLivePromotionRequest(id: string): Promise<ControlLivePromotionRecord | null> {
    const result = await this.withClient((client) =>
      client.query(`SELECT record_json FROM control_live_promotions WHERE id = $1 LIMIT 1`, [id])
    );
    const row = result.rows[0];
    return row ? mapPromotionRow(row as Record<string, unknown>) : null;
  }

  async listLivePromotionRequests(environment: string, limit = 20): Promise<ControlLivePromotionRecord[]> {
    const result = await this.withClient((client) =>
      client.query(
        `SELECT record_json FROM control_live_promotions WHERE environment = $1 ORDER BY updated_at DESC LIMIT $2`,
        [environment, limit]
      )
    );
    return result.rows.map((row) => mapPromotionRow(row as Record<string, unknown>));
  }

  async listAuditEvents(environment: string, limit = 50): Promise<ControlAuditEvent[]> {
    const result = await this.withClient((client) =>
      client.query(
        `SELECT event_json FROM control_operator_audit_log WHERE environment = $1 ORDER BY created_at DESC LIMIT $2`,
        [environment, limit]
      )
    );
    return result.rows.map((row) => mapAuditRow(row as Record<string, unknown>));
  }
}

export async function createControlGovernanceRepository(databaseUrl?: string): Promise<ControlGovernanceRepositoryWithAudits> {
  if (!databaseUrl || databaseUrl.trim() === "") {
    return new InMemoryControlGovernanceRepository();
  }

  return new PostgresControlGovernanceRepository(new Pool({ connectionString: databaseUrl }));
}
