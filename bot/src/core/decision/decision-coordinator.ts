/**
 * Canonical authority for deterministic, fail-closed decision production.
 * It owns trace identity, stage order, and canonical decision/result hashing.
 */
import { createTraceId } from "../../observability/trace-id.js";
import { hashDecision, hashResult } from "../determinism/hash.js";
import { resolveDecisionReasonClass } from "../contracts/decision-reason-class.js";
import type {
  DecisionCoordinator,
  DecisionEnvelope,
  DecisionEvidenceRef,
  DecisionFlow,
  DecisionFreshness,
  DecisionHandlers,
  DecisionRequest,
  DecisionStage,
  DecisionStageContext,
  DecisionStageOutcome,
} from "../contracts/decision-envelope.js";
import type { DecisionReasonClass } from "../contracts/decision-reason-class.js";

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
      reasonClass?: DecisionReasonClass;
      sources?: string[];
      freshness?: DecisionFreshness;
      evidenceRef?: DecisionEvidenceRef;
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
    const schemaVersion = "decision.envelope.v3" as const;

    const tradeCompleted = inferTradeCompleted(stageResults);
    const reasonClass =
      pickTerminalReasonClass(stageResults, blocked, terminalStage, blockedReason) ??
      resolveDecisionReasonClass({
        blocked,
        terminalStage,
        blockedReason,
        tradeCompleted,
      });

    const mergedProvenance = mergeProvenanceFromStages(stageResults, timestamp);

    const canonicalDecisionHash = hashDecision({
      schemaVersion,
      executionMode,
      stages: stageResults.map((record) => ({
        stage: record.stage,
        payload: record.payload,
        blocked: record.blocked === true,
        blockedReason: record.blockedReason,
        reasonClass: record.reasonClass,
        sources: record.sources,
        freshness: record.freshness,
        evidenceRef: record.evidenceRef,
      })),
      blocked,
      blockedReason,
      reasonClass,
      sources: mergedProvenance.sources,
      freshness: mergedProvenance.freshness,
      evidenceRef: mergedProvenance.evidenceRef,
    });
    const canonicalResultHash = hashResult({
      schemaVersion,
      executionMode,
      stages: stageResults.map((record) => ({
        stage: record.stage,
        blocked: record.blocked === true,
        blockedReason: record.blockedReason,
        reasonClass: record.reasonClass,
      })),
      blocked,
      blockedReason,
      reasonClass,
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
      reasonClass,
      sources: mergedProvenance.sources,
      freshness: mergedProvenance.freshness,
      evidenceRef: mergedProvenance.evidenceRef,
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
  reasonClass?: DecisionReasonClass;
  sources?: string[];
  freshness?: DecisionFreshness;
  evidenceRef?: DecisionEvidenceRef;
} {
  return {
    stage,
    payload: outcome?.payload,
    blocked: outcome?.blocked === true,
    blockedReason: outcome?.blockedReason,
    reasonClass: outcome?.reasonClass,
    sources: outcome?.sources,
    freshness: outcome?.freshness,
    evidenceRef: outcome?.evidenceRef,
  };
}

function inferTradeCompleted(
  stages: Array<{ stage: DecisionStage; payload?: unknown; blocked?: boolean }>
): boolean {
  const exec = stages.find((s) => s.stage === "execute");
  if (!exec || exec.blocked) {
    return false;
  }
  const payload = exec.payload as { execReport?: { success?: boolean } } | undefined;
  return payload?.execReport?.success === true;
}

function mergeProvenanceFromStages(
  stages: Array<{
    sources?: string[];
    freshness?: DecisionFreshness;
    evidenceRef?: DecisionEvidenceRef;
  }>,
  decisionTimestampIso: string
): { sources: string[]; freshness: DecisionFreshness; evidenceRef: DecisionEvidenceRef } {
  const sourceSet = new Set<string>();
  let freshness: DecisionFreshness | undefined;
  let evidenceRef: DecisionEvidenceRef = {};

  for (const s of stages) {
    for (const x of s.sources ?? []) {
      sourceSet.add(x);
    }
    if (s.freshness) {
      freshness = s.freshness;
    }
    if (s.evidenceRef) {
      evidenceRef = { ...evidenceRef, ...s.evidenceRef };
    }
  }

  if (!freshness) {
    freshness = {
      marketAgeMs: 0,
      walletAgeMs: 0,
      maxAgeMs: 1,
      observedAt: decisionTimestampIso,
    };
  } else {
    freshness = {
      ...freshness,
      observedAt: decisionTimestampIso,
    };
  }

  return {
    sources: Array.from(sourceSet).sort(),
    freshness,
    evidenceRef,
  };
}

function pickTerminalReasonClass(
  stages: Array<{ stage: DecisionStage; blocked?: boolean; reasonClass?: DecisionReasonClass }>,
  blocked: boolean,
  terminalStage: DecisionStage,
  blockedReason: string | undefined
): DecisionReasonClass | undefined {
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    const s = stages[i];
    if (s.stage === terminalStage && s.reasonClass) {
      return s.reasonClass;
    }
    if (blocked && s.blocked && s.reasonClass) {
      return s.reasonClass;
    }
  }
  if (blockedReason === "DATA_DISAGREEMENT:cross_source_price_divergence") {
    return "DATA_DISAGREEMENT";
  }
  return undefined;
}

export function createCanonicalDecisionAuthority(): DecisionCoordinator {
  return new CanonicalDecisionAuthority();
}

export function createDecisionCoordinator(): DecisionCoordinator {
  return createCanonicalDecisionAuthority();
}

export type { DecisionCoordinator as DecisionCoordinatorInterface };
