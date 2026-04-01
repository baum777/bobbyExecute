import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { ExecutionReport, RpcVerificationReport } from "../core/contracts/trade.js";
import type { DecisionEnvelope } from "../core/contracts/decision-envelope.js";

export type RuntimeCycleIntakeOutcome = "ok" | "stale" | "adapter_error" | "invalid" | "kill_switch_halted";
export type RuntimeCycleOutcome = "success" | "blocked" | "error";

export interface RuntimeCycleExecutionEvidence {
  success: boolean;
  mode?: ExecutionReport["executionMode"];
  paperExecution?: boolean;
  actualAmountOut?: string;
  error?: string;
}

export interface RuntimeCycleVerificationEvidence {
  passed: boolean;
  mode?: RpcVerificationReport["verificationMode"];
  reason?: string;
}

export interface RuntimeCycleDegradedState {
  active: boolean;
  consecutiveCycles: number;
  lastDegradedAt?: string;
  lastRecoveredAt?: string;
  lastReason?: string;
  recoveryCount: number;
  recoveredThisCycle: boolean;
}

export interface RuntimeCycleAdapterHealthSnapshot {
  total: number;
  healthy: number;
  unhealthy: number;
  degraded: boolean;
  degradedAdapterIds: string[];
  unhealthyAdapterIds: string[];
}

export interface RuntimeCycleSummary {
  cycleTimestamp: string;
  traceId: string;
  mode: "dry" | "paper" | "live";
  outcome: RuntimeCycleOutcome;
  intakeOutcome: RuntimeCycleIntakeOutcome;
  advanced: boolean;
  stage: string;
  blocked: boolean;
  blockedReason?: string;
  /** Primary canonical decision artifact for this cycle (when produced by Engine / coordinator). */
  decisionEnvelope?: DecisionEnvelope;
  decisionOccurred: boolean;
  signalOccurred: boolean;
  riskOccurred: boolean;
  chaosOccurred: boolean;
  executionOccurred: boolean;
  verificationOccurred: boolean;
  paperExecutionProduced: boolean;
  verificationMode?: "rpc" | "paper-simulated";
  errorOccurred: boolean;
  error?: string;
  decision?: {
    allowed: boolean;
    direction?: string;
    confidence?: number;
    riskAllowed?: boolean;
    chaosAllowed?: boolean;
    reason?: string;
    tradeIntentId?: string;
  };
  tradeIntentId?: string;
  execution?: RuntimeCycleExecutionEvidence;
  verification?: RuntimeCycleVerificationEvidence;
  degradedState?: RuntimeCycleDegradedState;
  adapterHealth?: RuntimeCycleAdapterHealthSnapshot;
  incidentIds: string[];
}

export interface RuntimeCycleSummaryWriter {
  append(summary: RuntimeCycleSummary): Promise<void>;
  list(limit?: number): Promise<RuntimeCycleSummary[]>;
  getByTraceId(traceId: string): Promise<RuntimeCycleSummary | null>;
}

export class InMemoryRuntimeCycleSummaryWriter implements RuntimeCycleSummaryWriter {
  private readonly summaries: RuntimeCycleSummary[] = [];

  async append(summary: RuntimeCycleSummary): Promise<void> {
    this.summaries.push({ ...summary });
  }

  async list(limit = 100): Promise<RuntimeCycleSummary[]> {
    return this.summaries.slice(-limit);
  }

  async getByTraceId(traceId: string): Promise<RuntimeCycleSummary | null> {
    return this.summaries.find((summary) => summary.traceId === traceId) ?? null;
  }
}

export class FileSystemRuntimeCycleSummaryWriter implements RuntimeCycleSummaryWriter {
  constructor(private readonly filePath: string) {}

  async append(summary: RuntimeCycleSummary): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await appendFile(this.filePath, `${JSON.stringify(summary)}\n`, "utf8");
  }

  async list(limit = 100): Promise<RuntimeCycleSummary[]> {
    if (!existsSync(this.filePath)) return [];
    const content = await readFile(this.filePath, "utf8");
    const parsed = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RuntimeCycleSummary);
    return parsed.slice(-limit);
  }

  async getByTraceId(traceId: string): Promise<RuntimeCycleSummary | null> {
    if (!existsSync(this.filePath)) return null;
    const content = await readFile(this.filePath, "utf8");
    const parsed = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RuntimeCycleSummary);
    return parsed.find((summary) => summary.traceId === traceId) ?? null;
  }
}
