/**
 * Pre-authority typed artifact.
 * Contract scaffold only for v2 source observation.
 */
import { z } from "zod";

export const SourceObservationChainSchema = z.enum(["solana"]);

export const SourceObservationSourceSchema = z.enum([
  "market",
  "onchain",
  "social",
  "wallet",
  "manual",
]);

export const SourceObservationStatusSchema = z.enum([
  "OK",
  "PARTIAL",
  "ERROR",
]);

export const SourceObservationSchema = z.object({
  schema_version: z.literal("source_observation.v1"),
  source: SourceObservationSourceSchema,
  token: z.string(),
  chain: SourceObservationChainSchema,
  observedAtMs: z.number().int().nonnegative(),
  freshnessMs: z.number().int().nonnegative(),
  payloadHash: z.string(),
  status: SourceObservationStatusSchema,
  isStale: z.boolean().default(false),
  rawRef: z.string().optional(),
  missingFields: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

export type SourceObservationChain = z.infer<typeof SourceObservationChainSchema>;
export type SourceObservationSource = z.infer<typeof SourceObservationSourceSchema>;
export type SourceObservationStatus = z.infer<typeof SourceObservationStatusSchema>;
export type SourceObservation = z.infer<typeof SourceObservationSchema>;

export function assertSourceObservation(value: unknown, source = "unknown"): SourceObservation {
  const result = SourceObservationSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const reason = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}:${issue.message}`;
    })
    .join(";");

  throw new Error(`INVALID_SOURCE_OBSERVATION:${source}:${reason}`);
}
