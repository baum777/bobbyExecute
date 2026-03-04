import { z } from "zod";
import { CQDSnapshotV1 } from "../../packages/core-trading/src/contracts/cqd.js";

export const CQDSnapshotV1Schema = z.object({
  schema_version: z.literal("cqd.snapshot.v1"),
  chain: z.enum(["solana"]),
  token: z.string(),
  ts_bucket: z.number(),
  features: z.record(z.number().optional()),
  confidence: z.number().min(0).max(1),
  anomaly_flags: z.array(z.string()),
  evidence_pack: z.array(z.string()),
  sources: z.object({
    freshest_source_ts_ms: z.number(),
    max_staleness_ms: z.number(),
    price_divergence_pct: z.number().optional(),
    volume_divergence_pct: z.number().optional(),
    liquidity_divergence_pct: z.number().optional(),
  }),
  hash: z.string(),
});

export interface CQDSnapshotV1Extended extends CQDSnapshotV1 {}
export type { CQDSnapshotV1 };
