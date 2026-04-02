import { describe, expect, it } from "vitest";
import { DataQualityV1Schema } from "@bot/intelligence/quality/contracts/data-quality.v1.js";
import { CQDSnapshotV1Schema } from "@bot/intelligence/cqd/contracts/cqd.snapshot.v1.js";
import {
  SignalPackV1Schema,
  TrendReversalMonitorInputV1Schema,
} from "@bot/intelligence/forensics/contracts/index.js";
import {
  buildSignalPackV1,
  buildTrendReversalMonitorInputV1,
} from "@bot/intelligence/forensics/build-signal-pack.js";

const BASE_MS = 1_720_000_000_000;

function buildQuality(reordered = false) {
  return DataQualityV1Schema.parse({
    schema_version: "data_quality.v1",
    traceId: "dq-signal",
    timestamp: new Date(BASE_MS).toISOString(),
    completeness: 0.94,
    freshness: 0.91,
    discrepancy: 0.12,
    sourceReliability: 0.9,
    crossSourceConfidence: 0.88,
    confidence: 0.88,
    source_breakdown: reordered
      ? {
          social: {
            source: "social",
            completeness: 0.5,
            freshness: 0.4,
            reliability: 0.45,
            latency_ms: 2_000,
          },
          market: {
            source: "market",
            completeness: 1,
            freshness: 1,
            reliability: 1,
            latency_ms: 500,
          },
        }
      : {
          market: {
            source: "market",
            completeness: 1,
            freshness: 1,
            reliability: 1,
            latency_ms: 500,
          },
          social: {
            source: "social",
            completeness: 0.5,
            freshness: 0.4,
            reliability: 0.45,
            latency_ms: 2_000,
          },
        },
    discrepancy_flags: reordered
      ? ["data_quality_divergence:market:social:0.1200"]
      : ["data_quality_divergence:market:social:0.1200"],
    missingCriticalFields: ["holder_count"],
    staleSources: ["social"],
    disagreedSources: reordered
      ? { priceUsd: ["social", "market"] }
      : { priceUsd: ["market", "social"] },
    routeViable: true,
    liquidityEligible: true,
    status: "degraded",
    reasonCodes: ["DQ_STALE_SOURCES", "DQ_DISAGREED_SOURCES"],
  });
}

function buildCqd(reordered = false) {
  return CQDSnapshotV1Schema.parse({
    schema_version: "cqd.snapshot.v1",
    chain: "solana",
    token: "SOL",
    ts_bucket: Math.floor(BASE_MS / 60_000),
    features: reordered
      ? {
          transfer_count: 91,
          volume_24h_usd: 870_000,
          realized_volatility_pct: 0.52,
          liquidity_usd: 1_250_000,
          holder_turnover_pct: 0.08,
          holder_concentration_pct: 0.31,
          holder_count: 1_420,
          participation_pct: 0.66,
          net_flow_usd: -12_000,
          relative_volume_pct: 1.7,
          volume_momentum_pct: 0.44,
          spread_pct: 0.003,
          atr_pct: 0.07,
          range_pct: 0.21,
          drawdown_pct: 0.183,
          price_return_1m: -0.042,
          liquidity_score: 0.82,
          depth_usd: 220_000,
        }
      : {
          price_return_1m: -0.042,
          drawdown_pct: 0.183,
          range_pct: 0.21,
          atr_pct: 0.07,
          realized_volatility_pct: 0.52,
          liquidity_usd: 1_250_000,
          liquidity_score: 0.82,
          spread_pct: 0.003,
          depth_usd: 220_000,
          volume_24h_usd: 870_000,
          relative_volume_pct: 1.7,
          volume_momentum_pct: 0.44,
          holder_count: 1_420,
          holder_concentration_pct: 0.31,
          holder_turnover_pct: 0.08,
          net_flow_usd: -12_000,
          participation_pct: 0.66,
          transfer_count: 91,
        },
    confidence: 0.81,
    anomaly_flags: reordered
      ? ["cqd_divergence", "stale_source_indicator"]
      : ["stale_source_indicator", "cqd_divergence"],
    evidence_pack: reordered ? ["ev-b", "ev-a"] : ["ev-a", "ev-b"],
    source_summaries: reordered
      ? [
          {
            source: "social",
            freshness_ms: 4_800,
            status: "STALE",
          },
          {
            source: "market",
            freshness_ms: 1_200,
            status: "OK",
          },
        ]
      : [
          {
            source: "market",
            freshness_ms: 1_200,
            status: "OK",
          },
          {
            source: "social",
            freshness_ms: 4_800,
            status: "STALE",
          },
        ],
    sources: {
      freshest_source_ts_ms: BASE_MS,
      max_staleness_ms: 4_800,
      price_divergence_pct: 0.12,
      volume_divergence_pct: 0.07,
      liquidity_divergence_pct: 0.02,
    },
    hash: "cqd-hash-signal",
  });
}

