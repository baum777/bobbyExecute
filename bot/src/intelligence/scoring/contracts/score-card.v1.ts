/**
 * Pre-decision score card artifact.
 * Derived from constructed signals only; never decision authority.
 * Ownership freeze (PR-M0-01): single owner for `ScoreCardV1` is this file.
 */
import { z } from "zod";
import {
  ScoreComponentV1Schema,
} from "./score-component.v1.js";

export const ScoreCardBuildStatusSchema = z.enum([
  "built",
  "degraded",
  "invalidated",
]);

export const ScoreCardSourceCoverageEntrySchema = z.object({
  status: z.string(),
  isStale: z.boolean(),
});

export const ScoreCardAggregateScoresSchema = z.object({
  constructive: z.number().min(-1).max(1).nullable().default(null),
  riskPressure: z.number().min(-1).max(1).nullable().default(null),
  composite: z.number().min(-1).max(1).nullable().default(null),
});

export const ScoreCardV1Schema = z.object({
  schema_version: z.literal("score_card.v1"),
  token: z.string(),
  chain: z.enum(["solana"]),
  scoringModelId: z.string(),
  scoringModelVersion: z.string(),
  componentScores: z.array(ScoreComponentV1Schema),
  aggregateScores: ScoreCardAggregateScoresSchema,
  confidence: z.number().min(0).max(1).nullable().default(null),
  inputRefs: z.array(z.string()).default([]),
  evidenceRefs: z.array(z.string()).default([]),
  missingInputs: z.array(z.string()).default([]),
  sourceCoverage: z.record(ScoreCardSourceCoverageEntrySchema).default({}),
  buildStatus: ScoreCardBuildStatusSchema,
  createdAtMs: z.number().int().nonnegative(),
  payloadHash: z.string(),
});

export type ScoreCardBuildStatus = z.infer<typeof ScoreCardBuildStatusSchema>;
export type ScoreCardSourceCoverageEntry = z.infer<
  typeof ScoreCardSourceCoverageEntrySchema
>;
export type ScoreCardAggregateScores = z.infer<
  typeof ScoreCardAggregateScoresSchema
>;
export type ScoreCardV1 = z.infer<typeof ScoreCardV1Schema>;

export function assertScoreCardV1(
  value: unknown,
  source = "unknown"
): ScoreCardV1 {
  const result = ScoreCardV1Schema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const reason = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}:${issue.message}`;
    })
    .join(";");

  throw new Error(`INVALID_SCORE_CARD:${source}:${reason}`);
}
