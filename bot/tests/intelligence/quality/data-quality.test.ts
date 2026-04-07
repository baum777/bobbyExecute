import { describe, expect, it } from "vitest";
import { DataQualityReasonCodeSchema } from "@bot/core/contracts/dataquality.js";
import { createSourceObservation } from "@bot/discovery/source-observation.js";
import { buildDiscoveryEvidence } from "@bot/discovery/discovery-evidence.js";
import { createCandidateToken } from "@bot/discovery/candidate-discovery.js";
import { buildUniverseResult } from "@bot/intelligence/universe/build-universe-result.js";
import { buildDataQualityV1 } from "@bot/intelligence/quality/build-data-quality.js";

const BASE_MS = 1_720_000_000_000;

function buildPassArtifacts() {
  const observations = [
    createSourceObservation({
      source: "market",
      token: "SOL",
      observedAtMs: BASE_MS,
      freshnessMs: 0,
      payload: { symbol: "SOL", priceUsd: 100, liquidityUsd: 1_000_000 },
      notes: ["market_snapshot"],
    }),
    createSourceObservation({
      source: "social",
      token: "SOL",
      observedAtMs: BASE_MS + 1_000,
      freshnessMs: 0,
      payload: { symbol: "SOL", priceUsd: 100, liquidityUsd: 1_000_000 },
      notes: ["social_snapshot"],
    }),
  ];

  const evidence = buildDiscoveryEvidence({
    token: "SOL",
    observations,
    knownRequiredFields: ["symbol", "priceUsd", "liquidityUsd"],
    sourceFieldPresence: {
      market: ["symbol", "priceUsd", "liquidityUsd"],
      social: ["symbol", "priceUsd", "liquidityUsd"],
    },
    notes: ["wave1"],
  });

  const candidate = createCandidateToken(evidence, { symbol: "SOL" });
  const universe = buildUniverseResult({
    token: "SOL",
    observationsBySource: {
      market: "OK",
      social: "OK",
    },
    normalizedFeatures: {
      liquidityUsd: 1_000_000,
    },
  });

  return { observations, evidence, candidate, universe };
}

function buildStaleArtifacts() {
  const observations = [
    createSourceObservation({
      source: "market",
      token: "SOL",
      observedAtMs: BASE_MS,
      freshnessMs: 0,
      payload: { symbol: "SOL", priceUsd: 100, liquidityUsd: 1_000_000 },
      notes: ["market_snapshot"],
    }),
    createSourceObservation({
      source: "social",
      token: "SOL",
      observedAtMs: BASE_MS + 1_000,
      freshnessMs: 35_000,
      payload: { symbol: "SOL", priceUsd: 104, liquidityUsd: 1_000_000 },
      notes: ["social_snapshot"],
    }),
  ];

  const evidence = buildDiscoveryEvidence({
    token: "SOL",
    observations,
    knownRequiredFields: ["symbol", "priceUsd", "liquidityUsd"],
    sourceFieldPresence: {
      market: ["symbol", "priceUsd", "liquidityUsd"],
      social: ["symbol", "priceUsd", "liquidityUsd"],
    },
    sourceDisagreements: {
      priceUsd: ["market", "social"],
    },
    notes: ["wave1", "stale-gap"],
  });

  const candidate = createCandidateToken(evidence, { symbol: "SOL" });
  const universe = buildUniverseResult({
    token: "SOL",
    observationsBySource: {
      market: "OK",
      social: "PARTIAL",
    },
    normalizedFeatures: {
      liquidityUsd: 750_000,
    },
  });

  return { observations, evidence, candidate, universe };
}

function buildMissingArtifacts() {
  const observations = [
    createSourceObservation({
      source: "market",
      token: "SOL",
      observedAtMs: BASE_MS,
      freshnessMs: 0,
      payload: { symbol: "SOL", priceUsd: 100 },
      missingFields: ["liquidityUsd"],
      notes: ["market_snapshot"],
    }),
    createSourceObservation({
      source: "social",
      token: "SOL",
      observedAtMs: BASE_MS + 1_000,
      freshnessMs: 0,
      payload: { symbol: "SOL", priceUsd: 100 },
      missingFields: ["liquidityUsd"],
      notes: ["social_snapshot"],
    }),
  ];

  const evidence = buildDiscoveryEvidence({
    token: "SOL",
    observations,
    knownRequiredFields: ["symbol", "priceUsd", "liquidityUsd"],
    sourceFieldPresence: {
      market: ["symbol", "priceUsd"],
      social: ["symbol", "priceUsd"],
    },
    notes: ["wave1", "missing-liquidity"],
  });

  const candidate = createCandidateToken(evidence, { symbol: "SOL" });
  const universe = buildUniverseResult({
    token: "SOL",
    observationsBySource: {
      market: "OK",
      social: "OK",
    },
    normalizedFeatures: {
      liquidityUsd: 900_000,
    },
  });

  return { observations, evidence, candidate, universe };
}

