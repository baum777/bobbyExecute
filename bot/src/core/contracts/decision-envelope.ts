/**
 * Canonical decision envelope for coordinated pipeline execution.
 * Wave 1: the canonical authority surface shared by engine, orchestrator, and runtimes.
 * PR-C1: v3 adds audit-grade provenance (reason class, sources, freshness, evidence refs).
 */
import { z } from "zod";
import type { Clock } from "../clock.js";
import { DecisionReasonClassSchema, type DecisionReasonClass } from "./decision-reason-class.js";

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

const DecisionFreshnessSchema = z.object({
  marketAgeMs: z.number().nonnegative(),
  walletAgeMs: z.number().nonnegative(),
  maxAgeMs: z.number().positive(),
  observedAt: z.string(),
});

const DecisionEvidenceRefSchema = z.object({
  marketRawHash: z.string().optional(),
  walletRawHash: z.string().optional(),
  signalPackHash: z.string().optional(),
});

const DecisionEnvelopeV3Schema = z.object({
  schemaVersion: z.literal("decision.envelope.v3"),
  entrypoint: DecisionEntrypointSchema,
  flow: DecisionFlowSchema,
  executionMode: z.enum(["dry", "paper", "live"]),
  traceId: z.string(),
  stage: DecisionStageSchema,
  blocked: z.boolean(),
  blockedReason: z.string().optional(),
  /** Normalized audit reason (orthogonal to free-text blockedReason). */
  reasonClass: DecisionReasonClassSchema,
  /** Adapters / subsystems that contributed to this decision. */
  sources: z.array(z.string()),
  freshness: DecisionFreshnessSchema,
  evidenceRef: DecisionEvidenceRefSchema,
  decisionHash: z.string(),
  resultHash: z.string(),
});

export const DecisionEnvelopeSchema = z.union([
  DecisionEnvelopeV1Schema,
  DecisionEnvelopeV2Schema,
  DecisionEnvelopeV3Schema,
]);

export type DecisionEntrypoint = z.infer<typeof DecisionEntrypointSchema>;
export type DecisionFlow = z.infer<typeof DecisionFlowSchema>;
export type DecisionStage = z.infer<typeof DecisionStageSchema>;
export type DecisionEnvelope = z.infer<typeof DecisionEnvelopeSchema>;
export type DecisionFreshness = z.infer<typeof DecisionFreshnessSchema>;
export type DecisionEvidenceRef = z.infer<typeof DecisionEvidenceRefSchema>;
export type { DecisionReasonClass };

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
  /** PR-C1: optional per-stage provenance merged into envelope v3. */
  reasonClass?: DecisionReasonClass;
  sources?: string[];
  freshness?: DecisionFreshness;
  evidenceRef?: DecisionEvidenceRef;
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