function buildSparseQuality() {
  return DataQualityV1Schema.parse({
    schema_version: "data_quality.v1",
    traceId: "dq-signal-sparse",
    timestamp: new Date(BASE_MS + 1_000).toISOString(),
    completeness: 0.78,
    freshness: 0.63,
    discrepancy: 0.22,
    sourceReliability: 0.71,
    crossSourceConfidence: 0.67,
    confidence: 0.67,
    source_breakdown: {
      market: {
        source: "market",
        completeness: 1,
        freshness: 1,
        reliability: 1,
        latency_ms: 400,
      },
      social: {
        source: "social",
        completeness: 0.4,
        freshness: 0.3,
        reliability: 0.35,
        latency_ms: 2_500,
      },
    },
    discrepancy_flags: ["data_quality_divergence:market:social:0.2200"],
    missingCriticalFields: ["holder_count", "price_return_1m"],
    staleSources: ["social"],
    disagreedSources: {
      priceUsd: ["market", "social"],
    },
    routeViable: true,
    liquidityEligible: false,
    status: "degraded",
    reasonCodes: ["DQ_STALE_SOURCES", "DQ_DISAGREED_SOURCES", "DQ_LOW_CROSS_SOURCE_CONFIDENCE"],
  });
}

function buildSparseCqd() {
  return CQDSnapshotV1Schema.parse({
    schema_version: "cqd.snapshot.v1",
    chain: "solana",
    token: "SOL",
    ts_bucket: Math.floor((BASE_MS + 1_000) / 60_000),
    features: {
      liquidity_usd: 500_000,
      volume_24h_usd: 200_000,
    },
    confidence: 0.5,
    anomaly_flags: ["partial_liquidity_signal"],
    evidence_pack: ["ev-sparse"],
    source_summaries: [
      {
        source: "market",
        freshness_ms: 400,
        status: "OK",
      },
      {
        source: "social",
        freshness_ms: 2_500,
        status: "STALE",
      },
    ],
    sources: {
      freshest_source_ts_ms: BASE_MS + 1_000,
      max_staleness_ms: 2_500,
    },
    hash: "cqd-hash-sparse",
  });
}

