/**
 * Signal agent - generates trading signals from market data.
 * PROPOSED - simplified rule-based for golden tasks.
 */
import type { MarketSnapshot } from "../core/contracts/market.js";
import type { CQDSnapshotV1 } from "../core/contracts/cqd.js";
import { hashDecision } from "../core/determinism/hash.js";

export async function createSignalHandler(): Promise<
  (market: MarketSnapshot) => Promise<{ direction: string; confidence: number; cqd?: CQDSnapshotV1 }>
> {
  return async (market) => {
    // Generate CQD Snapshot for the signal
    const cqd: CQDSnapshotV1 = {
      schema_version: "cqd.snapshot.v1",
      chain: "solana", // Use correct lowercase chain from core-trading
      token: market.baseToken,
      ts_bucket: Math.floor(Date.now() / 60000),
      features: {
        price_return_1m: 0,
        volume_1m: market.volume24h / (24 * 60),
      },
      confidence: 0.5,
      anomaly_flags: [],
      evidence_pack: [],
      sources: {
        freshest_source_ts_ms: Date.now(),
        max_staleness_ms: 1000,
      },
      hash: "",
    };
    
    cqd.hash = hashDecision(cqd);

    if (market.priceUsd > 0 && market.volume24h > 0) {
      return { direction: "hold", confidence: 0.5, cqd };
    }
    return { direction: "hold", confidence: 0, cqd };
  };
}
