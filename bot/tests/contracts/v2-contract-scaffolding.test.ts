import { describe, expect, it } from "vitest";
import { SourceObservationSchema } from "@bot/discovery/contracts/source-observation.js";
import { DiscoveryEvidenceSchema } from "@bot/discovery/contracts/discovery-evidence.js";
import { CandidateTokenSchema } from "@bot/discovery/contracts/candidate-token.js";
import { UniverseBuildResultSchema } from "@bot/intelligence/universe/contracts/universe-build-result.js";
import { DataQualityV1Schema } from "@bot/intelligence/quality/contracts/data-quality.v1.js";
import { CQDSnapshotV1Schema } from "@bot/intelligence/cqd/contracts/cqd.snapshot.v1.js";
import { DataQualityV1Schema as CoreDataQualityV1Schema } from "@bot/core/contracts/dataquality.js";
import { CQDSnapshotV1Schema as CoreCQDSnapshotV1Schema } from "@bot/core/contracts/cqd.js";
import { ContextPackV1Schema } from "@bot/intelligence/context/contracts/context-pack.v1.js";
import * as discoveryContracts from "@bot/discovery/contracts/index.js";
import { SignalPackV1Schema, TrendReversalMonitorInputV1Schema } from "@bot/intelligence/forensics/contracts/index.js";
import { buildSignalPackV1, buildTrendReversalMonitorInputV1 } from "@bot/intelligence/forensics/build-signal-pack.js";
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
      schema_version: "data_quality.v1",
      traceId: "quality-1",
      timestamp: new Date(nowMs).toISOString(),
      completeness: 0.95,
      freshness: 0.9,
      discrepancy: 0,
      sourceReliability: 0.93,
      crossSourceConfidence: 0.92,
      confidence: 0.92,
      source_breakdown: {
        market: {
          source: "market",
          completeness: 1,
          freshness: 1,
          reliability: 1,
          latency_ms: 500,
        },
      },
      discrepancy_flags: [],
      missingCriticalFields: [],
      staleSources: [],
      disagreedSources: {},
      routeViable: true,
      liquidityEligible: true,
      status: "pass",
      reasonCodes: [],
    });
    expect(quality.status).toBe("pass");

    expect(DataQualityV1Schema).toBe(CoreDataQualityV1Schema);

    const cqd = CQDSnapshotV1Schema.parse({
      schema_version: "cqd.snapshot.v1",
      chain: "solana",
      token: "SOL",
      ts_bucket: Math.floor(nowMs / 60_000),
      features: {
        liquidity_depth: 1_000_000,
        price_return_1m: 0.01,
      },
      confidence: 0.8,
      anomaly_flags: [],
      evidence_pack: [evidence.evidenceId],
      source_summaries: [
        {
          source: "market",
          freshness_ms: 500,
          status: "OK",
        },
        {
          source: "social",
          freshness_ms: 1_000,
          status: "PARTIAL",
        },
      ],
      sources: {
        freshest_source_ts_ms: nowMs,
        max_staleness_ms: 1_000,
        price_divergence_pct: 0.01,
      },
      hash: "cqd-hash",
    });
    expect(cqd.chain).toBe("solana");

    expect(CQDSnapshotV1Schema).toBe(CoreCQDSnapshotV1Schema);

    const signalPack = buildSignalPackV1({
      token: "SOL",
      traceId: "signal-pack-1",
      dataQuality: quality,
      cqdSnapshot: cqd,
      evidenceRefs: [evidence.evidenceId],
      marketStructureHints: {
        observedHigh: 108,
        observedLow: 94,
        lastPrice: 101,
        drawdownPct: 0.07,
        rangePct: 0.12,
        reclaimGapPct: 0.03,
        priceReturnPct: -0.02,
        notes: ["market_structure"],
      },
      holderFlowHints: {
        holderCount: 1_280,
        holderConcentrationPct: 0.22,
        holderTurnoverPct: 0.06,
        netFlowUsd: -2_400,
        participationPct: 0.57,
        notes: ["holder_flow"],
      },
      manipulationFlagsHints: {
        washTradingSuspected: false,
        spoofingSuspected: null,
        concentrationFragility: true,
        anomalyFlags: ["manual_watch"],
        notes: ["manipulation_flags"],
      },
      sourceCoverageHints: {
        market: {
          status: "OK",
          completeness: 1,
          freshness: 1,
          freshnessMs: 500,
          evidenceRefs: [evidence.evidenceId],
        },
        social: {
          status: "STALE",
          completeness: 0.5,
          freshness: 0.4,
          freshnessMs: 1_000,
          evidenceRefs: [evidence.evidenceId],
        },
      },
      notes: ["signal_pack"],
    });
    expect(SignalPackV1Schema.parse(signalPack)).toEqual(signalPack);

    const monitorInput = buildTrendReversalMonitorInputV1({
      token: "SOL",
      traceId: "monitor-input-1",
      dataQuality: quality,
      cqdSnapshot: cqd,
      signalPack,
      contextAvailability: {
        supplementalHintsAvailable: true,
        missingSupplementalHints: ["holder_wallet_context"],
      },
      notes: ["monitor_input"],
    });
    expect(TrendReversalMonitorInputV1Schema.parse(monitorInput)).toEqual(monitorInput);

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
    expect(Object.keys(discoveryContracts).sort()).toEqual([
      "CandidateTokenPrioritySchema",
      "CandidateTokenSchema",
      "DiscoveryEvidenceSchema",
      "DiscoveryEvidenceStatusSchema",
      "SourceObservationChainSchema",
      "SourceObservationSchema",
      "SourceObservationSourceSchema",
      "SourceObservationStatusSchema",
      "assertCandidateToken",
      "assertSourceObservation",
      "createDiscoveryEvidenceRef",
    ].sort());
    expect(Object.keys(universeContracts).sort()).toEqual([
      "UniverseBuildResultSchema",
      "UniverseCoverageStateSchema",
      "UniverseSourceCoverageEntrySchema",
    ].sort());
    expect(Object.keys(contextContracts).sort()).toEqual([
      "ContextPackV1Schema",
    ].sort());
    expect(Object.keys(cqdContracts).sort()).toEqual([
      "CQDSnapshotV1Schema",
    ].sort());
    expect(Object.keys(qualityContracts).sort()).toEqual([
      "DataQualityStatusSchema",
      "DataQualityV1Schema",
    ].sort());
    expect(Object.keys(forensicsContracts).sort()).toEqual([
      "SignalPackCoverageStatusSchema",
      "SignalPackHolderFlowSchema",
      "SignalPackLiquiditySchema",
      "SignalPackManipulationFlagsSchema",
      "SignalPackMarketStructureSchema",
      "SignalPackSourceCoverageEntrySchema",
      "SignalPackV1Schema",
      "SignalPackVolatilitySchema",
      "SignalPackVolumeSchema",
      "TrendReversalMonitorInputAvailabilitySchema",
      "TrendReversalMonitorInputV1Schema",
      "TrendReversalObservationStateSchema",
      "TrendReversalObservationV1Schema",
      "TrendReversalStructureContextSchema",
      "assertSignalPackV1",
      "assertTrendReversalMonitorInputV1",
      "assertTrendReversalObservationV1",
    ].sort());
  });
});
