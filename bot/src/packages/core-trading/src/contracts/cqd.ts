import type { Chain } from "./market.js";

export interface CQDFeaturesV1 {
  price_return_1m?: number; volume_1m?: number; liquidity_depth?: number;
  liquidity_change_5m?: number; spread_proxy?: number; atr_1m?: number;

  top10_share?: number; holder_hhi?: number; mci?: number; bci?: number; hybrid_integrity?: number;

  mention_rate?: number; influencer_weighted_mentions?: number; sentiment_score?: number;
  hype_density?: number; panic_density?: number; organic_score?: number; amplified_score?: number;
}

export interface CQDSourcesV1 {
  freshest_source_ts_ms: number;
  max_staleness_ms: number;
  price_divergence_pct?: number;
  volume_divergence_pct?: number;
  liquidity_divergence_pct?: number;
}

export interface CQDSnapshotV1 {
  schema_version: "cqd.snapshot.v1";
  chain: Chain;
  token: string;
  ts_bucket: number;
  features: CQDFeaturesV1;
  confidence: number;
  anomaly_flags: string[];
  evidence_pack: string[];
  sources: CQDSourcesV1;
  hash: string;
}
