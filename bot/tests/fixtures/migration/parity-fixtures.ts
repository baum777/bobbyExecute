import type { SourceObservationSource } from "@bot/discovery/contracts/source-observation.js";
import type { UniverseCoverageState } from "@bot/intelligence/universe/contracts/universe-build-result.js";

export interface MigrationParityObservationFixture {
  source: SourceObservationSource;
  observedAtOffsetMs: number;
  freshnessMs: number;
  payload: {
    priceUsd: number;
    volume24h: number;
    liquidityUsd: number;
    holderCount?: number;
    holderConcentrationPct?: number;
    netFlowUsd?: number;
    relativeVolumePct?: number;
    drawdownPct?: number;
    rangePct?: number;
    reclaimGapPct?: number;
    higherLowPct?: number;
    lowerHighPct?: number;
  };
  missingFields?: string[];
  notes?: string[];
}

export interface MigrationParityFixture {
  id: string;
  scenario: string;
  baseTimestampMs: number;
  token: string;
  symbol: string;
  market: {
    source: "dexpaprika" | "dexscreener" | "moralis";
    poolId: string;
    quoteToken: "USD";
    priceUsd: number;
    volume24h: number;
    liquidity: number;
    freshnessMs: number;
  };
  observations: MigrationParityObservationFixture[];
  knownRequiredFields: string[];
  sourceFieldPresence: Partial<Record<SourceObservationSource, string[]>>;
  sourceDisagreements?: Record<string, SourceObservationSource[]>;
  universeCoverage: Record<string, UniverseCoverageState>;
  universeFeatures: Record<string, number>;
  includeTrendObservation: boolean;
  comparisonScope: {
    stableFields: string[];
    expectedDeltaFields: string[];
    notes: string[];
  };
}

const BASE = 1_735_000_000_000;

