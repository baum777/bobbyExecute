import type { ReducedModeRunV1 } from "@reducedmode/contracts";

export interface RunStore {
  saveRun(run: ReducedModeRunV1): Promise<void>;
  getRun(runId: string): Promise<ReducedModeRunV1 | null>;
}

export class InMemoryRunStore implements RunStore {
  private readonly runs = new Map<string, ReducedModeRunV1>();

  async saveRun(run: ReducedModeRunV1): Promise<void> {
    this.runs.set(run.run_id, run);
  }

  async getRun(runId: string): Promise<ReducedModeRunV1 | null> {
    return this.runs.get(runId) ?? null;
  }
}

export class SqliteRunStoreStub implements RunStore {
  async saveRun(): Promise<void> {
    throw new Error("SqliteRunStore not implemented in V1");
  }

  async getRun(): Promise<ReducedModeRunV1 | null> {
    throw new Error("SqliteRunStore not implemented in V1");
  }
}
