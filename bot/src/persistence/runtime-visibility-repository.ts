import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { RuntimeSnapshot } from "../runtime/dry-run-runtime.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { assertSchemaReady } from "./schema-migrations.js";

export interface RuntimeWorkerVisibility {
  workerId: string;
  producer?: {
    name: "runtime-worker";
    kind: "runtime_visibility_snapshot";
    canonicalDecisionTruth: false;
  };
  lastHeartbeatAt: string;
  lastCycleAt?: string;
  lastSeenReloadNonce?: number;
  lastAppliedVersionId?: string;
  lastValidVersionId?: string;
  degraded: boolean;
  degradedReason?: string;
  errorState?: string;
  observedAt: string;
}

export interface RuntimeVisibilitySnapshot {
  producer?: {
    name: "runtime-worker";
    kind: "runtime_visibility_snapshot";
    canonicalDecisionTruth: false;
  };
  environment: string;
  worker: RuntimeWorkerVisibility;
  runtime: RuntimeSnapshot;
  metrics: Record<string, number>;
}

export interface RuntimeVisibilityRecord {
  id: string;
  environment: string;
  workerId: string;
  snapshot: RuntimeVisibilitySnapshot;
  lastHeartbeatAt: string;
  lastCycleAt?: string;
  lastSeenReloadNonce?: number;
  lastAppliedVersionId?: string;
  lastValidVersionId?: string;
  degraded: boolean;
  degradedReason?: string;
  errorState?: string;
  observedAt: string;
  updatedAt: string;
}

export interface RuntimeVisibilityRepository {
  kind: "postgres" | "memory" | "file";
  ensureSchema(): Promise<void>;
  load(environment: string): Promise<RuntimeVisibilityRecord | null>;
  save(snapshot: RuntimeVisibilitySnapshot): Promise<RuntimeVisibilityRecord>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mapRecord(row: Record<string, unknown>): RuntimeVisibilityRecord {
  const snapshot = row.snapshot_json as RuntimeVisibilitySnapshot;
  return {
    id: String(row.id),
    environment: String(row.environment),
    workerId: String(row.worker_id),
    snapshot: clone(snapshot),
    lastHeartbeatAt: String(row.last_heartbeat_at),
    lastCycleAt: row.last_cycle_at == null ? undefined : String(row.last_cycle_at),
    lastSeenReloadNonce: row.last_seen_reload_nonce == null ? undefined : Number(row.last_seen_reload_nonce),
    lastAppliedVersionId: row.last_applied_version_id == null ? undefined : String(row.last_applied_version_id),
    lastValidVersionId: row.last_valid_version_id == null ? undefined : String(row.last_valid_version_id),
    degraded: Boolean(row.degraded),
    degradedReason: row.degraded_reason == null ? undefined : String(row.degraded_reason),
    errorState: row.error_state == null ? undefined : String(row.error_state),
    observedAt: String(row.observed_at),
    updatedAt: String(row.updated_at),
  };
}

function buildRecord(snapshot: RuntimeVisibilitySnapshot): RuntimeVisibilityRecord {
  return {
    id: randomUUID(),
    environment: snapshot.environment,
    workerId: snapshot.worker.workerId,
    snapshot: clone(snapshot),
    lastHeartbeatAt: snapshot.worker.lastHeartbeatAt,
    lastCycleAt: snapshot.worker.lastCycleAt,
    lastSeenReloadNonce: snapshot.worker.lastSeenReloadNonce,
    lastAppliedVersionId: snapshot.worker.lastAppliedVersionId,
    lastValidVersionId: snapshot.worker.lastValidVersionId,
    degraded: snapshot.worker.degraded,
    degradedReason: snapshot.worker.degradedReason,
    errorState: snapshot.worker.errorState,
    observedAt: snapshot.worker.observedAt,
    updatedAt: snapshot.worker.observedAt,
  };
}

export class InMemoryRuntimeVisibilityRepository implements RuntimeVisibilityRepository {
  kind = "memory" as const;

  private states = new Map<string, RuntimeVisibilityRecord>();

  async ensureSchema(): Promise<void> {
    return;
  }