describe("Wave 1 data quality gate", () => {
  it("builds a coherent upstream chain and passes when inputs are complete and fresh", () => {
    const { evidence, candidate, universe } = buildPassArtifacts();
    const quality = buildDataQualityV1({
      evidence,
      candidates: [candidate],
      universe,
    });

    expect(quality.status).toBe("pass");
    expect(quality.routeViable).toBe(true);
    expect(quality.liquidityEligible).toBe(true);
    expect(quality.missingCriticalFields).toEqual([]);
    expect(quality.staleSources).toEqual([]);
    expect(quality.disagreedSources).toEqual({});
    expect(quality.reasonCodes).toEqual([]);
    expect(quality.discrepancy_flags).toEqual([]);
    expect(quality.completeness).toBeCloseTo(1, 5);
    expect(quality.freshness).toBeCloseTo(1, 5);
    expect(quality.crossSourceConfidence).toBeGreaterThan(0.85);
    expect(quality.confidence).toBe(quality.crossSourceConfidence);
    expect(quality.traceId.startsWith("dq:")).toBe(true);
    expect(quality.timestamp).toBe(new Date(BASE_MS + 1_000).toISOString());
    expect(quality.source_breakdown.market.source).toBe("market");
    expect(quality.source_breakdown.social.source).toBe("social");
    expect(quality.reasonCodes.every((code) => DataQualityReasonCodeSchema.options.includes(code))).toBe(true);
  });

  it("fails closed when critical fields are missing", () => {
    const { evidence, candidate, universe } = buildMissingArtifacts();
    const quality = buildDataQualityV1({
      evidence,
      candidates: [candidate],
      universe,
    });

    expect(quality.status).toBe("fail");
    expect(quality.routeViable).toBe(false);
    expect(quality.liquidityEligible).toBe(false);
    expect(quality.missingCriticalFields).toContain("liquidityUsd");
    expect(quality.reasonCodes).toContain("DQ_MISSING_CRITICAL_FIELDS");
    expect(quality.reasonCodes).toContain("DQ_ROUTE_NOT_VIABLE");
    expect(quality.reasonCodes).toContain("DQ_LIQUIDITY_INELIGIBLE");
    expect(quality.reasonCodes.every((code) => DataQualityReasonCodeSchema.options.includes(code))).toBe(true);
  });

  it("marks stale and disagreed sources explicitly without changing the upstream shape", () => {
    const { evidence, candidate, universe } = buildStaleArtifacts();
    const quality = buildDataQualityV1({
      evidence,
      candidates: [candidate],
      universe,
    });

    expect(quality.status).toBe("degraded");
    expect(quality.routeViable).toBe(true);
    expect(quality.liquidityEligible).toBe(true);
    expect(quality.staleSources).toEqual(["social"]);
    expect(quality.disagreedSources.priceUsd).toEqual(["market", "social"]);
    expect(quality.reasonCodes).toContain("DQ_STALE_SOURCES");
    expect(quality.reasonCodes).toContain("DQ_DISAGREED_SOURCES");
    expect(quality.reasonCodes).toContain("DQ_LOW_FRESHNESS");
    expect(quality.discrepancy_flags.every((flag) => flag.startsWith("data_quality_divergence:"))).toBe(true);
    expect(quality.freshness).toBeLessThan(1);
    expect(quality.discrepancy).toBeGreaterThan(0);
  });

  it("keeps provider disagreement degradations deterministic for the same evidence", () => {
    const { evidence, candidate, universe } = buildStaleArtifacts();
    const qualityA = buildDataQualityV1({
      evidence,
      candidates: [candidate],
      universe,
    });
    const qualityB = buildDataQualityV1({
      evidence,
      candidates: [candidate],
      universe,
    });

    expect(qualityA.status).toBe("degraded");
    expect(qualityA.reasonCodes).toContain("DQ_DISAGREED_SOURCES");
    expect(qualityA.disagreedSources.priceUsd).toEqual(["market", "social"]);
    expect(qualityA).toEqual(qualityB);
  });

  it("is deterministic when observations and candidates are reordered", () => {
    const passArtifacts = buildPassArtifacts();
    const candidateTwin = { ...passArtifacts.candidate, symbol: undefined };
    const reversedObservations = [...passArtifacts.observations].reverse();

    const evidenceA = buildDiscoveryEvidence({
      token: "SOL",
      observations: passArtifacts.observations,
      knownRequiredFields: ["symbol", "priceUsd", "liquidityUsd"],
      sourceFieldPresence: {
        market: ["symbol", "priceUsd", "liquidityUsd"],
        social: ["symbol", "priceUsd", "liquidityUsd"],
      },
      notes: ["wave1"],
    });
    const evidenceB = buildDiscoveryEvidence({
      token: "SOL",
      observations: reversedObservations,
      knownRequiredFields: ["symbol", "priceUsd", "liquidityUsd"],
      sourceFieldPresence: {
        market: ["symbol", "priceUsd", "liquidityUsd"],
        social: ["symbol", "priceUsd", "liquidityUsd"],
      },
      notes: ["wave1"],
    });
    const candidateA = createCandidateToken(evidenceA, { symbol: "SOL" });
    const candidateB = { ...candidateA, symbol: undefined };
    const universeA = buildUniverseResult({
      token: "SOL",
      observationsBySource: {
        market: "OK",
        social: "OK",
      },
      normalizedFeatures: {
        liquidityUsd: 1_000_000,
      },
    });
    const universeB = buildUniverseResult({
      token: "SOL",
      observationsBySource: {
        social: "OK",
        market: "OK",
      },
      normalizedFeatures: {
        liquidityUsd: 1_000_000,
      },
    });

    const qualityA = buildDataQualityV1({
      evidence: evidenceA,
      candidates: [candidateA, candidateTwin],
      universe: universeA,
    });
    const qualityB = buildDataQualityV1({
      evidence: evidenceB,
      candidates: [candidateB, candidateA],
      universe: universeB,
    });

    expect(qualityA).toEqual(qualityB);
  });
});
