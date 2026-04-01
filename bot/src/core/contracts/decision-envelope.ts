/**
 * Canonical decision envelope for coordinated pipeline execution.
 * Wave 1: the canonical authority surface shared by engine, orchestrator, and runtimes.
 */
import { z } from "zod";
import type { Clock } from "../clock.js";

export const DecisionEntrypointSchema = z.enum([
  "engine",
  "orchestrator",
  "dry-runtime",
  "live-runtime",
]);

export const DecisionFlowSchema = z.enum(["analysis", "trade"]);

export const DecisionStageSchema = z.enum([
  "ingest",
  "signal",
  "reasoning",
  "risk",
  "execute",
  "verify",
  "journal",
  "monitor",
]);

const DecisionEnvelopeV1Schema = z.object({
  schemaVersion: z.literal("decision.envelope.v1"),
  entrypoint: DecisionEntrypointSchema,
  flow: DecisionFlowSchema,
  traceId: z.string(),
  stage: DecisionStageSchema,
  blocked: z.boolean(),
  blockedReason: z.string().optional(),
  decisionHash: z.string(),
  resultHash: z.string(),
});

/** Primary canonical contract — includes runtime execution mode for cross-mode convergence. */
const DecisionEnvelopeV2Schema = z.object({
  schemaVersion: z.literal("decision.envelope.v2"),
  entrypoint: DecisionEntrypointSchema,
  flow: DecisionFlowSchema,
  /** Trading execution mode for this decision (dry / paper / live). */
  executionMode: z.enum(["dry", "paper", "live"]),
  traceId: z.string(),
  stage: DecisionStageSchema,
  blocked: z.boolean(),
  blockedReason: z.string().optional(),
  decisionHash: z.string(),
  resultHash: z.string(),
});

export const DecisionEnvelopeSchema = z.union([DecisionEnvelopeV1Schema, DecisionEnvelopeV2Schema]);

export type DecisionEntrypoint = z.infer<typeof DecisionEntrypointSchema>;
export type DecisionFlow = z.infer<typeof DecisionFlowSchema>;
export type DecisionStage = z.infer<typeof DecisionStageSchema>;
export type DecisionEnvelope = z.infer<typeof DecisionEnvelopeSchema>;

export function assertDecisionEnvelope(value: unknown, source = "unknown"): DecisionEnvelope {
  const result = DecisionEnvelopeSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const reason = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}:${issue.message}`;
    })
    .join(";");

  throw new Error(`INVALID_DECISION_ENVELOPE:${source}:${reason}`);
}

export interface DecisionStageContext {
  entrypoint: DecisionEntrypoint;
  flow: DecisionFlow;
  stage: DecisionStage;
  traceId: string;
  timestamp: string;
}

export interface DecisionStageOutcome {
  payload?: unknown;
  blocked?: boolean;
  blockedReason?: string;
}

export type DecisionStageHandler = (
  context: DecisionStageContext
) => Promise<DecisionStageOutcome | void>;

export type DecisionHandlers = Partial<Record<DecisionStage, DecisionStageHandler>>;

export interface DecisionRequest {
  entrypoint: DecisionEntrypoint;
  flow: DecisionFlow;
  /** Defaults to dry when omitted (analysis flows). */
  executionMode?: "dry" | "paper" | "live";
  clock: Clock;
  traceIdSeed?: unknown;
  tracePrefix?: string;
  handlers: DecisionHandlers;
}

export interface DecisionCoordinator {
  run(request: DecisionRequest): Promise<DecisionEnvelope>;
}
