import { z } from "zod";
import {
  DivergenceSignalV1Schema,
  LiquidityRegimeV1Schema,
  MarketStructureV1Schema,
  NarrativeTypeV1Schema,
  ProfileV1Schema,
  RunModeV1Schema,
  RunStatusV1Schema,
  SourceV1Schema,
  VolatilityRegimeV1Schema,
} from "./sources.v1.js";

export const TokenRefV1Schema = z.object({
  contract_address: z.string().min(1),
  chain: z.literal("solana").default("solana"),
  symbol: z.string().min(1),
  name: z.string().min(1).optional(),
  pair_id: z.string().optional(),
  source_primary: SourceV1Schema,
});

export const TokenSourceSnapshotV1Schema = z.object({
  source: SourceV1Schema,
  fetched_at: z.string().datetime(),
  token: TokenRefV1Schema,
  contract_address: z.string().nullable(),
  price_usd: z.number().nonnegative().nullable(),
  liquidity_usd: z.number().nonnegative().nullable(),
  volume_24h_usd: z.number().nonnegative().nullable(),
  txns_24h: z.number().int().nonnegative().nullable().optional(),
  fdv_usd: z.number().nonnegative().nullable().optional(),
  market_cap_usd: z.number().nonnegative().nullable().optional(),
  raw: z.record(z.unknown()).optional(),
});

export const DataQualityV1Schema = z.object({
  data_completeness_score: z.number().min(0).max(100),
  cross_source_confidence_score: z.number().min(0).max(100),
  discrepancy_rate: z.number().min(0).max(1),
  discrepancy_count: z.number().int().nonnegative(),
  source_coverage: z.number().min(0).max(1),
  relative_delta_price: z.number().nonnegative().nullable(),
  notes: z.array(z.string()).default([]),
});

export const NormalizedTokenV1Schema = z.object({
  token: TokenRefV1Schema,
  snapshots: z.array(TokenSourceSnapshotV1Schema).min(1),
  merged: z.object({
    price_usd: z.number().nonnegative().nullable(),
    liquidity_usd: z.number().nonnegative().nullable(),
    volume_24h_usd: z.number().nonnegative().nullable(),
    txns_24h: z.number().int().nonnegative().nullable().optional(),
  }),
  quality: DataQualityV1Schema,
});

export const StructuralMetricsV1Schema = z.object({
  liquidity_norm: z.number().min(0),
  volume_norm: z.number().min(0),
  v2l_ratio: z.number().nonnegative().nullable(),
  structural_score: z.number().min(0).max(100),
  liquidity_regime: LiquidityRegimeV1Schema,
  volatility_regime: VolatilityRegimeV1Schema,
  notes: z.array(z.string()).default([]),
});

export const SocialIntelV1Schema = z.object({
  enabled: z.boolean(),
  data_status: z.enum(["disabled", "data_insufficient", "ok"]),
  sample_size: z.number().int().nonnegative(),
  weighted_narrative_score: z.number().min(0).max(100).nullable(),
  narrative_type: NarrativeTypeV1Schema,
  notes: z.array(z.string()).default([]),
});

export const DynamicWeightProfileV1Schema = z.object({
  profile: ProfileV1Schema,
  weights: z.object({
    structural: z.number().min(0).max(1),
    social: z.number().min(0).max(1),
    quality: z.number().min(0).max(1),
    divergence: z.number().min(0).max(1),
  }),
  rationale: z.string(),
});

export const RiskBreakdownV1Schema = z.object({
  structural_risk_score: z.number().min(0).max(100),
  social_risk_score: z.number().min(0).max(100),
  quality_risk_score: z.number().min(0).max(100),
  divergence_risk_score: z.number().min(0).max(100),
  overall_risk_score: z.number().min(0).max(100),
  flags: z.array(z.string()).default([]),
  weight_profile: DynamicWeightProfileV1Schema,
});

export const DivergenceV1Schema = z.object({
  signals: z.array(DivergenceSignalV1Schema),
  signal_count: z.number().int().nonnegative(),
  has_override: z.boolean(),
  override_classification: z.string().optional(),
});

export const EcosystemClassV1Schema = z.object({
  market_structure: MarketStructureV1Schema,
  narrative_dominance: NarrativeTypeV1Schema,
  liquidity_regime: LiquidityRegimeV1Schema,
  classification: z.string(),
});

