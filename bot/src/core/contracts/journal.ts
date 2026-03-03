/**
 * Journal entry - append-only audit log.
 * PROPOSED for onchain trading bot.
 */
import { z } from "zod";

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
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;
