/**
 * Execution repository - stores execution and refusal evidence for replay/audit.
 * Append-only evidence / provenance context only; never canonical decision history.
 * Wave 7: upgraded from best-effort in-memory storage to durable JSONL persistence.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { ExecutionReport } from "../core/contracts/trade.js";

export type ExecutionEvidenceKind =
  | "decision_summary"
  | "execution_summary"
  | "live_refusal_summary"
  | "guardrail_refusal_summary"
  | "verification_outcome"
  | "control_action"
  | "runtime_transition";

export interface ExecutionEvidenceRecord {
  id: string;
  at: string;
  kind: ExecutionEvidenceKind;
  traceId?: string;
  tradeIntentId?: string;
  mode?: "dry" | "paper" | "live";
  success?: boolean;
  allowed?: boolean;
  refusalCode?: string;
  failureStage?: string;
  failureCode?: string;
  stage?: string;
  message?: string;
  operatorActionRequired?: boolean;
  details?: Record<string, string | number | boolean | null | undefined>;
}

export interface ExecutionEvidenceRepository {
  append(record: ExecutionEvidenceRecord): Promise<void>;
  list(limit?: number): Promise<ExecutionEvidenceRecord[]>;
  listByTraceId(traceId: string): Promise<ExecutionEvidenceRecord[]>;
  listByTradeIntentId(tradeIntentId: string): Promise<ExecutionEvidenceRecord[]>;
}

const legacyExecutionStore: ExecutionReport[] = [];

export class InMemoryExecutionRepository implements ExecutionEvidenceRepository {
  private readonly records: ExecutionEvidenceRecord[] = [];

  async append(record: ExecutionEvidenceRecord): Promise<void> {
    this.records.push({ ...record, details: record.details ? { ...record.details } : undefined });
  }

  async list(limit = 100): Promise<ExecutionEvidenceRecord[]> {
    return this.records.slice(-limit);
  }

  async listByTraceId(traceId: string): Promise<ExecutionEvidenceRecord[]> {
    return this.records.filter((record) => record.traceId === traceId);
  }

  async listByTradeIntentId(tradeIntentId: string): Promise<ExecutionEvidenceRecord[]> {
    return this.records.filter((record) => record.tradeIntentId === tradeIntentId);
  }
}

export class FileSystemExecutionRepository implements ExecutionEvidenceRepository {
  constructor(private readonly filePath: string) {}

  async append(record: ExecutionEvidenceRecord): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  async list(limit = 100): Promise<ExecutionEvidenceRecord[]> {
    if (!existsSync(this.filePath)) return [];
    const content = await readFile(this.filePath, "utf8");
    const records = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ExecutionEvidenceRecord);
    return records.slice(-limit);
  }

  async listByTraceId(traceId: string): Promise<ExecutionEvidenceRecord[]> {
    if (!existsSync(this.filePath)) return [];
    const content = await readFile(this.filePath, "utf8");
    const records = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ExecutionEvidenceRecord);
    return records.filter((record) => record.traceId === traceId);
  }

  async listByTradeIntentId(tradeIntentId: string): Promise<ExecutionEvidenceRecord[]> {
    if (!existsSync(this.filePath)) return [];
    const content = await readFile(this.filePath, "utf8");
    const records = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ExecutionEvidenceRecord);
    return records.filter((record) => record.tradeIntentId === tradeIntentId);
  }
}

/**
 * Legacy best-effort helpers retained for compatibility with earlier wave tests.
 */
export function appendExecutionRecord(record: ExecutionReport): void {
  legacyExecutionStore.push({ ...record });
}

export function getExecutionByTradeIntentId(tradeIntentId: string): ExecutionReport[] {
  return legacyExecutionStore.filter((record) => record.tradeIntentId === tradeIntentId);
}

export function getRecentExecutions(limit = 100): ExecutionReport[] {
  return legacyExecutionStore.slice(-limit);
}
