/**
 * Pre-authority constructed signal set artifact.
 * Consolidates upper-half observations into deterministic, replay-safe signals.
 * Ownership freeze (PR-M0-01): single owner for `ConstructedSignalSetV1` is this file.
 */
import { z } from "zod";
import { ConstructedSignalV1Schema } from "./constructed-signal.v1.js";

export const ConstructedSignalSetBuildStatusSchema = z.enum([
  "built",
  "degraded",
  "invalidated",
]);

export const ConstructedSignalSetSourceCoverageEntrySchema = z.object({
  status: z.string(),
  isStale: z.boolean(),
});

export const ConstructedSignalSetV1Schema = z.object({
  schema_version: z.literal("constructed_signal_set.v1"),
  token: z.string(),
  chain: z.enum(["solana"]),
  inputRefs: z.array(z.string()).default([]),
  signals: z.array(ConstructedSignalV1Schema),
  missingInputs: z.array(z.string()).default([]),
  evidenceRefs: z.array(z.string()).default([]),
  sourceCoverage: z.record(ConstructedSignalSetSourceCoverageEntrySchema).default({}),
  buildStatus: ConstructedSignalSetBuildStatusSchema,
  createdAtMs: z.number().int().nonnegative(),
  payloadHash: z.string(),
});

export type ConstructedSignalSetBuildStatus = z.infer<
  typeof ConstructedSignalSetBuildStatusSchema
>;
export type ConstructedSignalSetSourceCoverageEntry = z.infer<
  typeof ConstructedSignalSetSourceCoverageEntrySchema
>;
export type ConstructedSignalSetV1 = z.infer<typeof ConstructedSignalSetV1Schema>;

export function assertConstructedSignalSetV1(
  value: unknown,
  source = "unknown"
): ConstructedSignalSetV1 {
  const result = ConstructedSignalSetV1Schema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const reason = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}:${issue.message}`;
    })
    .join(";");

  throw new Error(`INVALID_CONSTRUCTED_SIGNAL_SET:${source}:${reason}`);
}
