import { describe, expect, it } from "vitest";
import { CQDSnapshotV1Schema } from "@bot/core/contracts/cqd.js";
import { createSourceObservation } from "@bot/discovery/source-observation.js";
import { buildDiscoveryEvidence } from "@bot/discovery/discovery-evidence.js";
import { createCandidateToken } from "@bot/discovery/candidate-discovery.js";
import { buildUniverseResult } from "@bot/intelligence/universe/build-universe-result.js";
import { buildDataQualityV1 } from "@bot/intelligence/quality/build-data-quality.js";
import { buildCQDSnapshotV1 } from "@bot/intelligence/cqd/build-cqd.js";

const BASE_MS = 1_730_000_000_000;

function buildUpstreamArtifacts() {
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
    notes: ["wave1", "cqd"],
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
      price_return_1m: 0.01,
    },
  });
  const quality = buildDataQualityV1({
    evidence,
    candidates: [candidate],
    universe,
  });

  return { evidence, candidate, universe, quality };
}

function buildDegradedArtifacts() {
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
    notes: ["wave1", "cqd", "degraded"],
  });

  const candidate = createCandidateToken(evidence, { symbol: "SOL" });
  const universe = buildUniverseResult({
    token: "SOL",
    observationsBySource: {
      market: "OK",
      social: "PARTIAL",
    },
    normalizedFeatures: {
      liquidityUsd: 900_000,
      price_return_1m: 0.01,
    },
  });
  const quality = buildDataQualityV1({
    evidence,
    candidates: [candidate],
    universe,
  });

  return { evidence, candidate, universe, quality };
}

describe("Wave 1 CQD boundary", () => {
  it("builds a compact replay-ready CQD snapshot from typed upstream artifacts", () => {
    const { evidence, candidate, universe, quality } = buildUpstreamArtifacts();
    const cqd = buildCQDSnapshotV1({
      evidence,
      candidates: [candidate],
      universe,
      quality,
    });

    expect(CQDSnapshotV1Schema.parse(cqd)).toEqual(cqd);
    expect(cqd.schema_version).toBe("cqd.snapshot.v1");
    expect(cqd.token).toBe("SOL");
    expect(cqd.chain).toBe("solana");
    expect(cqd.ts_bucket).toBe(Math.floor(Date.parse(quality.timestamp) / 60_000));
    expect(cqd.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(cqd.features).toEqual({
      liquidityUsd: 1_000_000,
      price_return_1m: 0.01,
    });
    expect(cqd.source_summaries).toEqual([
      {
        source: "market",
        freshness_ms: 0,
        status: "OK",
      },
      {
        source: "social",
        freshness_ms: 0,
        status: "OK",
      },
    ]);
    expect(cqd.sources).toEqual({
      freshest_source_ts_ms: BASE_MS + 1_000,
      max_staleness_ms: 0,
    });
    expect(cqd.anomaly_flags).toEqual([]);
    expect(cqd.confidence).toBeCloseTo(quality.crossSourceConfidence, 5);
    expect(cqd.evidence_pack).toEqual(expect.arrayContaining([
      expect.stringContaining("candidates:SOL"),
      expect.stringContaining("evidence:"),
      expect.stringContaining("evidence_status:COLLECTED"),
      expect.stringContaining("quality:pass"),
      expect.stringContaining("sources:market=OK@0|social=OK@0"),
      expect.stringContaining("universe:included:none"),
    ]));
    expect(cqd.evidence_pack.length).toBeLessThanOrEqual(6);
  });

  it("keeps the snapshot deterministic when upstream ordering changes", () => {
    const { evidence, candidate, universe, quality } = buildUpstreamArtifacts();
    const reorderedEvidence = buildDiscoveryEvidence({
      token: evidence.token,
      observations: [...evidence.observations].reverse(),
      knownRequiredFields: ["symbol", "priceUsd", "liquidityUsd"],
      sourceFieldPresence: {
        social: ["symbol", "priceUsd", "liquidityUsd"],
        market: ["symbol", "priceUsd", "liquidityUsd"],
      },
      notes: ["wave1", "cqd"],
    });
    const reorderedUniverse = buildUniverseResult({
      token: universe.token,
      observationsBySource: {
        social: "OK",
        market: "OK",
      },
      normalizedFeatures: {
        price_return_1m: 0.01,
      liquidityUsd: 1_000_000,
      },
    });
    const reorderedCqd = buildCQDSnapshotV1({
      evidence: reorderedEvidence,
      candidates: [candidate],
      universe: reorderedUniverse,
      quality,
    });
    const originalCqd = buildCQDSnapshotV1({
      evidence,
      candidates: [candidate],
      universe,
      quality,
    });

    expect(reorderedCqd).toEqual(originalCqd);
    expect(reorderedCqd.hash).toBe(originalCqd.hash);
  });

  it("fails closed for rejected evidence and excluded universe inputs", () => {
    const { evidence, candidate, universe, quality } = buildUpstreamArtifacts();
    const rejectedEvidence = {
      ...evidence,
      status: "REJECTED" as const,
    };
    const degradedQuality = {
      ...quality,
      status: "degraded" as const,
      routeViable: true,
      liquidityEligible: true,
    };
    const excludedUniverse = {
      ...universe,
      included: false,
      exclusionReasons: ["SOURCE_ERROR:market"],
    };

    expect(() =>
      buildCQDSnapshotV1({
        evidence: rejectedEvidence,
        candidates: [candidate],
        universe,
        quality: degradedQuality,
      })
    ).toThrow("CQD_BUILD_BLOCKED");

    expect(() =>
      buildCQDSnapshotV1({
        evidence,
        candidates: [candidate],
        universe: excludedUniverse,
        quality,
      })
    ).toThrow("CQD_BUILD_BLOCKED");
  });

  it("represents degraded upstream truth explicitly without implying authority", () => {
    const { evidence, candidate, universe, quality } = buildDegradedArtifacts();
    const cqd = buildCQDSnapshotV1({
      evidence,
      candidates: [candidate],
      universe,
      quality,
    });

    expect(cqd.anomaly_flags).toContain("QUALITY_DEGRADED");
    expect(cqd.anomaly_flags).toContain("DISAGREED_SOURCES");
    expect(cqd.anomaly_flags).toContain("LOW_CONFIDENCE");
    expect(cqd.confidence).toBeLessThan(quality.crossSourceConfidence);
    expect(cqd.evidence_pack).toEqual(expect.arrayContaining([
      expect.stringContaining("quality:degraded"),
      expect.stringContaining("disagree:priceUsd"),
      expect.stringContaining("stale:social"),
    ]));
    expect(cqd.source_summaries).toEqual([
      {
        source: "market",
        freshness_ms: 0,
        status: "OK",
      },
      {
        source: "social",
        freshness_ms: 35_000,
        status: "STALE",
      },
    ]);
  });
});
