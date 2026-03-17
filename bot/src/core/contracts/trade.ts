/**
 * Trade lifecycle contracts.
 * Normalized planning package: executionMode, idempotencyKey semantics, RiskDecision.
 */
import { z } from "zod";

/** Execution mode: dry (no swap), paper (simulated), live (real swap) */
export const ExecutionModeSchema = z.enum(["dry", "paper", "live"]);

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
  /** Normalized: explicit execution mode semantics */
  executionMode: z.enum(["dry", "paper", "live"]).optional().default("dry"),
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

/** Risk decision with severity and reason codes (hardened) */
export const RiskDecisionSchema = z.object({
  allowed: z.boolean(),
  checks: z.record(z.string(), z.boolean()),
  reason: z.string().optional(),
  blockReason: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  reasonCodes: z.array(z.string()).optional(),
});

export type RiskDecision = z.infer<typeof RiskDecisionSchema>;

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
  executionMode: z.enum(["dry", "paper", "live"]).optional(),
  paperExecution: z.boolean().optional(),
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
  verificationMode: z.enum(["rpc", "paper-simulated"]).optional(),
});

export type TradeIntent = z.infer<typeof TradeIntentSchema>;
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
export type ExecutionReport = z.infer<typeof ExecutionReportSchema>;
export type RpcVerificationReport = z.infer<typeof RpcVerificationReportSchema>;
