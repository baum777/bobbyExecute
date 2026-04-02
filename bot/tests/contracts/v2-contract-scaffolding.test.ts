import { describe, expect, it } from "vitest";
import { SourceObservationSchema } from "@bot/discovery/contracts/source-observation.js";
import { DiscoveryEvidenceSchema } from "@bot/discovery/contracts/discovery-evidence.js";
import { CandidateTokenSchema } from "@bot/discovery/contracts/candidate-token.js";
import { UniverseBuildResultSchema } from "@bot/intelligence/universe/contracts/universe-build-result.js";
import { DataQualityV1Schema } from "@bot/intelligence/quality/contracts/data-quality.v1.js";
import { CQDSnapshotV1Schema } from "@bot/intelligence/cqd/contracts/cqd.snapshot.v1.js";
import { ContextPackV1Schema } from "@bot/intelligence/context/contracts/context-pack.v1.js";
import { TrendReversalObservationV1Schema } from "@bot/intelligence/forensics/contracts/trend-reversal-observation.v1.js";
import * as universeContracts from "@bot/intelligence/universe/contracts/index.js";
import * as contextContracts from "@bot/intelligence/context/contracts/index.js";
import * as cqdContracts from "@bot/intelligence/cqd/contracts/index.js";
import * as qualityContracts from "@bot/intelligence/quality/contracts/index.js";
import * as forensicsContracts from "@bot/intelligence/forensics/contracts/index.js";

describe("v2 contract scaffolding", () => {
  it("parses foundational pre-authority contract scaffolds", () => {
    const nowMs = Date.now();

    const observation = SourceObservationSchema.parse({
      schema_version: "source_observation.v1",
      source: "market",
      token: "SOL",
      chain: "solana",
      observedAtMs: nowMs,
      freshnessMs: 500,
      payloadHash: "obs-hash",
      status: "OK",
      isStale: true,
      rawRef: "raw://market/sol",
      missingFields: [],
      notes: [],
    });
    expect(observation.source).toBe("market");
    expect(observation.isStale).toBe(true);

    const evidence = DiscoveryEvidenceSchema.parse({
      schema_version: "discovery_evidence.v1",
      token: "SOL",
      chain: "solana",
      evidenceId: "ev-1",
      evidenceRef: "discovery_evidence:SOL:ev-1",
      observationRefs: ["obs-1"],
      sources: ["market", "social"],
      observations: [observation],
      collectedAtMs: nowMs,
      payloadHash: "evidence-hash",
      completeness: 0.8,
      status: "COLLECTED",
      missingFields: [],
      disagreedFields: [],
      disagreedSources: {},
      notes: ["scaffold"],
    });
    expect(evidence.observations).toHaveLength(1);

    const candidate = CandidateTokenSchema.parse({
      schema_version: "candidate_token.v1",
      token: "SOL",
      symbol: "SOL",
      chain: "solana",
      discoveryReasons: ["volume_spike"],
      firstSeenMs: nowMs,
      sourceSet: ["market", "social"],
      evidenceRefs: [evidence.evidenceId],
      priority: "medium",
    });
    expect(candidate.priority).toBe("medium");

    const universe = UniverseBuildResultSchema.parse({
      schema_version: "universe_build_result.v1",
      token: candidate.token,
      chain: "solana",
      included: true,
      exclusionReasons: [],
      normalizedFeatures: { confidence: 0.7 },
      sourceCoverage: {
        market: { status: "OK" },
        social: { status: "PARTIAL" },
      },
    });
    expect(universe.included).toBe(true);

    const quality = DataQualityV1Schema.parse({
      version: "1.0",
      token: "SOL",
      chain: "solana",
      status: "pass",
      completeness: 0.95,
      freshnessScore: 0.9,
      divergenceScore: 0.05,
      crossSourceConfidence: 0.92,
      missingCriticalFields: [],
      staleSources: [],
      disagreedSources: [],
      routeViable: true,
      liquidityEligible: true,
      reasons: [],
    });
    expect(quality.status).toBe("pass");

    const cqd = CQDSnapshotV1Schema.parse({
      version: "1.0",
      token: "SOL",
      chain: "solana",
      tsBucket: Math.floor(nowMs / 60_000),
      features: { price_return_1m: 0.01 },
      confidence: 0.8,
      anomalyFlags: [],
      evidencePack: [evidence.evidenceId],
      sources: {
        freshestSourceTsMs: nowMs,
        maxStalenessMs: 1_000,
        priceDivergencePct: 0.01,
      },
      hash: "cqd-hash",
    });
    expect(cqd.chain).toBe("solana");

    const context = ContextPackV1Schema.parse({
      version: "1.0",
      token: "SOL",
      sentiment: 0.2,
      sentimentVelocity: 0.05,
      narrativeTags: ["launch_wave"],
      narrativeConfidence: 0.6,
      spamScore: 0.1,
      coordinationScore: 0.2,
      organicScore: 0.7,
      amplifiedScore: 0.3,
      evidenceRefs: [evidence.evidenceId],
    });
    expect(context.narrativeTags[0]).toBe("launch_wave");

    const trendObservation = TrendReversalObservationV1Schema.parse({
      schema_version: "trend_reversal_observation.v1",
      token: "SOL",
      observationState: "RECLAIM_ATTEMPT",
      structureContext: {
        reclaimZone: [95, 105],
        lowerHigh: 101,
        drawdownPct: 23.4,
      },
      monitoringConfidence: 0.82,
      invalidationFlags: [],
      evidenceRefs: [evidence.evidenceId],
      observedAt: nowMs,
    });
    expect(trendObservation.observationState).toBe("RECLAIM_ATTEMPT");
  });

  it("keeps intelligence contract barrels clean and singular", () => {
    expect(Object.keys(universeContracts).sort()).toEqual([
      "UniverseBuildResultSchema",
      "UniverseCoverageStateSchema",
      "UniverseSourceCoverageEntrySchema",
    ]);
    expect(Object.keys(contextContracts).sort()).toEqual([
      "ContextPackV1Schema",
    ]);
    expect(Object.keys(cqdContracts).sort()).toEqual([
      "CQDSnapshotV1Schema",
    ]);
    expect(Object.keys(qualityContracts).sort()).toEqual([
      "DataQualityV1Schema",
      "DataQualityV1StatusSchema",
    ]);
    expect(Object.keys(forensicsContracts).sort()).toEqual([
      "TrendReversalObservationStateSchema",
      "TrendReversalObservationV1Schema",
      "TrendReversalStructureContextSchema",
      "assertTrendReversalObservationV1",
    ]);
  });
});