export const MIGRATION_PARITY_FIXTURES: readonly MigrationParityFixture[] = [
  {
    id: "clean-pass-candidate",
    scenario: "Clean pass candidate",
    baseTimestampMs: BASE,
    token: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    market: {
      source: "dexpaprika",
      poolId: "pool-clean",
      quoteToken: "USD",
      priceUsd: 100,
      volume24h: 1_500_000,
      liquidity: 2_200_000,
      freshnessMs: 0,
    },
    observations: [
      {
        source: "market",
        observedAtOffsetMs: 0,
        freshnessMs: 0,
        payload: {
          priceUsd: 100,
          volume24h: 1_500_000,
          liquidityUsd: 2_200_000,
          holderCount: 8_000,
          holderConcentrationPct: 0.12,
          netFlowUsd: 120_000,
          relativeVolumePct: 1.4,
          drawdownPct: 0.03,
          rangePct: 0.08,
          reclaimGapPct: 0.01,
          higherLowPct: 0.05,
          lowerHighPct: -0.01,
        },
        notes: ["clean_market"],
      },
      {
        source: "social",
        observedAtOffsetMs: 1_000,
        freshnessMs: 0,
        payload: {
          priceUsd: 100.4,
          volume24h: 1_480_000,
          liquidityUsd: 2_150_000,
          holderCount: 7_900,
          holderConcentrationPct: 0.13,
          netFlowUsd: 90_000,
          relativeVolumePct: 1.2,
          drawdownPct: 0.04,
          rangePct: 0.09,
          reclaimGapPct: 0.015,
          higherLowPct: 0.04,
          lowerHighPct: -0.015,
        },
        notes: ["clean_social"],
      },
    ],
    knownRequiredFields: ["priceUsd", "volume24h", "liquidityUsd"],
    sourceFieldPresence: {
      market: ["priceUsd", "volume24h", "liquidityUsd", "holderCount"],
      social: ["priceUsd", "volume24h", "liquidityUsd"],
    },
    sourceDisagreements: {},
    universeCoverage: {
      market: "OK",
      social: "OK",
    },
    universeFeatures: {
      liquidityUsd: 2_200_000,
      price_return_1m: 0.04,
      drawdown_pct: 0.03,
      range_pct: 0.08,
      reclaim_gap_pct: 0.01,
      holder_count: 8_000,
      holder_concentration_pct: 0.12,
      net_flow_usd: 120_000,
      relative_volume_pct: 1.4,
      volume_24h_usd: 1_500_000,
      liquidity_score: 0.9,
    },
    includeTrendObservation: true,
    comparisonScope: {
      stableFields: ["token", "chain", "new.universe.included", "shadow.classification"],
      expectedDeltaFields: ["score.composite", "signal.blocked"],
      notes: ["No forced semantic parity; deltas are reported explicitly."],
    },
  },
  {
    id: "partial-degraded-upstream-data",
    scenario: "Partial degraded upstream data",
    baseTimestampMs: BASE + 10_000,
    token: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    market: {
      source: "dexpaprika",
      poolId: "pool-partial",
      quoteToken: "USD",
      priceUsd: 97.8,
      volume24h: 750_000,
      liquidity: 980_000,
      freshnessMs: 0,
    },
    observations: [
      {
        source: "social",
        observedAtOffsetMs: 1_500,
        freshnessMs: 4_500,
        payload: {
          priceUsd: 99.5,
          volume24h: 610_000,
          liquidityUsd: 0,
          holderCount: 6_000,
          holderConcentrationPct: 0.2,
          netFlowUsd: 20_000,
          relativeVolumePct: 0.95,
          drawdownPct: 0.08,
          rangePct: 0.16,
          reclaimGapPct: 0.03,
          higherLowPct: 0.02,
          lowerHighPct: -0.02,
        },
        missingFields: ["liquidityUsd"],
        notes: ["partial_social"],
      },
      {
        source: "market",
        observedAtOffsetMs: 0,
        freshnessMs: 0,
        payload: {
          priceUsd: 97.8,
          volume24h: 750_000,
          liquidityUsd: 980_000,
          holderCount: 6_200,
          holderConcentrationPct: 0.22,
          netFlowUsd: -8_000,
          relativeVolumePct: 0.88,
          drawdownPct: 0.11,
          rangePct: 0.19,
          reclaimGapPct: 0.035,
          higherLowPct: 0.015,
          lowerHighPct: -0.03,
        },
        notes: ["partial_market"],
      },
    ],
    knownRequiredFields: ["priceUsd", "volume24h", "liquidityUsd"],
    sourceFieldPresence: {
      market: ["priceUsd", "volume24h", "liquidityUsd"],
      social: ["priceUsd", "volume24h"],
    },
    sourceDisagreements: {
      priceUsd: ["market", "social"],
    },
    universeCoverage: {
      market: "OK",
      social: "PARTIAL",
    },
    universeFeatures: {
      liquidityUsd: 980_000,
      price_return_1m: -0.02,
      drawdown_pct: 0.11,
      range_pct: 0.19,
      reclaim_gap_pct: 0.035,
      holder_count: 6_200,
      holder_concentration_pct: 0.22,
      net_flow_usd: -8_000,
      relative_volume_pct: 0.88,
      volume_24h_usd: 750_000,
      liquidity_score: 0.68,
    },
    includeTrendObservation: false,
    comparisonScope: {
      stableFields: ["token", "chain", "new.quality.status", "new.cqd.present"],
      expectedDeltaFields: ["quality.status", "score.confidence"],
      notes: ["Scenario keeps degraded truth explicit without forcing parity."],
    },
  },
  {
    id: "stale-source-case",
    scenario: "Stale source case",
    baseTimestampMs: BASE + 20_000,
    token: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    market: {
      source: "moralis",
      poolId: "pool-stale",
      quoteToken: "USD",
      priceUsd: 95,
      volume24h: 650_000,
      liquidity: 900_000,
      freshnessMs: 0,
    },
    observations: [
      {
        source: "onchain",
        observedAtOffsetMs: 1_500,
        freshnessMs: 45_000,
        payload: {
          priceUsd: 96.8,
          volume24h: 620_000,
          liquidityUsd: 870_000,
          holderCount: 5_400,
          holderConcentrationPct: 0.24,
          netFlowUsd: -15_000,
          relativeVolumePct: 0.82,
          drawdownPct: 0.14,
          rangePct: 0.2,
          reclaimGapPct: 0.05,
          higherLowPct: 0.01,
          lowerHighPct: -0.04,
        },
        notes: ["stale_onchain"],
      },
      {
        source: "market",
        observedAtOffsetMs: 0,
        freshnessMs: 0,
        payload: {
          priceUsd: 95,
          volume24h: 650_000,
          liquidityUsd: 900_000,
          holderCount: 5_600,
          holderConcentrationPct: 0.23,
          netFlowUsd: -7_000,
          relativeVolumePct: 0.9,
          drawdownPct: 0.12,
          rangePct: 0.18,
          reclaimGapPct: 0.04,
          higherLowPct: 0.02,
          lowerHighPct: -0.03,
        },
        notes: ["stale_market"],
      },
    ],
    knownRequiredFields: ["priceUsd", "volume24h", "liquidityUsd"],
    sourceFieldPresence: {
      market: ["priceUsd", "volume24h", "liquidityUsd"],
      onchain: ["priceUsd", "volume24h", "liquidityUsd"],
    },
    sourceDisagreements: {
      priceUsd: ["market", "onchain"],
    },
    universeCoverage: {
      market: "OK",
      onchain: "STALE",
    },
    universeFeatures: {
      liquidityUsd: 900_000,
      price_return_1m: -0.03,
      drawdown_pct: 0.12,
      range_pct: 0.18,
      reclaim_gap_pct: 0.04,
      holder_count: 5_600,
      holder_concentration_pct: 0.23,
      net_flow_usd: -7_000,
      relative_volume_pct: 0.9,
      volume_24h_usd: 650_000,
      liquidity_score: 0.63,
    },
    includeTrendObservation: false,
    comparisonScope: {
      stableFields: ["token", "chain", "new.quality.staleSources"],
      expectedDeltaFields: ["quality.crossSourceConfidence", "score.composite"],
      notes: ["Staleness and disagreement are expected deltas, not parity failures."],
    },
  },
  {
    id: "excluded-universe-case",
    scenario: "Excluded universe case",
    baseTimestampMs: BASE + 30_000,
    token: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    market: {
      source: "dexpaprika",
      poolId: "pool-excluded",
      quoteToken: "USD",
      priceUsd: 89,
      volume24h: 220_000,
      liquidity: 240_000,
      freshnessMs: 0,
    },
    observations: [
      {
        source: "market",
        observedAtOffsetMs: 0,
        freshnessMs: 0,
        payload: {
          priceUsd: 89,
          volume24h: 220_000,
          liquidityUsd: 240_000,
          holderCount: 1_200,
          holderConcentrationPct: 0.47,
          netFlowUsd: -55_000,
          relativeVolumePct: 0.42,
          drawdownPct: 0.27,
          rangePct: 0.32,
          reclaimGapPct: 0.11,
          higherLowPct: -0.02,
          lowerHighPct: -0.06,
        },
        notes: ["excluded_market"],
      },
    ],
    knownRequiredFields: ["priceUsd", "volume24h", "liquidityUsd"],
    sourceFieldPresence: {
      market: ["priceUsd", "volume24h", "liquidityUsd"],
    },
    sourceDisagreements: {},
    universeCoverage: {
      market: "ERROR",
    },
    universeFeatures: {
      liquidityUsd: 240_000,
      price_return_1m: -0.12,
      drawdown_pct: 0.27,
      range_pct: 0.32,
      reclaim_gap_pct: 0.11,
      holder_count: 1_200,
      holder_concentration_pct: 0.47,
      net_flow_usd: -55_000,
      relative_volume_pct: 0.42,
      volume_24h_usd: 220_000,
      liquidity_score: 0.28,
    },
    includeTrendObservation: false,
    comparisonScope: {
      stableFields: ["token", "chain", "new.universe.included", "new.cqd.present=false"],
      expectedDeltaFields: ["cqd.stageError", "signal.blocked"],
      notes: ["Excluded universe should fail closed on new lineage CQD stage."],
    },
  },
  {
    id: "manipulation-fragility-heavy",
    scenario: "Manipulation and fragility heavy",
    baseTimestampMs: BASE + 40_000,
    token: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    market: {
      source: "dexscreener",
      poolId: "pool-manip",
      quoteToken: "USD",
      priceUsd: 71,
      volume24h: 1_100_000,
      liquidity: 320_000,
      freshnessMs: 0,
    },
    observations: [
      {
        source: "market",
        observedAtOffsetMs: 0,
        freshnessMs: 0,
        payload: {
          priceUsd: 71,
          volume24h: 1_100_000,
          liquidityUsd: 320_000,
          holderCount: 980,
          holderConcentrationPct: 0.58,
          netFlowUsd: -90_000,
          relativeVolumePct: 1.9,
          drawdownPct: 0.34,
          rangePct: 0.39,
          reclaimGapPct: 0.14,
          higherLowPct: -0.03,
          lowerHighPct: -0.08,
        },
        notes: ["manip_market"],
      },
      {
        source: "social",
        observedAtOffsetMs: 500,
        freshnessMs: 0,
        payload: {
          priceUsd: 73.4,
          volume24h: 1_350_000,
          liquidityUsd: 280_000,
          holderCount: 930,
          holderConcentrationPct: 0.62,
          netFlowUsd: -120_000,
          relativeVolumePct: 2.2,
          drawdownPct: 0.36,
          rangePct: 0.41,
          reclaimGapPct: 0.16,
          higherLowPct: -0.04,
          lowerHighPct: -0.1,
        },
        notes: ["manip_social"],
      },
    ],
    knownRequiredFields: ["priceUsd", "volume24h", "liquidityUsd"],
    sourceFieldPresence: {
      market: ["priceUsd", "volume24h", "liquidityUsd"],
      social: ["priceUsd", "volume24h", "liquidityUsd"],
    },
    sourceDisagreements: {
      priceUsd: ["market", "social"],
      liquidityUsd: ["market", "social"],
    },
    universeCoverage: {
      market: "OK",
      social: "PARTIAL",
    },
    universeFeatures: {
      liquidityUsd: 320_000,
      price_return_1m: -0.09,
      drawdown_pct: 0.34,
      range_pct: 0.39,
      reclaim_gap_pct: 0.14,
      holder_count: 980,
      holder_concentration_pct: 0.58,
      net_flow_usd: -90_000,
      relative_volume_pct: 1.9,
      volume_24h_usd: 1_100_000,
      liquidity_score: 0.24,
      spread_pct: 0.01,
      slippage_pct: 0.11,
    },
    includeTrendObservation: true,
    comparisonScope: {
      stableFields: ["token", "chain", "new.score.present"],
      expectedDeltaFields: ["score.composite", "riskFlags.count"],
      notes: ["High fragility/manipulation case expected to diverge from old score semantics."],
    },
  },
  {
    id: "low-confidence-weak-structure",
    scenario: "Low confidence weak structure",
    baseTimestampMs: BASE + 50_000,
    token: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    market: {
      source: "dexpaprika",
      poolId: "pool-low-confidence",
      quoteToken: "USD",
      priceUsd: 83,
      volume24h: 430_000,
      liquidity: 510_000,
      freshnessMs: 0,
    },
    observations: [
      {
        source: "market",
        observedAtOffsetMs: 0,
        freshnessMs: 0,
        payload: {
          priceUsd: 83,
          volume24h: 430_000,
          liquidityUsd: 510_000,
          holderCount: 2_300,
          holderConcentrationPct: 0.34,
          netFlowUsd: -25_000,
          relativeVolumePct: 0.66,
          drawdownPct: 0.22,
          rangePct: 0.27,
          reclaimGapPct: 0.09,
          higherLowPct: -0.01,
          lowerHighPct: -0.05,
        },
        notes: ["weak_market"],
      },
      {
        source: "wallet",
        observedAtOffsetMs: 700,
        freshnessMs: 8_000,
        payload: {
          priceUsd: 82.2,
          volume24h: 410_000,
          liquidityUsd: 490_000,
          holderCount: 2_200,
          holderConcentrationPct: 0.36,
          netFlowUsd: -30_000,
          relativeVolumePct: 0.6,
          drawdownPct: 0.24,
          rangePct: 0.29,
          reclaimGapPct: 0.1,
          higherLowPct: -0.015,
          lowerHighPct: -0.055,
        },
        notes: ["weak_wallet"],
      },
    ],
    knownRequiredFields: ["priceUsd", "volume24h", "liquidityUsd"],
    sourceFieldPresence: {
      market: ["priceUsd", "volume24h", "liquidityUsd"],
      wallet: ["priceUsd", "volume24h", "liquidityUsd"],
    },
    sourceDisagreements: {
      priceUsd: ["market", "wallet"],
    },
    universeCoverage: {
      market: "OK",
      wallet: "PARTIAL",
    },
    universeFeatures: {
      liquidityUsd: 510_000,
      price_return_1m: -0.05,
      drawdown_pct: 0.22,
      range_pct: 0.27,
      reclaim_gap_pct: 0.09,
      holder_count: 2_300,
      holder_concentration_pct: 0.34,
      net_flow_usd: -25_000,
      relative_volume_pct: 0.66,
      volume_24h_usd: 430_000,
      liquidity_score: 0.45,
    },
    includeTrendObservation: true,
    comparisonScope: {
      stableFields: ["token", "chain", "new.quality.status"],
      expectedDeltaFields: ["score.confidence", "signal.blocked"],
      notes: ["Weak structure should surface low-confidence deltas, not forced equality."],
    },
  },
] as const;
