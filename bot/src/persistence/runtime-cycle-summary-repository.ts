import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

export type RuntimeCycleIntakeOutcome = "ok" | "stale" | "adapter_error" | "invalid" | "kill_switch_halted";

export interface RuntimeCycleSummary {
  cycleTimestamp: string;
  mode: "dry" | "paper" | "live";
  intakeOutcome: RuntimeCycleIntakeOutcome;
  advanced: boolean;
  stage: string;
  blocked: boolean;
  blockedReason?: string;
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
  traceId?: string;
}

export interface RuntimeCycleSummaryWriter {
  append(summary: RuntimeCycleSummary): Promise<void>;
  list(limit?: number): Promise<RuntimeCycleSummary[]>;
}

export class InMemoryRuntimeCycleSummaryWriter implements RuntimeCycleSummaryWriter {
  private readonly summaries: RuntimeCycleSummary[] = [];

  async append(summary: RuntimeCycleSummary): Promise<void> {
    this.summaries.push({ ...summary });
  }

  async list(limit = 100): Promise<RuntimeCycleSummary[]> {
    return this.summaries.slice(-limit);
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
}
