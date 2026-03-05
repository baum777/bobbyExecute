/**
 * Event definitions for A==B Pipeline.
 * Typed events with Zod validation.
 */
import { z } from "zod";

export const IntentCreatedEventSchema = z.object({
  type: z.literal("IntentCreated"),
  traceId: z.string(),
  timestamp: z.string().datetime(),
  intent: z.object({
    traceId: z.string(),
    timestamp: z.string(),
    idempotencyKey: z.string(),
    tokenIn: z.string(),
    tokenOut: z.string(),
    amountIn: z.string(),
    minAmountOut: z.string(),
    slippagePercent: z.number(),
    dryRun: z.boolean().optional(),
  }),
});

export const DecisionMadeEventSchema = z.object({
  type: z.literal("DecisionMade"),
  traceId: z.string(),
  timestamp: z.string().datetime(),
  stage: z.string(),
  allowed: z.boolean(),
  blockedReason: z.string().optional(),
  decisionHash: z.string().optional(),
});

export const TradeExecutedEventSchema = z.object({
  type: z.literal("TradeExecuted"),
  traceId: z.string(),
  timestamp: z.string().datetime(),
  success: z.boolean(),
  tradeIntentId: z.string(),
  txSignature: z.string().optional(),
  error: z.string().optional(),
  dryRun: z.boolean().optional(),
});

export const JournalEntryRecordedEventSchema = z.object({
  type: z.literal("JournalEntryRecorded"),
  traceId: z.string(),
  timestamp: z.string().datetime(),
  stage: z.string(),
  decisionHash: z.string().optional(),
  resultHash: z.string().optional(),
  blocked: z.boolean().optional(),
});

export const StageTransitionEventSchema = z.object({
  type: z.literal("StageTransition"),
  traceId: z.string(),
  timestamp: z.string().datetime(),
  fromStage: z.string(),
  toStage: z.string(),
  payload: z.unknown().optional(),
});

export type IntentCreatedEvent = z.infer<typeof IntentCreatedEventSchema>;
export type DecisionMadeEvent = z.infer<typeof DecisionMadeEventSchema>;
export type TradeExecutedEvent = z.infer<typeof TradeExecutedEventSchema>;
export type JournalEntryRecordedEvent = z.infer<
  typeof JournalEntryRecordedEventSchema
>;
export type StageTransitionEvent = z.infer<typeof StageTransitionEventSchema>;

export type PipelineEvent =
  | IntentCreatedEvent
  | DecisionMadeEvent
  | TradeExecutedEvent
  | JournalEntryRecordedEvent
  | StageTransitionEvent;

export const EventSchemas = {
  IntentCreated: IntentCreatedEventSchema,
  DecisionMade: DecisionMadeEventSchema,
  TradeExecuted: TradeExecutedEventSchema,
  JournalEntryRecorded: JournalEntryRecordedEventSchema,
  StageTransition: StageTransitionEventSchema,
} as const;
