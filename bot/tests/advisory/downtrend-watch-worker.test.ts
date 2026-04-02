import { describe, expect, it } from "vitest";
import { parseDowntrendWatchWorkerOutput } from "../../src/advisory/downtrend-watch-worker.js";

describe("downtrend watch worker adapter", () => {
  it("maps strict worker JSON into deterministic watch candidates", () => {
    const nowMs = 1_717_171_717_000;
    const candidates = parseDowntrendWatchWorkerOutput({
      nowMs,
      rawDiscoveryInputs: {
        candidates: [
          {
            token: "BONK",
            observationCompleteness: 0.82,
            monitorRecommendation: "monitor",
            evidenceRefs: ["ev-b", "ev-a", "ev-a"],
          },
        ],
      },
    });

    expect(candidates).toEqual([
      {
        token: "BONK",
        source: "llm_downtrend_worker",
        observationCompleteness: 0.82,
        monitorRecommendation: "monitor",
        ttlExpiresAt: nowMs + 6 * 60 * 60 * 1000,
        createdAt: nowMs,
        updatedAt: nowMs,
        confidenceBand: "medium",
        evidenceRefs: ["ev-a", "ev-b"],
      },
    ]);
  });

  it("rejects malformed worker payloads", () => {
    expect(() =>
      parseDowntrendWatchWorkerOutput({
        nowMs: 1,
        rawDiscoveryInputs: {
          candidates: [
            {
              token: "BONK",
              observationCompleteness: 2,
              monitorRecommendation: "monitor",
            },
          ],
        },
      })
    ).toThrow();
  });
});
