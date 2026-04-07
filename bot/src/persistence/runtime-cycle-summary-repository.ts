import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { ExecutionReport, RpcVerificationReport } from "../core/contracts/trade.js";
import type { DecisionEnvelope } from "../core/contracts/decision-envelope.js";
import type { DecisionEvidenceRef, DecisionFreshness } from "../core/contracts/decision-envelope.js";
import type { DecisionReasonClass } from "../core/contracts/decision-reason-class.js";
import { resolveDecisionReasonClass } from "../core/contracts/decision-reason-class.js";

export type RuntimeCycleIntakeOutcome = "ok" | "stale" | "adapter_error" | "invalid" | "kill_switch_halted";
export type RuntimeCycleOutcome = "success" | "blocked" | "error";

export interface RuntimeCycleExecutionEvidence {
  success: boolean;
  mode?: ExecutionReport["executionMode"];
  paperExecution?: boolean;
  actualAmountOut?: string;
  error?: string;
}

export interface RuntimeCycleVerificationEvidence {
  passed: boolean;
  mode?: RpcVerificationReport["verificationMode"];
  reason?: string;
}

export interface RuntimeCycleDegradedState {
  active: boolean;
  consecutiveCycles: number;
  lastDegradedAt?: string;
  lastRecoveredAt?: string;
  lastReason?: string;
  recoveryCount: number;
  recoveredThisCycle: boolean;
}

export interface RuntimeCycleAdapterHealthSnapshot {
  total: number;
  healthy: number;
  unhealthy: number;
  degraded: boolean;
  degradedAdapterIds: string[];
  unhealthyAdapterIds: string[];
}

export interface RuntimeCycleReasonBasis {
  stage: string;
  outcome: RuntimeCycleOutcome;
  blockedReason?: string;
  error?: string;
  failureStage?: string;
  failureCode?: string;
}

export interface RuntimeCycleProvenance {
  reasonClass?: DecisionReasonClass;
  sources: string[];
  freshness?: DecisionFreshness;
  evidenceRef?: DecisionEvidenceRef;
  evidenceRefs: string[];
  reasonBasis: RuntimeCycleReasonBasis;
}

export interface RuntimeCycleProducer {
  name: "dry-run-runtime" | "live-runtime";
  kind: "runtime_cycle_summary";
  canonicalDecisionTruth: false;
}

export type RuntimeShadowArtifactStatus = "built" | "blocked" | "error" | "skipped";
export type RuntimeShadowArtifactFailureStage =
  | "input_intake"
  | "source_observation"
  | "discovery_evidence"
  | "candidate_token"
  | "universe_build_result"
  | "data_quality"
  | "cqd_snapshot"
  | "constructed_signal_set"
  | "score_card";

export type RuntimeAuthorityArtifactStatus = "built" | "blocked" | "error" | "skipped";
export type RuntimeAuthorityArtifactFailureStage =
  | "input_intake"
  | "source_observation"
  | "discovery_evidence"
  | "candidate_token"
  | "universe_build_result"
  | "data_quality"
  | "cqd_snapshot"
  | "constructed_signal_set"
  | "score_card";

export interface RuntimeCycleShadowArtifactChainSummary {
  artifactMode: "shadow";
  derivedOnly: true;
  nonAuthoritative: true;
  authorityInfluence: false;
  canonicalDecisionHistory: false;
  chainVersion: "shadow_artifact_chain.v1";
  status: RuntimeShadowArtifactStatus;
  failureStage?: RuntimeShadowArtifactFailureStage;
  failureReason?: string;
  inputRefs: string[];
  evidenceRefs: string[];
  parity: {
    oldAuthority: {
      blocked: boolean;
      blockedReason?: string;
      signalDirection?: string;
      signalConfidence?: number;
      tradeIntentId?: string;
    };
    shadowDerived: {
      blocked: boolean;
      qualityStatus?: "pass" | "degraded" | "fail";
      scoreComposite?: number | null;
      scoreConfidence?: number | null;
      cqdHash?: string;
    };
    deltas: {
      blockedMismatch: boolean;
      confidenceDelta: number | null;
    };
  };
  artifacts: {
    sourceObservationCount: number;
    sourceObservationRefs: string[];
    staleSources: string[];
    discoveryEvidenceRef?: string;
    discoveryEvidenceHash?: string;
    qualityStatus?: "pass" | "degraded" | "fail";
    qualityReasonCodes?: string[];
    qualityMissingCriticalFields?: string[];
    qualityStaleSources?: string[];
    qualityCrossSourceConfidence?: number;
    cqdHash?: string;
    cqdAnomalyFlags?: string[];
    cqdStageError?: string;
    constructedSignalSetPayloadHash?: string;
    constructedSignalSetBuildStatus?: "built" | "degraded" | "invalidated";
    scoreCardPayloadHash?: string;
    scoreCardBuildStatus?: "built" | "degraded" | "invalidated";
  };
}

