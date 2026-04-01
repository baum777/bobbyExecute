/**
 * Canonical authority for deterministic, fail-closed decision production.
 * It owns trace identity, stage order, and canonical decision/result hashing.
 */
import { createTraceId } from "../../observability/trace-id.js";
import { hashDecision, hashResult } from "../determinism/hash.js";
import type {
  DecisionCoordinator,
  DecisionEnvelope,
  DecisionFlow,
  DecisionHandlers,
  DecisionRequest,
  DecisionStage,
  DecisionStageContext,
  DecisionStageOutcome,
} from "../contracts/decision-envelope.js";

const CANONICAL_STAGE_ORDER: DecisionStage[] = [
  "ingest",
  "signal",
  "reasoning",
  "risk",
  "execute",
  "verify",
  "journal",
  "monitor",
];

const REQUIRED_STAGES: Record<DecisionFlow, DecisionStage[]> = {
  analysis: ["ingest", "signal", "reasoning", "risk", "journal"],
  trade: ["ingest", "signal", "risk", "execute", "verify", "journal"],
};

export class CanonicalDecisionAuthority implements DecisionCoordinator {
  async run(request: DecisionRequest): Promise<DecisionEnvelope> {
    const timestamp = request.clock.now().toISOString();
    const traceId = createTraceId({
      timestamp,
      seed: request.traceIdSeed,
      prefix: request.tracePrefix ?? "decision",
      mode:
        request.traceIdSeed !== undefined || process.env.REPLAY_MODE === "true"
          ? "replay"
          : "live",
    });

    const handlers = request.handlers;
    const stageResults: Array<{
      stage: DecisionStage;
      payload?: unknown;
      blocked?: boolean;
      blockedReason?: string;
    }> = [];

    for (const requiredStage of REQUIRED_STAGES[request.flow]) {
      if (!handlers[requiredStage]) {
        throw new Error(
          `DECISION_COORDINATOR_MISSING_HANDLER:${request.entrypoint}:${request.flow}:${requiredStage}`
        );
      }
    }

    let blocked = false;
    let blockedReason: string | undefined;
    let terminalStage: DecisionStage = "ingest";

    for (const stage of CANONICAL_STAGE_ORDER) {
      const handler = handlers[stage];
      if (!handler) {
        continue;
      }

      const outcome = await handler({
        entrypoint: request.entrypoint,
        flow: request.flow,
        stage,
        traceId,
        timestamp,
      });
      const normalized = normalizeOutcome(stage, outcome);
      stageResults.push(normalized);
      terminalStage = stage;

      if (normalized.blocked) {
        blocked = true;
        blockedReason = normalized.blockedReason;
        break;
      }
    }

    const executionMode = request.executionMode ?? "dry";
    const schemaVersion = "decision.envelope.v2" as const;
    const canonicalDecisionHash = hashDecision({
      schemaVersion,
      executionMode,
      stages: stageResults.map((record) => ({
        stage: record.stage,
        payload: record.payload,
        blocked: record.blocked === true,
        blockedReason: record.blockedReason,
      })),
      blocked,
      blockedReason,
    });
    const canonicalResultHash = hashResult({
      schemaVersion,
      executionMode,
      stages: stageResults.map((record) => ({
        stage: record.stage,
        blocked: record.blocked === true,
        blockedReason: record.blockedReason,
      })),
      blocked,
      blockedReason,
    });

    return {
      schemaVersion,
      entrypoint: request.entrypoint,
      flow: request.flow,
      executionMode,
      traceId,
      stage: terminalStage,
      blocked,
      blockedReason,
      decisionHash: canonicalDecisionHash,
      resultHash: canonicalResultHash,
    };
  }
}

function normalizeOutcome(stage: DecisionStage, outcome: DecisionStageOutcome | void): {
  stage: DecisionStage;
  payload?: unknown;
  blocked?: boolean;
  blockedReason?: string;
} {
  return {
    stage,
    payload: outcome?.payload,
    blocked: outcome?.blocked === true,
    blockedReason: outcome?.blockedReason,
  };
}

export function createCanonicalDecisionAuthority(): DecisionCoordinator {
  return new CanonicalDecisionAuthority();
}

export function createDecisionCoordinator(): DecisionCoordinator {
  return createCanonicalDecisionAuthority();
}

export type { DecisionCoordinator as DecisionCoordinatorInterface };
