/**
 * Trading decision types.
 * PROPOSED for onchain trading bot.
 */
import { z } from "zod";

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
