import { describe, expect, it } from "vitest";
import { WatchCandidateRegistry } from "../../src/discovery/watch-candidate-registry.js";

describe("WatchCandidateRegistry", () => {
  it("deduplicates by token, refreshes ttl, and preserves creation history", () => {
    let now = 1_700_000_000_000;
    const registry = new WatchCandidateRegistry({
      now: () => now,
      defaultTtlMs: 1_000,
    });

    const first = registry.upsertCandidate({
      token: "BONK",
      source: "llm_downtrend_worker",
      observationCompleteness: 0.72,
      monitorRecommendation: "monitor",
      confidenceBand: "medium",
      evidenceRefs: ["ev-1"],
    });

    now += 250;

    const second = registry.upsertCandidate({
      token: "BONK",
      source: "llm_downtrend_worker",
      observationCompleteness: 0.91,
      monitorRecommendation: "monitor",
      confidenceBand: "high",
      evidenceRefs: ["ev-2", "ev-1"],
    });

    expect(first.createdAt).toBe(1_700_000_000_000);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBe(now);
    expect(second.ttlExpiresAt).toBeGreaterThan(first.ttlExpiresAt);
    expect(second.evidenceRefs).toEqual(["ev-1", "ev-2"]);
    expect(registry.getActiveCandidates(now)).toHaveLength(1);
  });

  it("prunes expired candidates deterministically", () => {
    let now = 5_000;
    const registry = new WatchCandidateRegistry({
      now: () => now,
      defaultTtlMs: 100,
    });

    registry.upsertCandidate({
      token: "ALPHA",
      source: "llm_downtrend_worker",
      observationCompleteness: 0.75,
      monitorRecommendation: "monitor",
      confidenceBand: "medium",
      evidenceRefs: [],
    });
    registry.upsertCandidate({
      token: "BETA",
      source: "llm_downtrend_worker",
      observationCompleteness: 0.8,
      monitorRecommendation: "monitor",
      confidenceBand: "high",
      evidenceRefs: [],
      ttlExpiresAt: now + 300,
    });

    now += 150;

    const removed = registry.pruneExpired(now);
    expect(removed.map((candidate) => candidate.token)).toEqual(["ALPHA"]);
    expect(registry.getActiveCandidates(now).map((candidate) => candidate.token)).toEqual(["BETA"]);
  });
});
