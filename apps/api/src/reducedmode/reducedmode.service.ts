import type { ReducedModeRunV1 } from "@bobby/contracts";
import { DexScreenerAdapter, DexPaprikaAdapter } from "@bobby/adapters";
import { executeReducedModeRun, InMemoryRunStore, type RunStore } from "@bobby/engine";
import { apiMetrics } from "../observability/metrics.js";
import type { RunRequest } from "./reducedmode.types.js";

export class ReducedModeService {
  private readonly store: RunStore;
  private readonly dexScreener: DexScreenerAdapter;
  private readonly dexPaprika: DexPaprikaAdapter;
  private lastRunSummary: { run_id: string; status: string; tokens: number; duration_ms: number } | null = null;

  constructor(store?: RunStore) {
    this.store = store ?? new InMemoryRunStore();
    this.dexScreener = new DexScreenerAdapter();
    this.dexPaprika = new DexPaprikaAdapter();
  }

  async executeRun(request: RunRequest): Promise<ReducedModeRunV1> {
    try {
      const run = await executeReducedModeRun(this.dexScreener, this.dexPaprika, {
        mode: request.mode, maxTokens: request.maxTokens, metrics: apiMetrics,
      });
      if (request.mode === "live") await this.store.saveRun(run);
      this.lastRunSummary = { run_id: run.run_id, status: run.low_confidence ? "low_confidence" : "ok", tokens: run.tokens.length, duration_ms: run.duration_ms };
      return run;
    } catch (err) {
      this.lastRunSummary = { run_id: "N/A", status: "fail_closed", tokens: 0, duration_ms: 0 };
      throw err;
    }
  }

  async getRun(runId: string): Promise<ReducedModeRunV1 | null> {
    return this.store.getRun(runId);
  }

  getHealthInfo() {
    return {
      breaker_states: {
        dexscreener: { state: this.dexScreener.getBreakerState(), stats: this.dexScreener.getBreakerStats() },
        dexpaprika: { state: this.dexPaprika.getBreakerState(), stats: this.dexPaprika.getBreakerStats() },
      },
      last_run: this.lastRunSummary,
    };
  }
}
