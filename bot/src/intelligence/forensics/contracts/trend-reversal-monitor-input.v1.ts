/**
 * Pre-authority typed input contract for the future trend reversal monitor worker.
 * Purely observational and replay-safe.
 */
import { z } from "zod";
import { CQDSnapshotV1Schema } from "../../cqd/contracts/cqd.snapshot.v1.js";
import { DataQualityV1Schema } from "../../quality/contracts/data-quality.v1.js";
import { SignalPackV1Schema } from "./signal-pack.v1.js";

export const TrendReversalMonitorInputAvailabilitySchema = z.object({
  supplementalHintsAvailable: z.boolean(),
  missingSupplementalHints: z.array(z.string()).default([]),
});

export const TrendReversalMonitorInputV1Schema = z.object({
  schema_version: z.literal("trend_reversal_monitor_input.v1"),
  chain: z.enum(["solana"]),
  token: z.string(),
  traceId: z.string(),
  timestamp: z.string().datetime(),
  dataQualityTraceId: z.string(),
  cqdHash: z.string(),
  signalPackHash: z.string(),
  dataQuality: DataQualityV1Schema,
  cqdSnapshot: CQDSnapshotV1Schema,
  signalPack: SignalPackV1Schema,
  evidenceRefs: z.array(z.string()).default([]),
  missingFields: z.array(z.string()).default([]),
  contextAvailability: TrendReversalMonitorInputAvailabilitySchema,
  notes: z.array(z.string()).default([]),
  payloadHash: z.string(),
});

export type TrendReversalMonitorInputAvailability = z.infer<
  typeof TrendReversalMonitorInputAvailabilitySchema
>;
export type TrendReversalMonitorInputV1 = z.infer<typeof TrendReversalMonitorInputV1Schema>;

export function assertTrendReversalMonitorInputV1(
  value: unknown,
  source = "unknown"
): TrendReversalMonitorInputV1 {
  const result = TrendReversalMonitorInputV1Schema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const reason = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}:${issue.message}`;
    })
    .join(";");

  throw new Error(`INVALID_TREND_REVERSAL_MONITOR_INPUT:${source}:${reason}`);
}
