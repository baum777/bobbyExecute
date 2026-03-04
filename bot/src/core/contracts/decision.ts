/**
 * Trading decision types.
 * PROPOSED for onchain trading bot.
 */
import { z } from "zod";
import { DecisionAction, DecisionPreviewV1, DecisionTokenV1 } from "../../packages/core-trading/src/contracts/decision.js";

export const SignalSchema = z.object({
  traceId: z.string(),
  timestamp: z.string().datetime(),
  direction: z.enum(["buy", "sell", "hold"]),
  confidence: z.number().min(0).max(1),
  tokenIn: z.string().optional(),
  tokenOut: z.string().optional(),
  rationale: z.string().optional(),
});

export type Signal = z.infer<typeof SignalSchema>;

// V1 Decision Token Schema
export const DecisionTokenV1Schema = z.object({
  schema_version: z.literal("decision.token.v1"),
  decision_id: z.string(),
  cqd_hash: z.string(),
  pattern_id: z.string().nullable(),
  sizing_hash: z.string().nullable(),
  policy_hash: z.string(),
  gates_hash: z.string(),
  created_at_bucket: z.number(),
  expires_at_bucket: z.number(),
  action: z.enum(["EXECUTE", "HOLD", "BLOCK"]),
  prev_journal_hash: z.string().nullable(),
  token_hash: z.string(),
  signature: z.string().optional(),
});

export interface DecisionTokenV1Extended extends DecisionTokenV1 {}
