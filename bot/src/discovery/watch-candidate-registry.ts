import {
  WatchCandidateSchema,
  type WatchCandidate,
} from "./contracts/watch-candidate.js";

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

function sortCandidates(candidates: Iterable<WatchCandidate>): WatchCandidate[] {
  return [...candidates].sort((left, right) => {
    return left.token.localeCompare(right.token) || left.createdAt - right.createdAt;
  });
}

export interface WatchCandidateRegistryOptions {
  defaultTtlMs?: number;
  now?: () => number;
}

export class WatchCandidateRegistry {
  private readonly entries = new Map<string, WatchCandidate>();
  private readonly defaultTtlMs: number;
  private readonly now: () => number;

  constructor(options: WatchCandidateRegistryOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? (() => Date.now());
  }

  upsertCandidate(
    candidate: Omit<WatchCandidate, "ttlExpiresAt" | "createdAt" | "updatedAt"> &
      Partial<Pick<WatchCandidate, "ttlExpiresAt" | "createdAt" | "updatedAt">>
  ): WatchCandidate {
    const nowMs = this.now();
    const existing = this.entries.get(candidate.token);
    const createdAt = existing?.createdAt ?? candidate.createdAt ?? nowMs;
    const updatedAt = candidate.updatedAt ?? nowMs;
    const ttlExpiresAt = Math.max(
      existing?.ttlExpiresAt ?? 0,
      candidate.ttlExpiresAt ?? (updatedAt + this.defaultTtlMs)
    );

    const next = WatchCandidateSchema.parse({
      ...existing,
      ...candidate,
      createdAt,
      updatedAt,
      ttlExpiresAt,
      evidenceRefs: [...new Set([...(existing?.evidenceRefs ?? []), ...(candidate.evidenceRefs ?? [])])].sort(),
    });

    this.entries.set(next.token, next);
    return { ...next, evidenceRefs: [...next.evidenceRefs] };
  }

  getActiveCandidates(nowMs = this.now()): WatchCandidate[] {
    return sortCandidates(
      [...this.entries.values()]
        .filter((candidate) => candidate.ttlExpiresAt > nowMs)
        .map((candidate) => ({ ...candidate, evidenceRefs: [...candidate.evidenceRefs] }))
    );
  }

  pruneExpired(nowMs = this.now()): WatchCandidate[] {
    const removed: WatchCandidate[] = [];
    for (const [token, candidate] of this.entries.entries()) {
      if (candidate.ttlExpiresAt <= nowMs) {
        this.entries.delete(token);
        removed.push({ ...candidate, evidenceRefs: [...candidate.evidenceRefs] });
      }
    }
    return sortCandidates(removed);
  }
}
