import type { TokenSourceSnapshotV1 } from "@bobby/contracts";

export interface CacheEntry {
  snapshot: TokenSourceSnapshotV1;
  storedAt: number;
}

export interface CacheStore {
  set(contractAddress: string, source: string, snapshot: TokenSourceSnapshotV1): void;
  get(contractAddress: string, source: string, maxStalenessMs: number): TokenSourceSnapshotV1 | null;
  clear(): void;
}

export class InMemoryCacheStore implements CacheStore {
  private readonly cache = new Map<string, CacheEntry>();

  private key(ca: string, source: string): string {
    return `${ca}:${source}`;
  }

  set(contractAddress: string, source: string, snapshot: TokenSourceSnapshotV1): void {
    this.cache.set(this.key(contractAddress, source), { snapshot, storedAt: Date.now() });
  }

  get(contractAddress: string, source: string, maxStalenessMs: number): TokenSourceSnapshotV1 | null {
    const entry = this.cache.get(this.key(contractAddress, source));
    if (!entry) return null;
    if (Date.now() - entry.storedAt > maxStalenessMs) return null;
    return entry.snapshot;
  }

  clear(): void {
    this.cache.clear();
  }
}
