/**
 * Internal sidecar watch candidate contract.
 * Non-authoritative and advisory-only.
 */
import { z } from "zod";

export const WatchCandidateSourceSchema = z.literal("llm_downtrend_worker");

export const WatchCandidateMonitorRecommendationSchema = z.enum([
  "monitor",
  "ignore",
  "defer",
]);

export const WatchCandidateConfidenceBandSchema = z.enum([
  "low",
  "medium",
  "high",
]);

export const WatchCandidateSchema = z.object({
  token: z.string(),
  source: WatchCandidateSourceSchema.default("llm_downtrend_worker"),
  observationCompleteness: z.number().min(0).max(1),
  monitorRecommendation: WatchCandidateMonitorRecommendationSchema,
  ttlExpiresAt: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  confidenceBand: WatchCandidateConfidenceBandSchema.default("medium"),
  evidenceRefs: z.array(z.string()).default([]),
});

export type WatchCandidate = z.infer<typeof WatchCandidateSchema>;
export type WatchCandidateMonitorRecommendation = z.infer<
  typeof WatchCandidateMonitorRecommendationSchema
>;
export type WatchCandidateConfidenceBand = z.infer<
  typeof WatchCandidateConfidenceBandSchema
>;

export function assertWatchCandidate(
  value: unknown,
  source = "unknown"
): WatchCandidate {
  const result = WatchCandidateSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const reason = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}:${issue.message}`;
    })
    .join(";");

  throw new Error(`INVALID_WATCH_CANDIDATE:${source}:${reason}`);
}
