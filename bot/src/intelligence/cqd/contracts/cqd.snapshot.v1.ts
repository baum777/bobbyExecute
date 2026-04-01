/**
 * Pre-authority typed artifact.
 * Deterministic downstream input contract scaffold only for v2 CQD snapshots.
 */
import { z } from "zod";
import type { CQDSnapshotV1 as CoreTradingCQDSnapshotV1 } from "../../../packages/core-trading/src/contracts/cqd.js";

const CQDChainSchema = z.enum(["solana"]);

export const CQDSnapshotV1Schema = z.object({
  version: z.literal("1.0"),
  token: z.string(),
  chain: CQDChainSchema,
  tsBucket: z.number().int().nonnegative(),
  features: z.record(z.number()).default({}),
  confidence: z.number().min(0).max(1),
  anomalyFlags: z.array(z.string()).default([]),
  evidencePack: z.array(z.string()).default([]),
  sources: z.object({
    freshestSourceTsMs: z.number().int().nonnegative(),
    maxStalenessMs: z.number().int().nonnegative(),
    priceDivergencePct: z.number().min(0).optional(),
    volumeDivergencePct: z.number().min(0).optional(),
    liquidityDivergencePct: z.number().min(0).optional(),
  }),
  hash: z.string(),
});

export interface CQDSnapshotV1CoreShape extends CoreTradingCQDSnapshotV1 {}
export type CQDSnapshotV1 = z.infer<typeof CQDSnapshotV1Schema>;
