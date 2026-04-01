import { describe, expect, it } from "vitest";
import { createSourceObservation } from "@bot/discovery/source-observation.js";
import { buildDiscoveryEvidence } from "@bot/discovery/discovery-evidence.js";
import { createCandidateToken } from "@bot/discovery/candidate-discovery.js";

describe("candidate discovery", () => {
  it("produces deterministic candidate tokens for the same evidence", () => {
    const nowMs = 1_717_171_717_000;
    const marketObservation = createSourceObservation({
      source: "market",
      token: "BONK",
      observedAtMs: nowMs,
      freshnessMs: 0,
      payload: { symbol: "BONK", volume: 1_000_000 },
      notes: ["volume_spike"],
    });
    const socialObservation = createSourceObservation({
      source: "social",
      token: "BONK",
      observedAtMs: nowMs + 500,
      freshnessMs: 0,
      payload: { mentions: 120 },
      notes: ["social_mentions"],
    });
    const evidence = buildDiscoveryEvidence({
      token: "BONK",
      observations: [marketObservation, socialObservation],
      notes: ["volume_spike", "social_mentions"],
    });

    const a = createCandidateToken(evidence, { symbol: "BONK" });
    const b = createCandidateToken(evidence, { symbol: "BONK" });

    expect(a).toEqual(b);
    expect(a.priority).toBe("high");
    expect(a.discoveryReasons).toEqual(["social_mentions", "volume_spike"]);
    expect(a.sourceSet).toEqual(["market", "social"]);
  });
});
