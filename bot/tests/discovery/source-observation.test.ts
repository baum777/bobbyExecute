import { describe, expect, it } from "vitest";
import { SourceObservationSchema } from "@bot/discovery/contracts/source-observation.js";
import { createSourceObservation, withSourceObservationStatus } from "@bot/discovery/source-observation.js";

describe("source observation", () => {
  it("parses explicit status values", () => {
    const parsed = SourceObservationSchema.parse({
      schema_version: "source_observation.v1",
      source: "market",
      token: "SOL",
      chain: "solana",
      observedAtMs: 1,
      freshnessMs: 0,
      payloadHash: "hash",
      status: "OK",
      isStale: false,
      missingFields: [],
      notes: [],
    });

    expect(parsed.status).toBe("OK");
    expect(parsed.isStale).toBe(false);
  });

  it("represents partiality and staleness independently", () => {
    const partial = createSourceObservation({
      source: "social",
      token: "SOL",
      observedAtMs: 10,
      freshnessMs: 0,
      payload: { mentionCount: 2 },
      missingFields: ["symbol"],
    });
    expect(partial.status).toBe("PARTIAL");
    expect(partial.isStale).toBe(false);

    const staleOnly = createSourceObservation({
      source: "market",
      token: "SOL",
      observedAtMs: 10,
      freshnessMs: 1_000,
      payload: { priceUsd: 100 },
    });
    expect(staleOnly.status).toBe("OK");
    expect(staleOnly.isStale).toBe(true);

    const stalePartial = createSourceObservation({
      source: "wallet",
      token: "SOL",
      observedAtMs: 10,
      freshnessMs: 1_000,
      payload: { holderCount: 12 },
      missingFields: ["symbol", "holderCount", "symbol"],
      notes: ["wallet_gap", "wallet_gap", "delayed_feed"],
    });
    expect(stalePartial.status).toBe("PARTIAL");
    expect(stalePartial.isStale).toBe(true);
    expect(stalePartial.missingFields).toEqual(["holderCount", "symbol"]);
    expect(stalePartial.notes).toEqual(["delayed_feed", "wallet_gap"]);

    const errored = withSourceObservationStatus(staleOnly, "ERROR");
    expect(errored.status).toBe("ERROR");
    expect(errored.isStale).toBe(true);
  });
});