  async load(environment: string): Promise<RuntimeVisibilityRecord | null> {
    const record = this.states.get(environment);
    return record ? clone(record) : null;
  }

  async save(snapshot: RuntimeVisibilitySnapshot): Promise<RuntimeVisibilityRecord> {
    const record = buildRecord(snapshot);
    this.states.set(snapshot.environment, clone(record));
    return clone(record);
  }
}

export class FileSystemRuntimeVisibilityRepository implements RuntimeVisibilityRepository {
  kind = "file" as const;

  constructor(private readonly filePath: string) {}

  async ensureSchema(): Promise<void> {
    return;
  }

  async load(environment: string): Promise<RuntimeVisibilityRecord | null> {
    const record = readJsonFile<RuntimeVisibilityRecord>(this.filePath);
    if (!record || record.environment !== environment) {
      return null;
    }

    return clone(record);
  }

  async save(snapshot: RuntimeVisibilitySnapshot): Promise<RuntimeVisibilityRecord> {
    const record = buildRecord(snapshot);
    writeJsonFile(this.filePath, record);
    return clone(record);
  }
}

export class PostgresRuntimeVisibilityRepository implements RuntimeVisibilityRepository {
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
    await assertSchemaReady(this.pool);
  }

  async load(environment: string): Promise<RuntimeVisibilityRecord | null> {
    const result = await this.withClient((client) =>
      client.query(`SELECT * FROM runtime_visibility_snapshots WHERE environment = $1 LIMIT 1`, [environment])
    );
    const row = result.rows[0];
    return row ? mapRecord(row as Record<string, unknown>) : null;
  }

  async save(snapshot: RuntimeVisibilitySnapshot): Promise<RuntimeVisibilityRecord> {
    const record = buildRecord(snapshot);
    await this.withClient(async (client) => {
      await client.query(
        `
          INSERT INTO runtime_visibility_snapshots (
            id, environment, worker_id, snapshot_json, last_heartbeat_at, last_cycle_at,
            last_seen_reload_nonce, last_applied_version_id, last_valid_version_id,
            degraded, degraded_reason, error_state, observed_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT (environment) DO UPDATE SET
            id = EXCLUDED.id,
            worker_id = EXCLUDED.worker_id,
            snapshot_json = EXCLUDED.snapshot_json,
            last_heartbeat_at = EXCLUDED.last_heartbeat_at,
            last_cycle_at = EXCLUDED.last_cycle_at,
            last_seen_reload_nonce = EXCLUDED.last_seen_reload_nonce,
            last_applied_version_id = EXCLUDED.last_applied_version_id,
            last_valid_version_id = EXCLUDED.last_valid_version_id,
            degraded = EXCLUDED.degraded,
            degraded_reason = EXCLUDED.degraded_reason,
            error_state = EXCLUDED.error_state,
            observed_at = EXCLUDED.observed_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          record.id,
          record.environment,
          record.workerId,
          JSON.stringify(record.snapshot),
          record.lastHeartbeatAt,
          record.lastCycleAt ?? null,
          record.lastSeenReloadNonce ?? null,
          record.lastAppliedVersionId ?? null,
          record.lastValidVersionId ?? null,
          record.degraded,
          record.degradedReason ?? null,
          record.errorState ?? null,
          record.observedAt,
          record.updatedAt,
        ]
      );
    });

    return clone(record);
  }
}

export async function createRuntimeVisibilityRepository(
  databaseUrl?: string,
  filePath?: string
): Promise<RuntimeVisibilityRepository> {
  const explicitFilePath = filePath?.trim();
  const envFilePath = process.env.RUNTIME_VISIBILITY_PATH?.trim();
  const resolvedFilePath = explicitFilePath || envFilePath || "data/runtime-visibility.json";

  if (!databaseUrl || databaseUrl.trim() === "") {
    if (process.env.NODE_ENV === "test" && !explicitFilePath && !envFilePath) {
      return new InMemoryRuntimeVisibilityRepository();
    }

    return new FileSystemRuntimeVisibilityRepository(resolvedFilePath);
  }

  return new PostgresRuntimeVisibilityRepository(new Pool({ connectionString: databaseUrl }));
}
