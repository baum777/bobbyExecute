/**
 * Trade lifecycle contracts.
 * PROPOSED for onchain trading bot.
 */
import { z } from "zod";

export const TradeIntentSchema = z.object({
  traceId: z.string(),
  timestamp: z.string().datetime(),
  idempotencyKey: z.string(),
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountIn: z.string(),
  minAmountOut: z.string(),
  slippagePercent: z.number().min(0).max(100),
  deadline: z.string().datetime().optional(),
  dryRun: z.boolean().default(false),
});

export const RiskAssessmentSchema = z.object({
  traceId: z.string(),
  timestamp: z.string().datetime(),
  tradeIntentId: z.string(),
  allowed: z.boolean(),
  reason: z.string().optional(),
  blockReason: z.string().optional(),
  checks: z.record(z.string(), z.boolean()),
});

export const ExecutionPlanSchema = z.object({
  traceId: z.string(),
  timestamp: z.string().datetime(),
  tradeIntentId: z.string(),
  rpcVerificationPassed: z.boolean(),
  quoteId: z.string().optional(),
  minOut: z.string(),
  slippageBps: z.number(),
});

export const ExecutionReportSchema = z.object({
  traceId: z.string(),
  timestamp: z.string().datetime(),
  tradeIntentId: z.string(),
  success: z.boolean(),
  txSignature: z.string().optional(),
  actualAmountOut: z.string().optional(),
  error: z.string().optional(),
  dryRun: z.boolean().optional(),
});

export const RpcVerificationReportSchema = z.object({
  traceId: z.string(),
  timestamp: z.string().datetime(),
  passed: z.boolean(),
  checks: z.object({
    tokenMint: z.boolean().optional(),
    decimals: z.boolean().optional(),
    balance: z.boolean().optional(),
    quoteInputs: z.boolean().optional(),
  }),
  reason: z.string().optional(),
});

export type TradeIntent = z.infer<typeof TradeIntentSchema>;
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
export type ExecutionReport = z.infer<typeof ExecutionReportSchema>;
export type RpcVerificationReport = z.infer<typeof RpcVerificationReportSchema>;
