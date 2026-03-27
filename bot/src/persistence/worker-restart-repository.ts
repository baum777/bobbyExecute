import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

export type WorkerRestartMethod = "deploy_hook" | "render_api";
export type WorkerRestartRecordStatus = "requested" | "dispatched" | "converged" | "failed" | "rejected" | "cooldown" | "unconfigured";

export interface WorkerRestartRequestRecord {
  id: string;
  environment: string;
  requestKey?: string;
  actor: string;
  reason?: string;
  targetVersionId?: string;
  targetService: string;
  targetWorker?: string;
  method: WorkerRestartMethod;
  status: WorkerRestartRecordStatus;
  accepted: boolean;
  restartRequired: boolean;
  restartRequiredReason?: string;
  requestedAt: string;
  updatedAt: string;
  deadlineAt?: string;
  rejectionReason?: string;
  failureReason?: string;
  providerStatusCode?: number;
  providerRequestId?: string;
  providerMessage?: string;
  convergenceObservedAt?: string;
  clearedAt?: string;
}

export interface WorkerRestartRepository {
  kind: "postgres" | "memory";
  ensureSchema(): Promise<void>;
  loadLatest(environment: string): Promise<WorkerRestartRequestRecord | null>;
  loadByRequestKey(environment: string, requestKey: string): Promise<WorkerRestartRequestRecord | null>;
  list(environment: string, limit?: number): Promise<WorkerRestartRequestRecord[]>;
  save(record: WorkerRestartRequestRecord): Promise<WorkerRestartRequestRecord>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mapRecord(row: Record<string, unknown>): WorkerRestartRequestRecord {
  return {
    id: String(row.id),
    environment: String(row.environment),
    requestKey: row.request_key == null ? undefined : String(row.request_key),
    actor: String(row.actor),
    reason: row.reason == null ? undefined : String(row.reason),
    targetVersionId: row.target_version_id == null ? undefined : String(row.target_version_id),
    targetService: String(row.target_service),
    targetWorker: row.target_worker == null ? undefined : String(row.target_worker),
    method: String(row.method) as WorkerRestartMethod,
    status: String(row.status) as WorkerRestartRecordStatus,
    accepted: Boolean(row.accepted),
    restartRequired: Boolean(row.restart_required),
    restartRequiredReason: row.restart_required_reason == null ? undefined : String(row.restart_required_reason),
    requestedAt: String(row.requested_at),
    updatedAt: String(row.updated_at),
    deadlineAt: row.deadline_at == null ? undefined : String(row.deadline_at),
    rejectionReason: row.rejection_reason == null ? undefined : String(row.rejection_reason),
    failureReason: row.failure_reason == null ? undefined : String(row.failure_reason),
    providerStatusCode: row.provider_status_code == null ? undefined : Number(row.provider_status_code),
    providerRequestId: row.provider_request_id == null ? undefined : String(row.provider_request_id),
    providerMessage: row.provider_message == null ? undefined : String(row.provider_message),
    convergenceObservedAt:
      row.convergence_observed_at == null ? undefined : String(row.convergence_observed_at),
    clearedAt: row.cleared_at == null ? undefined : String(row.cleared_at),
  };
}

function buildRecord(record: WorkerRestartRequestRecord): WorkerRestartRequestRecord {
  return clone(record);
}

export class InMemoryWorkerRestartRepository implements WorkerRestartRepository {
  kind = "memory" as const;

  private readonly states = new Map<string, WorkerRestartRequestRecord[]>();

  async ensureSchema(): Promise<void> {
    return;
  }

  private getState(environment: string): WorkerRestartRequestRecord[] {
    const existing = this.states.get(environment);
    if (existing) {
      return existing;
    }
    const created: WorkerRestartRequestRecord[] = [];
    this.states.set(environment, created);
    return created;
  }

  async loadLatest(environment: string): Promise<WorkerRestartRequestRecord | null> {
    const state = this.getState(environment);
    const record = [...state].sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt ?? left.requestedAt);
      const rightTime = Date.parse(right.updatedAt ?? right.requestedAt);
      return rightTime - leftTime;
    })[0];
    return record ? buildRecord(record) : null;
  }

  async loadByRequestKey(environment: string, requestKey: string): Promise<WorkerRestartRequestRecord | null> {
    const state = this.getState(environment);
    const record = state.find((entry) => entry.requestKey === requestKey);
    return record ? buildRecord(record) : null;
  }

  async list(environment: string, limit = 100): Promise<WorkerRestartRequestRecord[]> {
    const state = this.getState(environment);
    return [...state]
      .sort((left, right) => {
        const leftTime = Date.parse(left.updatedAt ?? left.requestedAt);
        const rightTime = Date.parse(right.updatedAt ?? right.requestedAt);
        return rightTime - leftTime;
      })
      .slice(0, limit)
      .map((record) => buildRecord(record));
  }

  async save(record: WorkerRestartRequestRecord): Promise<WorkerRestartRequestRecord> {
    const state = this.getState(record.environment);
    const index = state.findIndex((entry) => entry.id === record.id);
    const next = buildRecord(record);
    if (index >= 0) {
      state[index] = next;
    } else {
      state.push(next);
    }
    return buildRecord(next);
  }
}

