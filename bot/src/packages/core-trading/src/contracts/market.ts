export type Chain = "solana";

export interface SourceFreshness {
  source: string;
  fetched_at_ms: number;
  staleness_ms: number;
}

export interface SourceDivergence {
  field: "price" | "volume" | "liquidity";
  divergence_pct: number;
  sources: string[];
}

export interface MarketSnapshotV1 {
  schema_version: "market.v1";
  chain: Chain;
  token: string; // mint
  ts_ms: number;
  price: number;
  volume_1m: number;
  liquidity_depth: number;
  sources: {
    freshness: SourceFreshness[];
    divergence: SourceDivergence[];
  };
}
