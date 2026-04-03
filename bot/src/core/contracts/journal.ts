/**
 * Journal entry - append-only audit log.
 * Derived audit support only; never canonical decision history.
 * PROPOSED for onchain trading bot.
 */
import { z } from "zod";
import { JournalEventV1, JournalEventType } from "../../packages/core-trading/src/contracts/journal.js";

export const JournalEntrySchema = z.object({
  traceId: z.string(),
  timestamp: z.string().datetime(),
  stage: z.string(),
  decisionHash: z.string().optional(),
  resultHash: z.string().optional(),
  input: z.unknown(),
  output: z.unknown(),
  blocked: z.boolean().optional(),
  reason: z.string().optional(),
  /** Normalized: hash chain for append-only audit */
  eventHash: z.string().optional(),
  prevEventHash: z.string().optional(),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

// V1 Journal Event Schema
export const JournalEventV1Schema = z.object({
  schema_version: z.literal("journal.event.v1"),
  event_id: z.string(),
  ts_ms: z.number(),
  type: z.enum([
    "CQD_SNAPSHOT", "DECISION_PREVIEW", "DECISION_TOKEN",
    "TRADE_INTENT", "TRADE_EXECUTION", "TRADE_VERIFICATION",
    "POLICY_UPDATE", "MODEL_CHANGE"
  ]),
  payload: z.unknown(),
  prev_event_hash: z.string().nullable(),
  event_hash: z.string(),
});

export interface JournalEventV1Extended extends JournalEventV1 {}
