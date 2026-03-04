import { describe, expect, it } from "vitest";
import {
  TokenSourceSnapshotV1Schema,
  type AdapterPairV1,
  type NormalizedTokenV1,
} from "@reducedmode/contracts";
import {
  applySoftSourceBalance,
  dedupeByContractAddress,
  type UniverseTokenCandidate,
} from "../../src/universe/dedupe.balance.js";
import { computeCrossSourceConfidence } from "../../src/normalize/crosssource.confidence.js";
import { buildStructuralMetrics } from "../../src/structural/structural.metrics.js";
import { selectDynamicWeightProfile } from "../../src/risk/risk.weights.js";
import { detectDivergence } from "../../src/divergence/divergence.detect.js";
import { scoreSocialIntel } from "../../src/social/social.scorer.js";
import { computeRiskBreakdown } from "../../src/risk/risk.model.js";
import { classifyEcosystem } from "../../src/classify/ecosystem.classifier.js";

describe("ReducedMode V1 Unit", () => {
  it("dedupe by contract address keeps stronger candidate", () => {
    const candidates = [
      makeCandidate("AAA111", "dexscreener", 10_000, 3_000),
      makeCandidate("AAA111", "dexpaprika", 50_000, 10_000),
      makeCandidate("BBB222", "dexscreener", 12_000, 2_000),
    ];

    const deduped = dedupeByContractAddress(candidates);
    expect(deduped).toHaveLength(2);
    const kept = deduped.find((x) => x.contract_address === "AAA111");
    expect(kept?.source).toBe("dexpaprika");
  });

  it("ratio enforcement relaxes when strict mode drops coverage", () => {
    const candidates: UniverseTokenCandidate[] = [
      makeCandidate("A1", "dexscreener", 10_000, 2_000),
      makeCandidate("A2", "dexscreener", 10_000, 2_000),
      makeCandidate("A3", "dexscreener", 10_000, 2_000),
      makeCandidate("A4", "dexscreener", 10_000, 2_000),
      makeCandidate("A5", "dexscreener", 10_000, 2_000),
      makeCandidate("A6", "dexscreener", 10_000, 2_000),
      makeCandidate("B1", "dexpaprika", 10_000, 2_000),
    ];

    const balanced = applySoftSourceBalance(candidates, 6, 0.5, 5);
    expect(balanced.ratioRelaxed).toBe(true);
    expect(balanced.selected.length).toBe(6);
  });

  it("delta computation marks discrepancy above threshold", () => {
    const tokenRef = {
      contract_address: "CCC333",
      chain: "solana" as const,
      symbol: "CCC",
      source_primary: "dexscreener" as const,
    };
    const snapshots = [
      TokenSourceSnapshotV1Schema.parse({
        source: "dexscreener",
        fetched_at: "2026-01-01T00:00:00.000Z",
        token: tokenRef,
        contract_address: "CCC333",
        price_usd: 1.0,
        liquidity_usd: 1000,
        volume_24h_usd: 500,
      }),
      TokenSourceSnapshotV1Schema.parse({
        source: "dexpaprika",
        fetched_at: "2026-01-01T00:00:00.000Z",
        token: tokenRef,
        contract_address: "CCC333",
        price_usd: 1.5,
        liquidity_usd: 1200,
        volume_24h_usd: 600,
      }),
    ];
    const quality = computeCrossSourceConfidence({
      snapshots,
      discrepancyThreshold: 0.2,
    });
    expect(quality.relative_delta_price).not.toBeNull();
    expect(quality.discrepancy_count).toBe(1);
  });

  it("structural score is clamped 0..100 and regime inferred", () => {
    const token = makeNormalizedToken({
      contract: "DDD444",
      price: 0.4,
      liquidity: 300_000,
      volume: 900_000,
      confidence: 90,
    });
    const structural = buildStructuralMetrics(token);
    expect(structural.structural_score).toBeGreaterThanOrEqual(0);
    expect(structural.structural_score).toBeLessThanOrEqual(100);
    expect(["structural", "healthy", "thin", "fragile", "unknown"]).toContain(
      structural.liquidity_regime,
    );
  });

  it("profile selection and risk aggregation return bounded score", () => {
    const token = makeNormalizedToken({
      contract: "EEE555",
      price: 1,
      liquidity: 8_000,
      volume: 80_000,
      confidence: 55,
    });
    const structural = buildStructuralMetrics(token);
    const social = scoreSocialIntel({
      enabled: false,
      data_status: "disabled",
      samples: [],
      notes: [],
    });
    const divergence = detectDivergence({
      normalized: token,
      structural,
      social,
      discrepancyThreshold: 0.2,
    });
    const profile = selectDynamicWeightProfile({ structural, social, divergence });
    const risk = computeRiskBreakdown({
      normalized: token,
      structural,
      social,
      divergence,
      discrepancyThreshold: 0.2,
    });
    expect(profile.profile).toBeDefined();
    expect(risk.overall_risk_score).toBeGreaterThanOrEqual(0);
    expect(risk.overall_risk_score).toBeLessThanOrEqual(100);
  });

  it("divergence >= 2 triggers Fragile Expansion override", () => {
    const token = makeNormalizedToken({
      contract: "FFF666",
      price: 1,
      liquidity: 10_000,
      volume: 120_000,
      confidence: 40,
      relativeDelta: 0.35,
    });
    const structural = buildStructuralMetrics(token);
    const social = scoreSocialIntel({
      enabled: true,
      data_status: "ok",
      samples: [
        { narrative_type: "momentum", score: 90 },
        { narrative_type: "momentum", score: 85 },
        { narrative_type: "momentum", score: 88 },
        { narrative_type: "momentum", score: 92 },
        { narrative_type: "momentum", score: 87 },
        { narrative_type: "momentum", score: 86 },
        { narrative_type: "momentum", score: 84 },
        { narrative_type: "momentum", score: 83 },
        { narrative_type: "momentum", score: 82 },
        { narrative_type: "momentum", score: 81 },
      ],
      notes: [],
    });
    const divergence = detectDivergence({
      normalized: token,
      structural,
      social,
      discrepancyThreshold: 0.2,
    });
    const ecosystem = classifyEcosystem({ structural, social, divergence });
    expect(divergence.signal_count).toBeGreaterThanOrEqual(2);
    expect(ecosystem.classification).toBe("Fragile Expansion");
  });
});