export const TokenAnalysisV1Schema = z.object({
  token: TokenRefV1Schema,
  normalized: NormalizedTokenV1Schema,
  structural: StructuralMetricsV1Schema,
  social: SocialIntelV1Schema,
  risk: RiskBreakdownV1Schema,
  divergence: DivergenceV1Schema,
  ecosystem: EcosystemClassV1Schema,
  reasoning_bullets: z.tuple([z.string(), z.string(), z.string()]),
});

export const ReducedModeRunV1Schema = z.object({
  version: z.literal("1.0.0"),
  run_id: z.string().min(1),
  generated_at: z.string().datetime(),
  mode: RunModeV1Schema,
  status: RunStatusV1Schema,
  low_confidence_analysis: z.boolean().default(false),
  config: z.object({
    max_unique_tokens: z.number().int().positive(),
    min_unique_tokens: z.number().int().positive(),
    discrepancy_threshold: z.number().min(0).max(1),
    min_data_completeness: z.number().min(0).max(100),
    max_recovery_attempts: z.number().int().positive(),
    social_enabled: z.boolean(),
    moralis_enabled: z.boolean(),
    rpc_verify_enabled: z.boolean(),
  }),
  transparency: z.object({
    universe_size_pre_dedupe: z.number().int().nonnegative(),
    universe_size_post_dedupe: z.number().int().nonnegative(),
    average_completeness_score: z.number().min(0).max(100),
    average_confidence_score: z.number().min(0).max(100),
    discrepancy_rate_avg: z.number().min(0).max(1),
    divergence_histogram: z.record(z.string(), z.number().int().nonnegative()),
  }),
  sections: z.object({
    A_universe: z.object({
      candidates_total: z.number().int().nonnegative(),
      unique_tokens: z.number().int().nonnegative(),
      source_balance: z.record(z.string(), z.number().int().nonnegative()),
      notes: z.array(z.string()),
    }),
    B_quality: z.object({
      average_data_completeness_score: z.number().min(0).max(100),
      average_cross_source_confidence_score: z.number().min(0).max(100),
      discrepancy_rate: z.number().min(0).max(1),
      notes: z.array(z.string()),
    }),
    C_structural: z.object({
      average_structural_score: z.number().min(0).max(100),
      liquidity_regime_distribution: z.record(z.string(), z.number().int().nonnegative()),
      notes: z.array(z.string()),
    }),
    D_social: z.object({
      enabled: z.boolean(),
      data_status: z.enum(["disabled", "data_insufficient", "ok"]),
      narrative_mix: z.record(z.string(), z.number().int().nonnegative()),
      notes: z.array(z.string()),
    }),
    E_risk_divergence: z.object({
      average_overall_risk_score: z.number().min(0).max(100),
      high_risk_count: z.number().int().nonnegative(),
      divergence_override_count: z.number().int().nonnegative(),
      notes: z.array(z.string()),
    }),
    F_classification: z.object({
      market_structure_distribution: z.record(z.string(), z.number().int().nonnegative()),
      top_narrative: NarrativeTypeV1Schema,
      notes: z.array(z.string()),
    }),
  }),
  tokens: z.array(TokenAnalysisV1Schema),
  top_structural: z.array(TokenAnalysisV1Schema),
  top_fragile: z.array(TokenAnalysisV1Schema),
  notes: z.array(z.string()).default([]),
});

export type TokenRefV1 = z.infer<typeof TokenRefV1Schema>;
export type TokenSourceSnapshotV1 = z.infer<typeof TokenSourceSnapshotV1Schema>;
export type DataQualityV1 = z.infer<typeof DataQualityV1Schema>;
export type NormalizedTokenV1 = z.infer<typeof NormalizedTokenV1Schema>;
export type StructuralMetricsV1 = z.infer<typeof StructuralMetricsV1Schema>;
export type SocialIntelV1 = z.infer<typeof SocialIntelV1Schema>;
export type DynamicWeightProfileV1 = z.infer<typeof DynamicWeightProfileV1Schema>;
export type RiskBreakdownV1 = z.infer<typeof RiskBreakdownV1Schema>;
export type DivergenceV1 = z.infer<typeof DivergenceV1Schema>;
export type EcosystemClassV1 = z.infer<typeof EcosystemClassV1Schema>;
export type TokenAnalysisV1 = z.infer<typeof TokenAnalysisV1Schema>;
export type ReducedModeRunV1 = z.infer<typeof ReducedModeRunV1Schema>;
