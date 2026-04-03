import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { ExecutionReport, RpcVerificationReport } from "../core/contracts/trade.js";
import type { DecisionEnvelope } from "../core/contracts/decision-envelope.js";

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