function makeCandidate(
  contract: string,
  source: "dexscreener" | "dexpaprika",
  liquidity: number,
  volume: number,
): UniverseTokenCandidate {
  const pair: AdapterPairV1 = {
    source,
    pair_id: `${source}-${contract}`,
    contract_address: contract,
    base_symbol: contract.slice(0, 3),
    quote_symbol: "USDC",
    price_usd: 1,
    liquidity_usd: liquidity,
    volume_24h_usd: volume,
    txns_24h: 100,
    fetched_at: "2026-01-01T00:00:00.000Z",
    raw: {},
  };
  return {
    contract_address: contract,
    source,
    pair,
  };
}

function makeNormalizedToken(input: {
  contract: string;
  price: number;
  liquidity: number;
  volume: number;
  confidence: number;
  relativeDelta?: number;
}): NormalizedTokenV1 {
  return {
    token: {
      contract_address: input.contract,
      chain: "solana",
      symbol: input.contract.slice(0, 3),
      source_primary: "dexscreener",
    },
    snapshots: [
      {
        source: "dexscreener",
        fetched_at: "2026-01-01T00:00:00.000Z",
        token: {
          contract_address: input.contract,
          chain: "solana",
          symbol: input.contract.slice(0, 3),
          source_primary: "dexscreener",
        },
        contract_address: input.contract,
        price_usd: input.price,
        liquidity_usd: input.liquidity,
        volume_24h_usd: input.volume,
      },
      {
        source: "dexpaprika",
        fetched_at: "2026-01-01T00:00:00.000Z",
        token: {
          contract_address: input.contract,
          chain: "solana",
          symbol: input.contract.slice(0, 3),
          source_primary: "dexpaprika",
        },
        contract_address: input.contract,
        price_usd: input.price * (1 + (input.relativeDelta ?? 0)),
        liquidity_usd: input.liquidity,
        volume_24h_usd: input.volume,
      },
    ],
    merged: {
      price_usd: input.price,
      liquidity_usd: input.liquidity,
      volume_24h_usd: input.volume,
      txns_24h: 100,
    },
    quality: {
      data_completeness_score: 90,
      cross_source_confidence_score: input.confidence,
      discrepancy_rate: input.relativeDelta && input.relativeDelta >= 0.2 ? 1 : 0,
      discrepancy_count: input.relativeDelta && input.relativeDelta >= 0.2 ? 1 : 0,
      source_coverage: 1,
      relative_delta_price: input.relativeDelta ?? 0.01,
      notes: [],
    },
  };
}
