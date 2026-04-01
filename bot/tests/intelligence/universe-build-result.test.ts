import { describe, expect, it } from "vitest";
import { buildUniverseResult } from "@bot/intelligence/universe/build-universe-result.js";

describe("buildUniverseResult", () => {
  it("returns deterministic inclusion output for same inputs", () => {
    const input = {
      token: "SOL",
      chain: "solana" as const,
      observationsBySource: {
        market: "OK" as const,
        social: "PARTIAL" as const,
      },
      normalizedFeatures: {
        completeness: 0.9,
        freshness: 1,
      },
    };

    const a = buildUniverseResult(input);
    const b = buildUniverseResult(input);

    expect(a).toEqual(b);
    expect(a.included).toBe(true);
    expect(a.sourceCoverage.market.status).toBe("OK");
    expect(a.sourceCoverage.social.status).toBe("PARTIAL");
  });

  it("emits explicit exclusion reasons for insufficient source state", () => {
    const result = buildUniverseResult({
      token: "SOL",
      chain: "solana",
      observationsBySource: {
        market: "ERROR",
        social: "STALE",
      },
      normalizedFeatures: {},
    });

    expect(result.included).toBe(false);
    expect(result.exclusionReasons).toContain("SOURCE_ERROR:market");
    expect(result.exclusionReasons).toContain("SOURCE_STALE:social");
  });
});
