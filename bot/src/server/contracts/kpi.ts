/**
 * KPI API contracts for Wave 3 - Runtime Visibility & Dashboard Bridge.
 * Matches readiness--waves.md §6.
 */
export interface RuntimeReadiness {
  posture: "healthy_for_posture" | "degraded_but_safe_in_paper" | "blocked_for_live" | "manual_review_required";
  liveAllowed: boolean;
  paperSafe: boolean;
  liveTestMode: boolean;
  rolloutPosture: "paper_only" | "micro_live" | "staged_live_candidate" | "paused_or_rolled_back";
  rolloutConfigured: boolean;
  rolloutConfigValid: boolean;
  roundStatus: "idle" | "preflighted" | "running" | "stopped" | "completed" | "failed";
  roundStartedAt?: string;
  roundStoppedAt?: string;
  roundCompletedAt?: string;
  stopReason?: string;
  failureReason?: string;
  blocked: boolean;
  disarmed: boolean;
  stopped: boolean;
  lastTransitionAt?: string;
  canArmMicroLive: boolean;
  canUseStagedLiveCandidate: boolean;
  blockers: Array<{
    code: string;
    scope: "startup" | "paper" | "micro_live" | "staged_live_candidate";
    message: string;
  }>;
  reason?: string;
}

export interface RuntimeLiveControl {
  mode: "dry" | "paper" | "live";
  liveTestMode: boolean;
  roundStatus: "idle" | "preflighted" | "running" | "stopped" | "completed" | "failed";
  roundStartedAt?: string;
  roundStoppedAt?: string;
  roundCompletedAt?: string;
  stopReason?: string;
  failureReason?: string;
  lastTransitionAt?: string;
  lastTransitionBy?: string;
  posture: string;
  rolloutPosture: RuntimeReadiness["rolloutPosture"];
  rolloutConfigured: boolean;
  rolloutConfigValid: boolean;
  rolloutReasonCode?: string;
  rolloutReasonDetail?: string;
  rolloutLastReasonAt?: string;
  caps: {
    requireArm: boolean;
    maxNotionalPerTrade: number;
    maxTradesPerWindow: number;
    windowMs: number;
    cooldownMs: number;
    maxInFlight: number;
    failuresToBlock: number;
    failureWindowMs: number;
    maxDailyNotional?: number;
    allowlistTokens: string[];
  };
  armed: boolean;
  killSwitchActive: boolean;
  blocked: boolean;
  disarmed: boolean;
  stopped: boolean;
  reasonCode?: string;
  reasonDetail?: string;
  lastOperatorAction?:
    | "arm"
    | "disarm"
    | "kill"
    | "reset_kill"
    | "mode"
    | "pause"
    | "resume"
    | "kill_switch"
    | "reload"
    | "runtime_config";
  lastOperatorActionAt?: string;
  lastGuardrailRefusal?: {
    code: string;
    stage: "preflight" | "limits";
    at: string;
    detail?: string;
    operatorActionRequired: boolean;
  };
  counters: {
    inFlight: number;
    tradesInWindow: number;
    failuresInWindow: number;
    dailyNotional: number;
    tradesToday: number;
    dailyLossUsd: number;
    lastExecutionAt?: string;
  };
}

export interface RuntimeRecentHistory {
  recentCycleCount: number;
  cycleOutcomes: Record<"success" | "blocked" | "error", number>;
  attemptsByMode: Record<"dry" | "paper" | "live", number>;
  refusalCounts: Record<string, number>;
  failureStageCounts: Record<string, number>;
  verificationHealth: {
    passed: number;
    failed: number;
    failureReasons: Record<string, number>;
  };
  incidentCounts: Record<string, number>;
  controlActions: Array<{
    id: string;
    at: string;
    severity: "info" | "warning" | "critical";
    type: string;
    message: string;
  }>;
  stateTransitions: Array<{
    at: string;
    type: string;
    message: string;
  }>;
  recentCycles: Array<{
    traceId: string;
    cycleTimestamp: string;
    mode: "dry" | "paper" | "live";
    outcome: "success" | "blocked" | "error";
    stage: string;
    blocked: boolean;
    blockedReason?: string;
    intakeOutcome: "ok" | "stale" | "adapter_error" | "invalid" | "kill_switch_halted";
    executionOccurred: boolean;
    verificationOccurred: boolean;
    decisionOccurred: boolean;
    errorOccurred: boolean;
    decisionEnvelope?: import("../../core/contracts/decision-envelope.js").DecisionEnvelope;
    decision?: {
      allowed: boolean;
      direction?: string;
      confidence?: number;
      riskAllowed?: boolean;
      chaosAllowed?: boolean;
      reason?: string;
      tradeIntentId?: string;
    };
  }>;
  recentIncidents: Array<{
    id: string;
    at: string;
    severity: "info" | "warning" | "critical";
    type: string;
    message: string;
  }>;
}

