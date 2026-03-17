import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

export type IncidentSeverity = "info" | "warning" | "critical";

export interface IncidentRecord {
  id: string;
  at: string;
  severity: IncidentSeverity;
  type:
    | "emergency_stop"
    | "runtime_paused"
    | "runtime_resumed"
    | "runtime_halted"
    | "paper_ingest_blocked"
    | "runtime_cycle_error";
  message: string;
  details?: Record<string, string | number | boolean | null | undefined>;
}

export interface IncidentRepository {
  append(record: IncidentRecord): Promise<void>;
  list(limit?: number): Promise<IncidentRecord[]>;
}

export class InMemoryIncidentRepository implements IncidentRepository {
  private readonly records: IncidentRecord[] = [];

  async append(record: IncidentRecord): Promise<void> {
    this.records.push({ ...record, details: record.details ? { ...record.details } : undefined });
  }

  async list(limit = 100): Promise<IncidentRecord[]> {
    return this.records.slice(-limit);
  }
}

export class FileSystemIncidentRepository implements IncidentRepository {
  constructor(private readonly filePath: string) {}

  async append(record: IncidentRecord): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  async list(limit = 100): Promise<IncidentRecord[]> {
    if (!existsSync(this.filePath)) return [];
    const content = await readFile(this.filePath, "utf8");
    const records = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as IncidentRecord);
    return records.slice(-limit);
  }
}
