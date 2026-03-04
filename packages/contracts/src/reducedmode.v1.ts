import { z } from "zod";
import {
  SourceEnum,
  LiquidityRegimeEnum,
  VolatilityRegimeEnum,
  NarrativeTypeEnum,
  WeightProfileEnum,
  DivergenceTypeEnum,
  MarketStructureEnum,
  DataStatusEnum,
  RunModeEnum,
} from "./sources.v1.js";

export const TokenRefV1Schema = z.object({
  symbol: z.string(),
  name: z.string(),
  contract_address: z.string(),
  source: SourceEnum,
  pair_id: z.string().optional(),
});
export type TokenRefV1 = z.infer<typeof TokenRefV1Schema>;

export const TokenSourceSnapshotV1Schema = z.object({
  token_ref: TokenRefV1Schema,
  source: SourceEnum,
  price_usd: z.number().nullable(),
  volume_24h: z.number().nullable(),
  liquidity_usd: z.number().nullable(),
  fdv: z.number().nullable(),
  market_cap_usd: z.number().nullable(),
  price_change_24h_pct: z.number().nullable(),
  tx_count_24h: z.number().nullable().optional(),
  fetched_at: z.string(),
  raw: z.record(z.unknown()).optional(),
});
export type TokenSourceSnapshotV1 = z.infer<typeof TokenSourceSnapshotV1Schema>;

export const DataQualityV1Schema = z.object({
  completeness: z.number().min(0).max(100),
  freshness: z.number().min(0).max(100),
  cross_source_confidence: z.number().min(0).max(1),
  discrepancy_rate: z.number().min(0).max(1),
  sources_used: z.array(SourceEnum),
  discrepancies: z.array(z.object({
    field: z.string(),
    source_a: SourceEnum,
    source_b: SourceEnum,
    value_a: z.number().nullable(),
    value_b: z.number().nullable(),
    relative_delta: z.number(),
  })),
});
export type DataQualityV1 = z.infer<typeof DataQualityV1Schema>;

export const NormalizedTokenV1Schema = z.object({
  contract_address: z.string(),
  symbol: z.string(),
  name: z.string(),
  price_usd: z.number().nullable(),
  volume_24h: z.number().nullable(),
  liquidity_usd: z.number().nullable(),
  fdv: z.number().nullable(),
  market_cap_usd: z.number().nullable(),
  price_change_24h_pct: z.number().nullable(),
  tx_count_24h: z.number().nullable().optional(),
  source_snapshots: z.array(TokenSourceSnapshotV1Schema),
  data_quality: DataQualityV1Schema,
});
export type NormalizedTokenV1 = z.infer<typeof NormalizedTokenV1Schema>;

export const StructuralMetricsV1Schema = z.object({
  contract_address: z.string(),
  log_liquidity: z.number(),
  log_volume: z.number(),
  v2l_ratio: z.number(),
  structural_score: z.number().min(0).max(100),
  liquidity_regime: LiquidityRegimeEnum,
  volatility_regime: VolatilityRegimeEnum,
});
export type StructuralMetricsV1 = z.infer<typeof StructuralMetricsV1Schema>;

export const SocialIntelV1Schema = z.object({
  contract_address: z.string(),
  data_status: DataStatusEnum,
  narrative: NarrativeTypeEnum,
  sentiment_score: z.number().min(-1).max(1).nullable(),
  mention_count_24h: z.number().nullable(),
  weighted_narrative_score: z.number().nullable(),
  notes: z.string().optional(),
});
export type SocialIntelV1 = z.infer<typeof SocialIntelV1Schema>;

export const DynamicWeightProfileV1Schema = z.object({
  profile: WeightProfileEnum,
  structural_weight: z.number().min(0).max(1),
  social_weight: z.number().min(0).max(1),
  divergence_weight: z.number().min(0).max(1),
  data_quality_weight: z.number().min(0).max(1),
});
export type DynamicWeightProfileV1 = z.infer<typeof DynamicWeightProfileV1Schema>;

export const RiskBreakdownV1Schema = z.object({
  contract_address: z.string(),
  overall_risk_score: z.number().min(0).max(100),
  structural_component: z.number(),
  social_component: z.number(),
  divergence_component: z.number(),
  data_quality_component: z.number(),
  weight_profile: DynamicWeightProfileV1Schema,
  flags: z.array(z.string()),
});
export type RiskBreakdownV1 = z.infer<typeof RiskBreakdownV1Schema>;

export const DivergenceV1Schema = z.object({
  contract_address: z.string(),
  divergences: z.array(z.object({
    type: DivergenceTypeEnum,
    source_a: SourceEnum,
    source_b: SourceEnum,
    relative_delta: z.number(),
    threshold: z.number(),
    exceeded: z.boolean(),
  })),
  divergence_count: z.number(),
  classification_override: z.string().nullable(),
});
export type DivergenceV1 = z.infer<typeof DivergenceV1Schema>;

export const EcosystemClassV1Schema = z.object({
  market_structure: MarketStructureEnum,
  narrative_dominance: NarrativeTypeEnum,
  liquidity_regime: LiquidityRegimeEnum,
});
export type EcosystemClassV1 = z.infer<typeof EcosystemClassV1Schema>;

export const ReasoningBulletSchema = z.object({
  token: z.string(),
  bullets: z.array(z.string()).length(3),
});
export type ReasoningBullet = z.infer<typeof ReasoningBulletSchema>;

export const TokenAnalysisV1Schema = z.object({
  normalized: NormalizedTokenV1Schema,
  structural: StructuralMetricsV1Schema,
  social: SocialIntelV1Schema,
  risk: RiskBreakdownV1Schema,
  divergence: DivergenceV1Schema,
  reasoning: ReasoningBulletSchema,
});
export type TokenAnalysisV1 = z.infer<typeof TokenAnalysisV1Schema>;

export const ReducedModeRunV1Schema = z.object({
  run_id: z.string(),
  mode: RunModeEnum,
  started_at: z.string(),
  completed_at: z.string(),
  duration_ms: z.number(),
  config: z.object({
    max_unique_tokens: z.number(),
    min_unique_tokens: z.number(),
    trending_ratio_target: z.number(),
    volume_ratio_target: z.number(),
    discrepancy_threshold: z.number(),
    min_data_completeness: z.number(),
  }),
  universe: z.object({
    pre_dedupe_count: z.number(),
    post_dedupe_count: z.number(),
    excluded_no_contract: z.number(),
    sources_queried: z.array(SourceEnum),
    final_trending_count: z.number(),
    final_volume_count: z.number(),
  }),
  tokens: z.array(TokenAnalysisV1Schema),
  ecosystem: EcosystemClassV1Schema,
  transparency: z.object({
    avg_completeness: z.number(),
    avg_cross_source_confidence: z.number(),
    avg_discrepancy_rate: z.number(),
    tokens_below_min_completeness: z.number(),
  }),
  rankings: z.object({
    top_structural: z.array(z.object({
      contract_address: z.string(),
      symbol: z.string(),
      structural_score: z.number(),
    })),
    top_fragile: z.array(z.object({
      contract_address: z.string(),
      symbol: z.string(),
      overall_risk_score: z.number(),
      divergence_count: z.number(),
    })),
  }),
  low_confidence: z.boolean(),
  notes: z.array(z.string()),
});
export type ReducedModeRunV1 = z.infer<typeof ReducedModeRunV1Schema>;