export interface HealthResponse {
  status: "OK" | "DEGRADED" | "FAIL";
  uptimeMs: number;
  version: string;
  /** Runtime-reported bot state when available from bootstrap wiring. */
  botStatus?: "running" | "paused" | "stopped";
  worker?: import("../../persistence/runtime-visibility-repository.js").RuntimeWorkerVisibility;
  killSwitch?: { halted: boolean; reason?: string; triggeredAt?: string };
  runtime?: {
    status: "idle" | "running" | "paused" | "stopped" | "error";
    mode: "dry" | "paper" | "live";
    paperModeActive: boolean;
    cycleInFlight: boolean;
    counters: {
      cycleCount: number;
      decisionCount: number;
      executionCount: number;
      blockedCount: number;
      errorCount: number;
    };
    lastCycleAt?: string;
    lastDecisionAt?: string;
    lastBlockedReason?: string;
    lastEngineStage?: string;
    lastIntakeOutcome?: "ok" | "stale" | "adapter_error" | "invalid" | "kill_switch_halted";
    liveControl?: RuntimeLiveControl;
    runtimeConfig?: import("../../config/runtime-config-schema.js").RuntimeConfigStatus;
    degraded?: {
      active: boolean;
      consecutiveCycles: number;
      lastDegradedAt?: string;
      lastRecoveredAt?: string;
      lastReason?: string;
      recoveryCount: number;
    };
    adapterHealth?: {
      total: number;
      healthy: number;
      unhealthy: number;
      degraded: boolean;
      degradedAdapterIds: string[];
      unhealthyAdapterIds: string[];
    };
    readiness?: {
      posture: RuntimeReadiness["posture"];
      liveAllowed: boolean;
      paperSafe: boolean;
      liveTestMode: boolean;
      rolloutPosture: RuntimeReadiness["rolloutPosture"];
      rolloutConfigured: boolean;
      rolloutConfigValid: boolean;
      roundStatus: RuntimeReadiness["roundStatus"];
      roundStartedAt?: string;
      roundStoppedAt?: string;
      roundCompletedAt?: string;
      stopReason?: string;
      failureReason?: string;
      blocked: boolean;
      disarmed: boolean;
      stopped: boolean;
      lastTransitionAt?: string;
      reason?: string;
    };
    recentHistory?: RuntimeRecentHistory;
  };
}

/** How a KPI value was produced (for operator honesty; never silent about derivation). */
export type KpiMetricProvenance =
  | "wired"
  | "derived"
  | "default"
  | "legacy_projection"
  | "unwired";

export interface KpiSummaryResponse {
  botStatus: "running" | "paused" | "stopped";
  riskScore: number;
  chaosPassRate: number;
  dataQuality: number;
  lastDecisionAt: string | null;
  tradesToday: number;
  /** Provenance labels for summary scalars (parallel to the numeric fields above). */
  metricProvenance?: {
    riskScore: KpiMetricProvenance;
    chaosPassRate: KpiMetricProvenance;
    dataQuality: KpiMetricProvenance;
    lastDecisionAt: KpiMetricProvenance;
    tradesToday: KpiMetricProvenance;
  };
  worker?: import("../../persistence/runtime-visibility-repository.js").RuntimeWorkerVisibility;
  runtime?: {
    mode: "dry" | "paper" | "live";
    paperModeActive: boolean;
    status: "idle" | "running" | "paused" | "stopped" | "error";
    cycleCount: number;
    decisionCount: number;
    executionCount: number;
    blockedCount: number;
    errorCount: number;
    lastDecisionAt?: string;
    lastIntakeOutcome?: "ok" | "stale" | "adapter_error" | "invalid" | "kill_switch_halted";
    liveControl?: RuntimeLiveControl;
    runtimeConfig?: import("../../config/runtime-config-schema.js").RuntimeConfigStatus;
    degraded?: {
      active: boolean;
      consecutiveCycles: number;
      lastDegradedAt?: string;
      lastRecoveredAt?: string;
      lastReason?: string;
      recoveryCount: number;
    };
    adapterHealth?: {
      total: number;
      healthy: number;
      unhealthy: number;
      degraded: boolean;
      degradedAdapterIds: string[];
      unhealthyAdapterIds: string[];
    };
    readiness?: {
      posture: RuntimeReadiness["posture"];
      liveAllowed: boolean;
      paperSafe: boolean;
      liveTestMode: boolean;
      rolloutPosture: RuntimeReadiness["rolloutPosture"];
      rolloutConfigured: boolean;
      rolloutConfigValid: boolean;
      roundStatus: RuntimeReadiness["roundStatus"];
      roundStartedAt?: string;
      roundStoppedAt?: string;
      roundCompletedAt?: string;
      stopReason?: string;
      failureReason?: string;
      blocked: boolean;
      disarmed: boolean;
      stopped: boolean;
      lastTransitionAt?: string;
      reason?: string;
    };
    recentHistory?: RuntimeRecentHistory;
  };
}