export class PostgresWorkerRestartRepository implements WorkerRestartRepository {
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
        CREATE TABLE IF NOT EXISTS worker_restart_requests (
          id text PRIMARY KEY,
          environment text NOT NULL,
          request_key text,
          actor text NOT NULL,
          reason text,
          target_version_id text,
          target_service text NOT NULL,
          target_worker text,
          method text NOT NULL,
          status text NOT NULL,
          accepted boolean NOT NULL DEFAULT false,
          restart_required boolean NOT NULL DEFAULT false,
          restart_required_reason text,
          requested_at timestamptz NOT NULL,
          updated_at timestamptz NOT NULL,
          deadline_at timestamptz,
          rejection_reason text,
          failure_reason text,
          provider_status_code integer,
          provider_request_id text,
          provider_message text,
          convergence_observed_at timestamptz,
          cleared_at timestamptz
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS worker_restart_requests_environment_updated_at_idx
        ON worker_restart_requests (environment, updated_at DESC)
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS worker_restart_requests_environment_request_key_idx
        ON worker_restart_requests (environment, request_key)
        WHERE request_key IS NOT NULL
      `);
    });
  }

  async loadLatest(environment: string): Promise<WorkerRestartRequestRecord | null> {
    const result = await this.withClient((client) =>
      client.query(
        `
          SELECT *
          FROM worker_restart_requests
          WHERE environment = $1
          ORDER BY requested_at DESC, updated_at DESC
          LIMIT 1
        `,
        [environment]
      )
    );
    const row = result.rows[0];
    return row ? mapRecord(row as Record<string, unknown>) : null;
  }

  async loadByRequestKey(environment: string, requestKey: string): Promise<WorkerRestartRequestRecord | null> {
    const result = await this.withClient((client) =>
      client.query(
        `
          SELECT *
          FROM worker_restart_requests
          WHERE environment = $1 AND request_key = $2
          LIMIT 1
        `,
        [environment, requestKey]
      )
    );
    const row = result.rows[0];
    return row ? mapRecord(row as Record<string, unknown>) : null;
  }

  async list(environment: string, limit = 100): Promise<WorkerRestartRequestRecord[]> {
    const result = await this.withClient((client) =>
      client.query(
        `
          SELECT *
          FROM worker_restart_requests
          WHERE environment = $1
          ORDER BY updated_at DESC, requested_at DESC
          LIMIT $2
        `,
        [environment, limit]
      )
    );
    return result.rows.map((row) => mapRecord(row as Record<string, unknown>));
  }

  async save(record: WorkerRestartRequestRecord): Promise<WorkerRestartRequestRecord> {
    await this.withClient(async (client) => {
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
          ON CONFLICT (id) DO UPDATE SET
            request_key = EXCLUDED.request_key,
            actor = EXCLUDED.actor,
            reason = EXCLUDED.reason,
            target_version_id = EXCLUDED.target_version_id,
            target_service = EXCLUDED.target_service,
            target_worker = EXCLUDED.target_worker,
            method = EXCLUDED.method,
            status = EXCLUDED.status,
            accepted = EXCLUDED.accepted,
            restart_required = EXCLUDED.restart_required,
            restart_required_reason = EXCLUDED.restart_required_reason,
            requested_at = EXCLUDED.requested_at,
            updated_at = EXCLUDED.updated_at,
            deadline_at = EXCLUDED.deadline_at,
            rejection_reason = EXCLUDED.rejection_reason,
            failure_reason = EXCLUDED.failure_reason,
            provider_status_code = EXCLUDED.provider_status_code,
            provider_request_id = EXCLUDED.provider_request_id,
            provider_message = EXCLUDED.provider_message,
            convergence_observed_at = EXCLUDED.convergence_observed_at,
            cleared_at = EXCLUDED.cleared_at
        `,
        [
          record.id,
          record.environment,
          record.requestKey ?? null,
          record.actor,
          record.reason ?? null,
          record.targetVersionId ?? null,
          record.targetService,
          record.targetWorker ?? null,
          record.method,
          record.status,
          record.accepted,
          record.restartRequired,
          record.restartRequiredReason ?? null,
          record.requestedAt,
          record.updatedAt,
          record.deadlineAt ?? null,
          record.rejectionReason ?? null,
          record.failureReason ?? null,
          record.providerStatusCode ?? null,
          record.providerRequestId ?? null,
          record.providerMessage ?? null,
          record.convergenceObservedAt ?? null,
          record.clearedAt ?? null,
        ]
      );
    });

    return buildRecord(record);
  }
}

export async function createWorkerRestartRepository(databaseUrl?: string): Promise<WorkerRestartRepository> {
  if (!databaseUrl || databaseUrl.trim() === "") {
    return new InMemoryWorkerRestartRepository();
  }

  return new PostgresWorkerRestartRepository(new Pool({ connectionString: databaseUrl }));
}
