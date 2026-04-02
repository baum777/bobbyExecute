/**
 * Pre-authority typed artifact.
 * Repo-native UniverseBuildResult line.
 * Wave bundle term `UniverseBuildResultV1` maps here.
 */
import { z } from "zod";

export const UniverseCoverageStateSchema = z.enum([
  "OK",
  "PARTIAL",
  "STALE",
  "ERROR",
  "MISSING",
]);

export const UniverseSourceCoverageEntrySchema = z.object({
  status: UniverseCoverageStateSchema,
});

export const UniverseBuildResultSchema = z.object({
  schema_version: z.literal("universe_build_result.v1"),
  token: z.string(),
  chain: z.enum(["solana"]),
  included: z.boolean(),
  exclusionReasons: z.array(z.string()).default([]),
  normalizedFeatures: z.record(z.number()).default({}),
  sourceCoverage: z.record(UniverseSourceCoverageEntrySchema).default({}),
});

export type UniverseCoverageState = z.infer<typeof UniverseCoverageStateSchema>;
export type UniverseSourceCoverageEntry = z.infer<typeof UniverseSourceCoverageEntrySchema>;
export type UniverseBuildResult = z.infer<typeof UniverseBuildResultSchema>;
