/**
 * Action Logger interface and implementations.
 * EXTRACTED from OrchestrAI_Labs packages/agent-runtime/src/orchestrator/orchestrator.ts (lines 53-73)
 * MAPPED from postgres-action-logger.ts - in-memory for tests, extensible for Postgres.
 * Wave 4: FileSystemActionLogger for persistent audit logs (JSONL).
 * Decision-history truth note (PR-M0-01): action logs are derived support only.
 * Canonical decision history is the runtime cycle summary `decisionEnvelope`; action logs are never canonical truth.
 */
import { appendFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

export interface ActionLogEntry {
  agentId: string;
  userId: string;
  projectId?: string;
  clientId?: string;
  action: string;
  input: unknown;
  output: unknown;
  ts: string;
  blocked?: boolean;
  reason?: string;
  traceId?: string;
  skillId?: string;
  skillVersion?: string;
  skillRunId?: string;
  skillStatus?: string;
  skillDurationMs?: number;
  skillBlockReason?: string;
}

export interface ActionLogger {
  append(entry: ActionLogEntry): Promise<void>;
}

/**
 * In-memory action logger for tests and development.
 * EXTRACTED from OrchestrAI_Labs packages/governance/src/logging/inmemory-action-logger.ts
 */
export class InMemoryActionLogger implements ActionLogger {
  private entries: ActionLogEntry[] = [];

  async append(entry: ActionLogEntry): Promise<void> {
    this.entries.push({ ...entry });
  }

  list(): ActionLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

/**
 * File-system action logger (Wave 4 P0).
 * Appends JSONL lines for persistent audit trail. Survives restart.
 */
export class FileSystemActionLogger implements ActionLogger {
  private readonly filePath: string;
  private inMemoryCache: ActionLogEntry[] = [];
  private cacheLoaded = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async append(entry: ActionLogEntry): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const line = JSON.stringify(entry) + "\n";
    await appendFile(this.filePath, line, "utf8");
    this.inMemoryCache.push({ ...entry });
  }

  list(): ActionLogEntry[] {
    return [...this.inMemoryCache];
  }

  /** Load entries from file. Call after restart to restore cache. */
  async loadFromFile(): Promise<ActionLogEntry[]> {
    if (!existsSync(this.filePath)) {
      this.inMemoryCache = [];
      this.cacheLoaded = true;
      return [];
    }
    const content = await readFile(this.filePath, "utf8");
    const entries = content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ActionLogEntry);
    this.inMemoryCache = entries;
    this.cacheLoaded = true;
    return entries;
  }

  /** Lazy load: ensures cache is populated for list(). */
  async ensureLoaded(): Promise<void> {
    if (!this.cacheLoaded) {
      await this.loadFromFile();
    }
  }
}
