/**
 * Non-authoritative trend reversal observation contract for sidecar monitoring.
 */
import { z } from "zod";

export const TrendReversalObservationStateSchema = z.enum([
  "DOWN_TREND_CONFIRMED",
  "WEAK_BOUNCE",
  "RECLAIM_ATTEMPT",
  "STRUCTURE_SHIFT_FORMING",
  "INVALIDATED",
]);

export const TrendReversalStructureContextSchema = z.object({
  reclaimZone: z.array(z.number()).length(2).optional(),
  lowerHigh: z.number().optional(),
  drawdownPct: z.number().optional(),
});

export const TrendReversalObservationV1Schema = z.object({
  schema_version: z.literal("trend_reversal_observation.v1"),
  token: z.string(),
  observationState: TrendReversalObservationStateSchema,
  structureContext: TrendReversalStructureContextSchema,
  monitoringConfidence: z.number().min(0).max(1),
  invalidationFlags: z.array(z.string()).default([]),
  evidenceRefs: z.array(z.string()).default([]),
  observedAt: z.number().int().nonnegative(),
});

export type TrendReversalObservationState = z.infer<typeof TrendReversalObservationStateSchema>;
export type TrendReversalObservationV1 = z.infer<typeof TrendReversalObservationV1Schema>;

export function assertTrendReversalObservationV1(
  value: unknown,
  source = "unknown"
): TrendReversalObservationV1 {
  const result = TrendReversalObservationV1Schema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const reason = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}:${issue.message}`;
    })
    .join(";");

  throw new Error(`INVALID_TREND_REVERSAL_OBSERVATION:${source}:${reason}`);
}
