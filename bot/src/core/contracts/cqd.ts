/**
 * Repo-native CQDSnapshotV1 contract owner.
 * Ownership freeze (PR-M0-01): single owner for `CQDSnapshotV1` is this file.
 * Wave bundle term `CQDArtifactV1` maps here.
 * Compact reasoning boundary only, not decision authority.
 */
import { z } from "zod";
import { CQDSnapshotV1 } from "../../packages/core-trading/src/contracts/cqd.js";

const CQDSourceSummarySchema = z.object({
  source: z.string(),
  freshness_ms: z.number().int().nonnegative(),
  status: z.enum(["OK", "PARTIAL", "STALE", "ERROR", "MISSING"]),
});

export const CQDSnapshotV1Schema = z.object({
  schema_version: z.literal("cqd.snapshot.v1"),
  chain: z.enum(["solana"]),
  token: z.string(),
  ts_bucket: z.number().int().nonnegative(),
  features: z.record(z.number()),
  confidence: z.number().min(0).max(1),
  anomaly_flags: z.array(z.string()),
  evidence_pack: z.array(z.string()),
  source_summaries: z.array(CQDSourceSummarySchema).default([]),
  sources: z.object({
    freshest_source_ts_ms: z.number().int().nonnegative(),
    max_staleness_ms: z.number().int().nonnegative(),
    price_divergence_pct: z.number().min(0).max(1).optional(),
    volume_divergence_pct: z.number().min(0).max(1).optional(),
    liquidity_divergence_pct: z.number().min(0).max(1).optional(),
  }),
  hash: z.string(),
});

/**
 * Transitional compatibility alias for legacy package consumers.
 * Not canonical future path for ownership.
 */
export interface CQDSnapshotV1Extended extends CQDSnapshotV1 {}
export type { CQDSnapshotV1 };
