import type { ReducedModeRunV1 } from "@bobby/contracts";
import { DexScreenerAdapter, DexPaprikaAdapter } from "@bobby/adapters";
import { executeReducedModeRun, InMemoryRunStore, type RunStore } from "@bobby/engine";
import type { RunRequest } from "./reducedmode.types.js";

export class ReducedModeService {
  private readonly store: RunStore;
  private readonly dexScreener: DexScreenerAdapter;
  private readonly dexPaprika: DexPaprikaAdapter;
  private lastRunStatus: string = "none";

  constructor(store?: RunStore) {
    this.store = store ?? new InMemoryRunStore();
    this.dexScreener = new DexScreenerAdapter();
    this.dexPaprika = new DexPaprikaAdapter();
  }

  async executeRun(request: RunRequest): Promise<ReducedModeRunV1> {
    this.lastRunStatus = "running";
    try {
      const run = await executeReducedModeRun(
        this.dexScreener,
        this.dexPaprika,
        {
          mode: request.mode,
          maxTokens: request.maxTokens,
        },
      );
      await this.store.saveRun(run);
      this.lastRunStatus = "completed";
      return run;
    } catch (err) {
      this.lastRunStatus = "failed";
      throw err;
    }
  }

  async getRun(runId: string): Promise<ReducedModeRunV1 | null> {
    return this.store.getRun(runId);
  }

  getHealthInfo() {
    return {
      last_run_status: this.lastRunStatus,
      breaker_states: {
        dexscreener: this.dexScreener.getBreakerState(),
        dexpaprika: this.dexPaprika.getBreakerState(),
      },
    };
  }
}