/** Normalized audit reason (canonical envelope v3). */
export type KpiDecisionReasonClass =
  | "DATA_STALE"
  | "DATA_MISSING"
  | "DATA_DISAGREEMENT"
  | "SIGNAL_REJECTED"
  | "RISK_BLOCKED"
  | "EXECUTION_FAILED"
  | "SUCCESS"
  | "NO_TRADE";

export interface KpiDecision {
  id: string;
  timestamp: string;
  action: "allow" | "block" | "abort";
  token: string;
  confidence: number;
  reasons: string[];
  /**
   * canonical = runtime cycle summary + decision envelope (primary).
   * derived = action log projection (legacy compatibility only).
   */
  provenanceKind: "canonical" | "derived";
  source: "runtime_cycle_summary" | "action_log_projection";
  /** Present when provenanceKind is canonical. */
  executionMode?: "dry" | "paper" | "live";
  decisionHash?: string;
  schemaVersion?: string;
  /** PR-C1: from decision.envelope.v3 only (not reconstructed). */
  reasonClass?: KpiDecisionReasonClass;
  sources?: string[];
  freshness?: {
    marketAgeMs: number;
    walletAgeMs: number;
    maxAgeMs: number;
    observedAt: string;
  };
  evidenceRef?: {
    marketRawHash?: string;
    walletRawHash?: string;
    signalPackHash?: string;
  };
  /** Original action log `action` field (e.g. evaluate, complete). */
  actionLogAction?: string;
  /** Original action log agent id when present. */
  actionLogAgentId?: string;
}

export interface KpiDecisionsResponse {
  decisions: KpiDecision[];
}

/**
 * Advisory LLM annotation — non-authoritative; optional when `ADVISORY_LLM_ENABLED=true`.
 * `summary` / `reasoning` are LLM commentary — not canonical reasonClass, blockReason, or execution rationale.
 */
export interface KpiAdvisoryLLMResponseBody {
  /** Short LLM commentary; not a canonical decision summary. */
  summary: string;
  /** Narrative explanation only; not canonical reasonClass / block reason / risk rationale. */
  reasoning: string;
  riskNotes?: string[];
  anomalies?: string[];
  /**
   * Model self-rating / advisory confidence only (0–1).
   * Not canonical decision confidence, signal confidence, or execution confidence.
   */
  confidence: number;
  provider: string;
  model: string;
}

export interface KpiAdvisoryAuditEntry {
  traceId: string;
  provider: string;
  model: string;
  latencyMs: number;
  success: boolean;
  cacheKey?: string;
  error?: string;
}

export interface KpiDecisionAdvisoryResponse {
  traceId: string;
  enabled: boolean;
  canonical: import("../../core/contracts/decision-envelope.js").DecisionEnvelope | null;
  advisory: KpiAdvisoryLLMResponseBody | null;
  /** Optional second provider output when `compare=true`; never merged into truth. */
  advisorySecondary?: KpiAdvisoryLLMResponseBody | null;
  audits: KpiAdvisoryAuditEntry[];
  message?: string;
}

export interface KpiAdapter {
  id: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  lastSuccessAt: string;
  consecutiveFailures: number;
}

export interface KpiAdaptersResponse {
  adapters: KpiAdapter[];
}

export interface KpiMetricsResponse {
  p95LatencyMs: Record<string, number>;
}
