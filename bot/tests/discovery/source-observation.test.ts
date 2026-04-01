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
      missingFields: [],
      notes: [],
    });

    expect(parsed.status).toBe("OK");
  });

  it("does not silently normalize partial or stale observations to OK", () => {
    const partial = createSourceObservation({
      source: "social",
      token: "SOL",
      observedAtMs: 10,
      freshnessMs: 0,
      payload: { mentionCount: 2 },
      missingFields: ["symbol"],
    });
    expect(partial.status).toBe("PARTIAL");

    const stale = createSourceObservation({
      source: "market",
      token: "SOL",
      observedAtMs: 10,
      freshnessMs: 1_000,
      payload: { priceUsd: 100 },
    });
    expect(stale.status).toBe("STALE");

    const errored = withSourceObservationStatus(stale, "ERROR");
    expect(errored.status).toBe("ERROR");
  });
});