export interface RuntimeCycleAuthorityArtifactChainSummary {
  artifactMode: "authority";
  derivedOnly: false;
  nonAuthoritative: false;
  authorityInfluence: true;
  canonicalDecisionHistory: false;
  chainVersion: "authority_artifact_chain.v1";
  status: RuntimeAuthorityArtifactStatus;
  failureStage?: RuntimeAuthorityArtifactFailureStage;
  failureReason?: string;
  inputRefs: string[];
  evidenceRefs: string[];
  decision: {
    blocked: boolean;
    blockedReason?: string;
    direction?: string;
    confidence?: number;
    tradeIntentId?: string;
  };
  artifacts: {
    sourceObservationCount: number;
    sourceObservationRefs: string[];
    discoveryEvidenceRef?: string;
    discoveryEvidenceHash?: string;
    dataQualityStatus?: "pass" | "degraded" | "fail";
    dataQualityReasonCodes?: string[];
    dataQualityMissingCriticalFields?: string[];
    dataQualityStaleSources?: string[];
    dataQualityCrossSourceConfidence?: number;
    cqdHash?: string;
    cqdAnomalyFlags?: string[];
    cqdStageError?: string;
    constructedSignalSetPayloadHash?: string;
    constructedSignalSetBuildStatus?: "built" | "degraded" | "invalidated";
    scoreCardPayloadHash?: string;
    scoreCardBuildStatus?: "built" | "degraded" | "invalidated";
    scoreComposite?: number | null;
    scoreConfidence?: number | null;
  };
}

export interface RuntimeCycleSummary {
  cycleTimestamp: string;
  traceId: string;
  mode: "dry" | "paper" | "live";
  producer?: RuntimeCycleProducer;
  outcome: RuntimeCycleOutcome;
  intakeOutcome: RuntimeCycleIntakeOutcome;
  advanced: boolean;
  stage: string;
  blocked: boolean;
  blockedReason?: string;
  /** Primary canonical decision-history artifact for this cycle (when produced by Engine / coordinator). */
  decisionEnvelope?: DecisionEnvelope;
  decisionOccurred: boolean;
  signalOccurred: boolean;
  riskOccurred: boolean;
  chaosOccurred: boolean;
  executionOccurred: boolean;
  verificationOccurred: boolean;
  paperExecutionProduced: boolean;
  verificationMode?: "rpc" | "paper-simulated";
  errorOccurred: boolean;
  error?: string;
  provenance?: RuntimeCycleProvenance;
  decision?: {
    allowed: boolean;
    direction?: string;
    confidence?: number;
    riskAllowed?: boolean;
    chaosAllowed?: boolean;
    reason?: string;
    tradeIntentId?: string;
  };
  tradeIntentId?: string;
  execution?: RuntimeCycleExecutionEvidence;
  verification?: RuntimeCycleVerificationEvidence;
  degradedState?: RuntimeCycleDegradedState;
  adapterHealth?: RuntimeCycleAdapterHealthSnapshot;
  /** Shadow-only deterministic parity scaffold; derived support only and never authority-canonical. */
  shadowArtifactChain?: RuntimeCycleShadowArtifactChainSummary;
  /** Canonical upstream authority chain after PR-M1-02 cutover. */
  authorityArtifactChain?: RuntimeCycleAuthorityArtifactChainSummary;
  incidentIds: string[];
}

export interface RuntimeCycleSummaryWriter {
  append(summary: RuntimeCycleSummary): Promise<void>;
  list(limit?: number): Promise<RuntimeCycleSummary[]>;
  getByTraceId(traceId: string): Promise<RuntimeCycleSummary | null>;
}

export class InMemoryRuntimeCycleSummaryWriter implements RuntimeCycleSummaryWriter {
  private readonly summaries: RuntimeCycleSummary[] = [];

  async append(summary: RuntimeCycleSummary): Promise<void> {
    this.summaries.push({ ...summary });
  }

  async list(limit = 100): Promise<RuntimeCycleSummary[]> {
    return this.summaries.slice(-limit);
  }

