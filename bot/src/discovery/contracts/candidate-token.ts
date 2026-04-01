/**
 * Pre-authority typed artifact.
 * Contract scaffold only for v2 candidate discovery output.
 */
import { z } from "zod";
import { SourceObservationSourceSchema } from "./source-observation.js";

export const CandidateTokenPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  // Reserved for future use. PR-02b does not emit this priority yet.
  "critical",
]);

export const CandidateTokenSchema = z.object({
  schema_version: z.literal("candidate_token.v1"),
  token: z.string(),
  symbol: z.string().optional(),
  chain: z.enum(["solana"]),
  discoveryReasons: z.array(z.string()).default([]),
  firstSeenMs: z.number().int().nonnegative(),
  sourceSet: z.array(SourceObservationSourceSchema).default([]),
  evidenceRefs: z.array(z.string()).default([]),
  priority: CandidateTokenPrioritySchema,
});

export type CandidateTokenPriority = z.infer<typeof CandidateTokenPrioritySchema>;
export type CandidateToken = z.infer<typeof CandidateTokenSchema>;

export function assertCandidateToken(value: unknown, source = "unknown"): CandidateToken {
  const result = CandidateTokenSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const reason = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}:${issue.message}`;
    })
    .join(";");

  throw new Error(`INVALID_CANDIDATE_TOKEN:${source}:${reason}`);
}
