import { describe, expect, it } from "vitest";
import { createSourceObservation } from "@bot/discovery/source-observation.js";
import { buildDiscoveryEvidence } from "@bot/discovery/discovery-evidence.js";

describe("DiscoveryEvidence", () => {
  it("preserves provenance, completeness, and disagreement explicitly", () => {
    const nowMs = 1_710_000_000_000;
    const observations = [
      createSourceObservation({
        source: "market",
        token: "SOL",
        observedAtMs: nowMs,
        freshnessMs: 0,
        payload: { symbol: "SOL", priceUsd: 100 },
      }),
      createSourceObservation({
        source: "social",
        token: "SOL",
        observedAtMs: nowMs + 100,
        freshnessMs: 2_000,
        payload: { symbol: "SOL" },
        missingFields: ["priceUsd"],
        notes: ["narrative mention only"],
      }),
    ];

    const evidence = buildDiscoveryEvidence({
      token: "SOL",
      observations,
      knownRequiredFields: ["symbol", "priceUsd", "liquidityUsd"],
      sourceFieldPresence: {
        market: ["symbol", "priceUsd"],
        social: ["symbol"],
      },
      sourceDisagreements: {
        priceUsd: ["market", "social"],
      },
      notes: ["seed fixture"],
    });

    expect(evidence.sources).toEqual(["market", "social"]);
    expect(evidence.completeness).toBeCloseTo(2 / 3, 5);
    expect(evidence.status).toBe("PARTIAL");
    expect(evidence.missingFields).toEqual(["liquidityUsd"]);
    expect(evidence.disagreedFields).toEqual(["priceUsd"]);
    expect(evidence.disagreedSources.priceUsd).toEqual(["market", "social"]);
    expect(evidence.observations[1]?.status).toBe("PARTIAL");
    expect(evidence.observations[1]?.isStale).toBe(true);
  });

  it("treats stale-only observations as partial evidence without losing staleness", () => {
    const staleObservation = createSourceObservation({
      source: "market",
      token: "SOL",
      observedAtMs: 100,
      freshnessMs: 5_000,
      payload: { symbol: "SOL", priceUsd: 101 },
    });

    const evidence = buildDiscoveryEvidence({
      token: "SOL",
      observations: [staleObservation],
    });

    expect(staleObservation.status).toBe("OK");
    expect(staleObservation.isStale).toBe(true);
    expect(evidence.status).toBe("PARTIAL");
    expect(evidence.observations[0]?.isStale).toBe(true);
  });
});