describe("forensics signal pack foundation", () => {
  it("parses cleanly through the contract surface and wraps into monitor input", () => {
    const quality = buildQuality();
    const cqd = buildCqd();
    const signalPack = buildSignalPackV1({
      token: "SOL",
      traceId: "signal-pack-contract",
      dataQuality: quality,
      cqdSnapshot: cqd,
      evidenceRefs: ["ev-b", "ev-a"],
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
          evidenceRefs: ["ev-a"],
        },
        social: {
          status: "STALE",
          completeness: 0.5,
          freshness: 0.4,
          freshnessMs: 1_000,
          evidenceRefs: ["ev-b"],
        },
      },
      notes: ["signal_pack"],
    });

    expect(SignalPackV1Schema.parse(signalPack)).toEqual(signalPack);
    expect(signalPack.sourceCoverage.market.status).toBe("OK");
    expect(signalPack.manipulationFlags.crossSourceDivergence).toBe(true);

    const monitorInput = buildTrendReversalMonitorInputV1({
      token: "SOL",
      traceId: "monitor-input-contract",
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
    expect(monitorInput.signalPack.payloadHash).toBe(signalPack.payloadHash);
    expect(monitorInput.contextAvailability.missingSupplementalHints).toEqual([
      "holder_wallet_context",
    ]);
  });

  it("is deterministic when equivalent inputs arrive in different orders", () => {
    const packA = buildSignalPackV1({
      token: "SOL",
      traceId: "signal-pack-deterministic",
      dataQuality: buildQuality(false),
      cqdSnapshot: buildCqd(false),
      evidenceRefs: ["ev-b", "ev-a"],
      marketStructureHints: {
        observedHigh: 108,
        observedLow: 94,
        lastPrice: 101,
        drawdownPct: 0.07,
        rangePct: 0.12,
        reclaimGapPct: 0.03,
        priceReturnPct: -0.02,
        notes: ["market_b", "market_a"],
      },
      holderFlowHints: {
        holderCount: 1_280,
        holderConcentrationPct: 0.22,
        holderTurnoverPct: 0.06,
        netFlowUsd: -2_400,
        participationPct: 0.57,
        notes: ["holder_b", "holder_a"],
      },
      manipulationFlagsHints: {
        washTradingSuspected: true,
        concentrationFragility: true,
        anomalyFlags: ["z", "a"],
        notes: ["manipulation_b", "manipulation_a"],
      },
      sourceCoverageHints: {
        social: {
          status: "STALE",
          completeness: 0.5,
          freshness: 0.4,
          freshnessMs: 1_000,
          evidenceRefs: ["ev-b", "ev-a"],
          notes: ["social_b", "social_a"],
        },
        market: {
          status: "OK",
          completeness: 1,
          freshness: 1,
          freshnessMs: 500,
          evidenceRefs: ["ev-a", "ev-b"],
          notes: ["market_b", "market_a"],
        },
      },
      notes: ["pack_b", "pack_a"],
    });

    const packB = buildSignalPackV1({
      token: "SOL",
      traceId: "signal-pack-deterministic",
      dataQuality: buildQuality(true),
      cqdSnapshot: buildCqd(true),
      evidenceRefs: ["ev-a", "ev-b"],
      marketStructureHints: {
        lastPrice: 101,
        observedLow: 94,
        observedHigh: 108,
        priceReturnPct: -0.02,
        reclaimGapPct: 0.03,
        rangePct: 0.12,
        drawdownPct: 0.07,
        notes: ["market_a", "market_b"],
      },
      holderFlowHints: {
        netFlowUsd: -2_400,
        holderCount: 1_280,
        holderTurnoverPct: 0.06,
        holderConcentrationPct: 0.22,
        participationPct: 0.57,
        notes: ["holder_a", "holder_b"],
      },
      manipulationFlagsHints: {
        concentrationFragility: true,
        washTradingSuspected: true,
        anomalyFlags: ["a", "z"],
        notes: ["manipulation_a", "manipulation_b"],
      },
      sourceCoverageHints: {
        market: {
          status: "OK",
          freshnessMs: 500,
          freshness: 1,
          completeness: 1,
          evidenceRefs: ["ev-b", "ev-a"],
          notes: ["market_a", "market_b"],
        },
        social: {
          status: "STALE",
          freshnessMs: 1_000,
          freshness: 0.4,
          completeness: 0.5,
          evidenceRefs: ["ev-a", "ev-b"],
          notes: ["social_a", "social_b"],
        },
      },
      notes: ["pack_a", "pack_b"],
    });

    expect(packA).toEqual(packB);
    expect(packA.payloadHash).toBe(packB.payloadHash);
    expect(Object.keys(packA.sourceCoverage)).toEqual(["market", "social"]);
    expect(packA.evidenceRefs).toEqual(["ev-a", "ev-b"]);
    expect(packA.marketStructure.notes).toEqual(["market_a", "market_b"]);
    expect(packA.holderFlow.notes).toEqual(["holder_a", "holder_b"]);
    expect(packA.manipulationFlags.anomalyFlags).toEqual([
      "a",
      "cqd_divergence",
      "data_quality_divergence:market:social:0.1200",
      "stale_source_indicator",
      "z",
    ]);
    expect(packA.sourceCoverage.social.notes).toEqual(["social_a", "social_b"]);
  });

  it("keeps missing and stale inputs explicit instead of upgrading them", () => {
    const signalPack = buildSignalPackV1({
      token: "SOL",
      traceId: "signal-pack-missing",
      dataQuality: buildSparseQuality(),
      cqdSnapshot: buildSparseCqd(),
      sourceCoverageHints: {
        manual: {
          status: "MISSING",
          notes: ["manual_gap"],
        },
      },
    });

    expect(signalPack.marketStructure.priceReturnPct).toBeNull();
    expect(signalPack.marketStructure.drawdownPct).toBeNull();
    expect(signalPack.holderFlow.holderCount).toBeNull();
    expect(signalPack.volatility.realizedVolatilityPct).toBeNull();
    expect(signalPack.sourceCoverage.social.status).toBe("STALE");
    expect(signalPack.sourceCoverage.manual.status).toBe("MISSING");
    expect(signalPack.missingFields).toContain("marketStructure.priceReturnPct");
    expect(signalPack.missingFields).toContain("holderFlow.holderCount");
    expect(signalPack.missingFields).toContain("sourceCoverage.manual.status");
    expect(signalPack.missingFields).toContain("marketStructure.lastPrice");
  });

  it("exposes manipulation and fragility flags explicitly when present", () => {
    const quality = buildSparseQuality();
    const cqd = buildSparseCqd();

    const signalPack = buildSignalPackV1({
      token: "SOL",
      traceId: "signal-pack-manipulation",
      dataQuality: quality,
      cqdSnapshot: cqd,
      manipulationFlagsHints: {
        washTradingSuspected: true,
        concentrationFragility: true,
        anomalyFlags: ["manual_watch"],
        notes: ["manipulation_watch"],
      },
      marketStructureHints: {
        drawdownPct: 0.2,
      },
    });

    expect(signalPack.manipulationFlags.washTradingSuspected).toBe(true);
    expect(signalPack.manipulationFlags.spoofingSuspected).toBeNull();
    expect(signalPack.manipulationFlags.concentrationFragility).toBe(true);
    expect(signalPack.manipulationFlags.staleSourceRisk).toBe(true);
    expect(signalPack.manipulationFlags.crossSourceDivergence).toBe(true);
    expect(signalPack.manipulationFlags.anomalyFlags).toEqual([
      "data_quality_divergence:market:social:0.2200",
      "manual_watch",
      "partial_liquidity_signal",
    ]);
  });
});
