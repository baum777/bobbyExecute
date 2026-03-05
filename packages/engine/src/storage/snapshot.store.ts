import type { TokenSourceSnapshotV1 } from "@bobby/contracts";

export interface SnapshotStore {
  save(runId: string, snapshots: TokenSourceSnapshotV1[]): Promise<void>;
  load(runId: string): Promise<TokenSourceSnapshotV1[] | null>;
}

export class InMemorySnapshotStore implements SnapshotStore {
  private readonly store = new Map<string, TokenSourceSnapshotV1[]>();

  async save(runId: string, snapshots: TokenSourceSnapshotV1[]): Promise<void> {
    this.store.set(runId, snapshots);
  }

  async load(runId: string): Promise<TokenSourceSnapshotV1[] | null> {
    return this.store.get(runId) ?? null;
  }
}
