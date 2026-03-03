/**
 * Action Logger interface and implementations.
 * EXTRACTED from OrchestrAI_Labs packages/agent-runtime/src/orchestrator/orchestrator.ts (lines 53-73)
 * MAPPED from postgres-action-logger.ts - in-memory for tests, extensible for Postgres.
 */
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
