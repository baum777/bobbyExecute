/**
 * Pre-authority typed artifact.
 * Deterministic downstream input contract scaffold only for v2 quality gating.
 */
import { z } from "zod";

export const DataQualityV1StatusSchema = z.enum([
  "pass",
  "hold",
  "fail",
]);

export const DataQualityV1Schema = z.object({
  version: z.literal("1.0"),
  token: z.string(),
  chain: z.enum(["solana"]),
  status: DataQualityV1StatusSchema,
  completeness: z.number().min(0).max(1),
  freshnessScore: z.number().min(0).max(1),
  divergenceScore: z.number().min(0).max(1),
  crossSourceConfidence: z.number().min(0).max(1),
  missingCriticalFields: z.array(z.string()).default([]),
  staleSources: z.array(z.string()).default([]),
  disagreedSources: z.array(z.string()).default([]),
  routeViable: z.boolean(),
  liquidityEligible: z.boolean(),
  reasons: z.array(z.string()).default([]),
});

export type DataQualityV1Status = z.infer<typeof DataQualityV1StatusSchema>;
export type DataQualityV1 = z.infer<typeof DataQualityV1Schema>;