  async getByTraceId(traceId: string): Promise<RuntimeCycleSummary | null> {
    return this.summaries.find((summary) => summary.traceId === traceId) ?? null;
  }
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function evidenceRefToRefs(evidenceRef?: DecisionEvidenceRef): string[] {
  if (!evidenceRef) {
    return [];
  }

  return uniqueSorted(
    Object.entries(evidenceRef)
      .filter(([, value]) => typeof value === "string" && value.length > 0)
      .map(([key, value]) => `${key}:${value}`)
  );
}

function decisionStageForReasonBasis(stage: string): "ingest" | "signal" | "reasoning" | "risk" | "execute" | "verify" | "journal" | "monitor" {
  switch (stage) {
    case "ingest":
    case "signal":
    case "reasoning":
    case "risk":
    case "execute":
    case "verify":
    case "journal":
    case "monitor":
      return stage;
    default:
      return "journal";
  }
}

function collectSources(input: {
  decisionSources?: string[];
  authorityArtifactChain?: RuntimeCycleAuthorityArtifactChainSummary;
  shadowArtifactChain?: RuntimeCycleShadowArtifactChainSummary;
}): string[] {
  const sources = new Set<string>(input.decisionSources ?? []);

  for (const ref of [
    ...(input.authorityArtifactChain?.artifacts.sourceObservationRefs ?? []),
    ...(input.shadowArtifactChain?.artifacts.sourceObservationRefs ?? []),
  ]) {
    const source = ref.split(":")[0]?.trim();
    if (source) {
      sources.add(source);
    }
  }

  return [...sources].sort((left, right) => left.localeCompare(right));
}

export function buildRuntimeCycleProvenance(input: {
  stage: string;
  outcome: RuntimeCycleOutcome;
  blocked?: boolean;
  blockedReason?: string;
  error?: string;
  decisionEnvelope?: DecisionEnvelope;
  execution?: RuntimeCycleExecutionEvidence;
  verification?: RuntimeCycleVerificationEvidence;
  authorityArtifactChain?: RuntimeCycleAuthorityArtifactChainSummary;
  shadowArtifactChain?: RuntimeCycleShadowArtifactChainSummary;
  cycleTimestamp: string;
}): RuntimeCycleProvenance {
  const canonicalEnvelope =
    input.decisionEnvelope?.schemaVersion === "decision.envelope.v3" ? input.decisionEnvelope : undefined;
  const sources = collectSources({
    decisionSources: canonicalEnvelope?.sources,
    authorityArtifactChain: input.authorityArtifactChain,
    shadowArtifactChain: input.shadowArtifactChain,
  });
  const freshness =
    canonicalEnvelope?.freshness ??
    (input.blocked || input.outcome !== "success"
      ? {
          marketAgeMs: 0,
          walletAgeMs: 0,
          maxAgeMs: 1,
          observedAt: input.cycleTimestamp,
        }
      : undefined);
  const evidenceRef = canonicalEnvelope?.evidenceRef;
  const evidenceRefs = uniqueSorted([
    ...evidenceRefToRefs(evidenceRef),
    ...(input.authorityArtifactChain?.evidenceRefs ?? []),
    ...(input.shadowArtifactChain?.evidenceRefs ?? []),
  ]);

  const reasonText = [input.blockedReason, input.error, input.execution?.error, input.verification?.reason]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
  let reasonClass = canonicalEnvelope?.reasonClass;

  if (!reasonClass && /kill[_-]?switch|halted|emergency/i.test(reasonText)) {
    reasonClass = "RISK_BLOCKED";
  }
  if (!reasonClass && input.outcome === "error" && !/DATA_(STALE|MISSING|DISAGREEMENT)/i.test(reasonText)) {
    reasonClass = "EXECUTION_FAILED";
  }
  if (!reasonClass) {
    reasonClass = resolveDecisionReasonClass({
      blocked: input.blocked ?? input.outcome !== "success",
      terminalStage: decisionStageForReasonBasis(input.stage),
      blockedReason: input.blockedReason ?? input.error,
      tradeCompleted: input.execution?.success === true,
    });
  }

  return {
    reasonClass,
    sources,
    freshness,
    evidenceRef,
    evidenceRefs,
    reasonBasis: {
      stage: input.stage,
      outcome: input.outcome,
      blockedReason: input.blockedReason,
      error: input.error,
      failureStage:
        input.execution?.success === false
          ? "execute"
          : input.verification?.passed === false
            ? "verify"
            : input.blocked || input.outcome !== "success"
              ? input.stage
              : undefined,
      failureCode: input.blockedReason ?? input.error ?? input.execution?.error ?? input.verification?.reason,
    },
  };
}

export class FileSystemRuntimeCycleSummaryWriter implements RuntimeCycleSummaryWriter {
  constructor(private readonly filePath: string) {}

  async append(summary: RuntimeCycleSummary): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await appendFile(this.filePath, `${JSON.stringify(summary)}\n`, "utf8");
  }

  async list(limit = 100): Promise<RuntimeCycleSummary[]> {
    if (!existsSync(this.filePath)) return [];
    const content = await readFile(this.filePath, "utf8");
    const parsed = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RuntimeCycleSummary);
    return parsed.slice(-limit);
  }

  async getByTraceId(traceId: string): Promise<RuntimeCycleSummary | null> {
    if (!existsSync(this.filePath)) return null;
    const content = await readFile(this.filePath, "utf8");
    const parsed = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RuntimeCycleSummary);
    return parsed.find((summary) => summary.traceId === traceId) ?? null;
  }
}
