import { ReducedModeRunV1Schema, type ReducedModeRunV1 } from "@reducedmode/contracts";
import { InMemoryMetrics, InMemoryRunStore, ReducedModeEngine } from "@reducedmode/engine";
import { ReducedModeRunRequestSchema, type ReducedModeRunRequest } from "./reducedmode.types.js";

export class ReducedModeService {
  private readonly store = new InMemoryRunStore();
  private readonly metrics = new InMemoryMetrics();
  private readonly engine = new ReducedModeEngine({
    store: this.store,
    metrics: this.metrics,
  });

  async run(input: unknown): Promise<ReducedModeRunV1> {
    const parsedInput = ReducedModeRunRequestSchema.parse(input);
    const run = await this.engine.run({
      ...(parsedInput.mode !== undefined ? { mode: parsedInput.mode } : {}),
      ...(parsedInput.maxTokens !== undefined ? { maxTokens: parsedInput.maxTokens } : {}),
    });
    return ReducedModeRunV1Schema.parse(run);
  }

  async getRun(runId: string): Promise<ReducedModeRunV1 | null> {
    const run = await this.engine.getRun(runId);
    if (!run) return null;
    return ReducedModeRunV1Schema.parse(run);
  }

  async health(): Promise<{
    last_run_status: "ok" | "low_confidence" | "failed" | "never_run";
    breaker_states: Record<string, unknown>;
    p95_latency_ms: number | null;
  }> {
    const snapshot = this.engine.healthSnapshot();
    return {
      last_run_status: snapshot.lastRunStatus ?? "never_run",
      breaker_states: snapshot.breakerStates,
      p95_latency_ms: snapshot.p95LatencyMs,
    };
  }

  metricsSnapshot() {
    return this.metrics.snapshot();
  }
}

export type { ReducedModeRunRequest };
