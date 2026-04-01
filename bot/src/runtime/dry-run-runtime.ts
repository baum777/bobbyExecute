import { Engine, type EngineState } from "../core/engine.js";
import type { Clock } from "../core/clock.js";
import { SystemClock } from "../core/clock.js";
import type { Config } from "../config/config-schema.js";
import type { RuntimeConfigManager } from "./runtime-config-manager.js";
import type { ExecutionReport, RpcVerificationReport, TradeIntent } from "../core/contracts/trade.js";
import { runSignalEngine } from "../signals/signal-engine.js";
import type { MarketSnapshot } from "../core/contracts/market.js";
import type { WalletSnapshot } from "../core/contracts/wallet.js";
import { isKillSwitchHalted, triggerKillSwitch } from "../governance/kill-switch.js";
import { CircuitBreaker } from "../governance/circuit-breaker.js";
import { FileSystemJournalWriter, type JournalWriter } from "../journal-writer/writer.js";
import type { JournalEntry } from "../core/contracts/journal.js";
import type { DecisionCoordinator } from "../core/contracts/decision-envelope.js";
import {
  fetchMarketData,
  type AdapterOrchestratorConfig,
  type MarketAdapterFetch,
} from "../adapters/orchestrator/adapter-orchestrator.js";
import {
  FileSystemRuntimeCycleSummaryWriter,
  type RuntimeCycleAdapterHealthSnapshot,
  type RuntimeCycleDegradedState,
  type RuntimeCycleIntakeOutcome,
  type RuntimeCycleOutcome,
  type RuntimeCycleSummary,
  type RuntimeCycleSummaryWriter,
} from "../persistence/runtime-cycle-summary-repository.js";
import { FileSystemIncidentRepository, type IncidentRecord } from "../persistence/incident-repository.js";
import { RepositoryIncidentRecorder, type IncidentRecorder } from "../observability/incidents.js";
import {
  assertCanonicalPaperMarketAdapters,
  getPaperWalletProviderViolation,
} from "../adapters/provider-roles.js";
import type { ActionLogger } from "../observability/action-log.js";
import {
  armMicroLive,
  completeLiveTestRound,
  disarmMicroLive,
  getMicroLiveControlSnapshot,
  killMicroLive,
  preflightLiveTestRound,
  resetLiveTestRound,
  resetKilledMicroLive,
  startLiveTestRound,
  stopLiveTestRound,
} from "./live-control.js";
import { resetKillSwitch } from "../governance/kill-switch.js";

export type RuntimeStatus = "idle" | "running" | "paused" | "stopped" | "error";

export interface RuntimeCounters {
  cycleCount: number;
  decisionCount: number;
  executionCount: number;
  blockedCount: number;
  errorCount: number;
}

export interface RuntimeAdapterHealthSnapshot {
  total: number;
  healthy: number;
  unhealthy: number;
  degraded: boolean;
  adapterIds: string[];
  degradedAdapterIds: string[];
  unhealthyAdapterIds: string[];
}

export interface RuntimeRecentCycleSummary {
  traceId: string;
  cycleTimestamp: string;
  mode: "dry" | "paper" | "live";
  outcome: RuntimeCycleOutcome;
  stage: string;
  blocked: boolean;
  blockedReason?: string;
  intakeOutcome: RuntimeCycleIntakeOutcome;
  executionOccurred: boolean;
  verificationOccurred: boolean;
  decisionOccurred: boolean;
  errorOccurred: boolean;
  /** Canonical decision envelope when the cycle was produced by Engine (all modes). */
  decisionEnvelope?: import("../core/contracts/decision-envelope.js").DecisionEnvelope;
  decision?: {
    allowed: boolean;
    direction?: string;
    confidence?: number;
    riskAllowed?: boolean;
    chaosAllowed?: boolean;
    reason?: string;
    tradeIntentId?: string;
  };
}

export interface RuntimeRecentIncidentSummary {
  id: string;
  at: string;
  severity: IncidentRecord["severity"];
  type: IncidentRecord["type"];
  message: string;
  details?: IncidentRecord["details"];
}

export interface RuntimeReviewSummary {
  recentCycleCount: number;
  cycleOutcomes: Record<RuntimeCycleOutcome, number>;
  attemptsByMode: Record<"dry" | "paper" | "live", number>;
  refusalCounts: Record<string, number>;
  failureStageCounts: Record<string, number>;
  verificationHealth: {
    passed: number;
    failed: number;
    failureReasons: Record<string, number>;
  };
  incidentCounts: Record<string, number>;
  controlActions: RuntimeRecentIncidentSummary[];
  stateTransitions: Array<{
    at: string;
    type: IncidentRecord["type"];
    message: string;
    details?: IncidentRecord["details"];
  }>;
  recentCycles: RuntimeRecentCycleSummary[];
  recentIncidents: RuntimeRecentIncidentSummary[];
}

const RECENT_CYCLE_LIMIT = 10;
const RECENT_INCIDENT_LIMIT = 20;

export interface RuntimeDegradedState {
  active: boolean;
  consecutiveCycles: number;
  lastDegradedAt?: string;
  lastRecoveredAt?: string;
  lastReason?: string;
  recoveryCount: number;
}

export interface RuntimeSnapshot {
  status: RuntimeStatus;
  mode: "dry" | "paper" | "live";
  paperModeActive: boolean;
  cycleInFlight: boolean;
  liveControl?: import("./live-control.js").MicroLiveControlSnapshot;
  runtimeConfig?: import("../config/runtime-config-schema.js").RuntimeConfigStatus;
  counters: RuntimeCounters;
  lastCycleAt?: string;
  lastDecisionAt?: string;
  lastState: EngineState | null;
  lastCycleSummary?: RuntimeCycleSummary;
  degradedState?: RuntimeDegradedState;
  adapterHealth?: RuntimeAdapterHealthSnapshot;
  recentHistory?: RuntimeReviewSummary;
}

export interface RuntimeCycleReplay {
  traceId: string;
  summary: RuntimeCycleSummary;
  incidents: IncidentRecord[];
  journal: JournalEntry[];
}

export interface DryRunRuntimeDeps {
  engine?: Engine;
  actionLogger?: ActionLogger;
  clock?: Clock;
  decisionCoordinator?: DecisionCoordinator;
  runtimeConfigManager?: RuntimeConfigManager;
  loopIntervalMs?: number;
  logger?: Pick<Console, "info" | "error">;
  fetchMarketDataFn?: typeof fetchMarketData;
  paperMarketAdapters?: MarketAdapterFetch[];
  paperAdapterCircuitBreaker?: AdapterOrchestratorConfig["circuitBreaker"];
  maxPaperMarketStalenessMs?: number;
  fetchPaperWalletSnapshot?: () => Promise<WalletSnapshot>;
  cycleSummaryWriter?: RuntimeCycleSummaryWriter;
  incidentRecorder?: IncidentRecorder;
  journalWriter?: JournalWriter;
}

export interface RuntimeControlResult {
  success: boolean;
  status: RuntimeStatus;
  message: string;
}

/**
 * Phase-1 runtime loop: runs deterministic dry-run control cycles.
 * Fail-closed defaults: risk denies every cycle until full pipeline wiring lands.
 */
export class DryRunRuntime {
  private readonly engine: Engine;
  private readonly loopIntervalMs: number;
  private readonly logger: Pick<Console, "info" | "error">;
  private readonly clock: Clock;
  private readonly fetchMarketDataFn: typeof fetchMarketData;
  private readonly paperMarketAdapters: MarketAdapterFetch[];
  private readonly maxPaperMarketStalenessMs: number;
  private readonly paperAdapterCircuitBreaker: AdapterOrchestratorConfig["circuitBreaker"];
  private readonly fetchPaperWalletSnapshot: () => Promise<WalletSnapshot>;
  private readonly cycleSummaryWriter: RuntimeCycleSummaryWriter;
  private readonly incidentRecorder: IncidentRecorder;
  private readonly journalWriter: JournalWriter;
  private readonly runtimeConfigManager?: RuntimeConfigManager;
  private intervalRef: NodeJS.Timeout | null = null;
  private status: RuntimeStatus = "idle";
  private lastState: EngineState | null = null;
  private cycleInFlight = false;
  private readonly mode: "dry" | "paper" | "live";
  private counters: RuntimeCounters = {
    cycleCount: 0,
    decisionCount: 0,
    executionCount: 0,
    blockedCount: 0,
    errorCount: 0,
  };
  private lastCycleAt?: string;
  private lastDecisionAt?: string;
  private lastCycleSummary?: RuntimeCycleSummary;
  private readonly recentCycleSummaries: RuntimeCycleSummary[] = [];
  private readonly recentIncidents: IncidentRecord[] = [];
  private rolloutPostureRecorded = false;
  private consecutiveDegradedCycles = 0;
  private lastDegradedAt?: string;
  private lastDegradedReason?: string;
  private lastRecoveredAt?: string;
  private recoveryCount = 0;
  private recoveredThisCycle = false;

  constructor(
    private readonly config: Config,
    deps: DryRunRuntimeDeps = {}
  ) {
    this.journalWriter =
      deps.journalWriter ?? new FileSystemJournalWriter(config.journalPath, { autoStartPeriodicFlush: false });
    this.clock = deps.clock ?? new SystemClock();
    this.engine =
      deps.engine ??
      new Engine({
        clock: this.clock,
        dryRun: config.executionMode !== "live",
        executionMode: config.executionMode,
        actionLogger: deps.actionLogger,
        decisionCoordinator: deps.decisionCoordinator,
        journalWriter: this.journalWriter,
        journalPolicy: "mandatory",
      });
    this.loopIntervalMs = deps.loopIntervalMs ?? 15_000;
    this.logger = deps.logger ?? console;
    this.mode = config.executionMode;
    this.fetchMarketDataFn = deps.fetchMarketDataFn ?? fetchMarketData;
    this.paperMarketAdapters = deps.paperMarketAdapters ?? [];
    this.runtimeConfigManager = deps.runtimeConfigManager;
    if (this.mode === "paper") {
      assertCanonicalPaperMarketAdapters(this.paperMarketAdapters);
    }
    this.paperAdapterCircuitBreaker =
      deps.paperAdapterCircuitBreaker ?? new CircuitBreaker(this.paperMarketAdapters.map((adapter) => adapter.id));
    this.maxPaperMarketStalenessMs = deps.maxPaperMarketStalenessMs ?? 15_000;
    this.fetchPaperWalletSnapshot =
      deps.fetchPaperWalletSnapshot ??
      (async () => ({
        traceId: "paper-wallet-unavailable",
        timestamp: this.clock.now().toISOString(),
        source: "moralis",
        walletAddress: this.config.walletAddress ?? "paper-wallet",
        balances: [],
        totalUsd: 0,
      }));
    this.cycleSummaryWriter =
      deps.cycleSummaryWriter ??
      new FileSystemRuntimeCycleSummaryWriter(config.journalPath.replace(/\.jsonl$/i, "") + ".runtime-cycles.jsonl");
    this.incidentRecorder =
      deps.incidentRecorder ??
      new RepositoryIncidentRecorder(
        new FileSystemIncidentRepository(config.journalPath.replace(/\.jsonl$/i, "") + ".incidents.jsonl")
      );
  }

  async start(): Promise<void> {
    if (this.status === "running") return;
    this.status = "running";
    if (!this.rolloutPostureRecorded) {
      this.rolloutPostureRecorded = true;
      const control = getMicroLiveControlSnapshot();
      await this.recordIncident({
        severity: control.rolloutConfigValid ? "info" : "warning",
        type: "rollout_posture_transition",
        message: "Rollout posture evaluated at runtime start",
        details: {
          rolloutPosture: control.rolloutPosture,
          rolloutConfigured: control.rolloutConfigured,
          rolloutConfigValid: control.rolloutConfigValid,
          livePosture: control.posture,
          reasonCode: control.rolloutReasonCode ?? control.reasonCode,
          reasonDetail: control.rolloutReasonDetail ?? control.reasonDetail,
        },
      });
    }
    if (this.mode === "live" && this.config.liveTestMode) {
      const startResult = preflightLiveTestRound("runtime_start");
      if (!startResult.success) {
        this.status = "error";
        throw new Error(startResult.message);
      }
      const liveStart = startLiveTestRound("runtime_start");
      if (!liveStart.success) {
        this.status = "error";
        throw new Error(liveStart.message);
      }
      return;
    }
    await this.runCycle({ propagateError: true });
    this.intervalRef = setInterval(() => {
      void this.runCycle();
    }, this.loopIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
    if (this.mode === "live" && this.config.liveTestMode) {
      completeLiveTestRound("runtime_stop", "runtime_stop");
    }
    this.status = "stopped";
  }

  async emergencyStop(reason = "operator_emergency_stop"): Promise<RuntimeControlResult> {
    this.status = "paused";
    const control = this.mode === "live" && this.config.liveTestMode ? stopLiveTestRound(reason, "api_emergency_stop") : killMicroLive(reason);
    if (!control.success) {
      return {
        success: false,
        status: this.status,
        message: control.message,
      };
    }
    if (this.runtimeConfigManager) {
      const mutation = await this.runtimeConfigManager.setKillSwitch({
        action: "trigger",
        actor: "runtime",
        reason,
      });
      if (!mutation.accepted) {
        return {
          success: false,
          status: this.status,
          message: mutation.rejectionReason ?? mutation.message,
        };
      }
    } else if (this.mode === "live" && this.config.liveTestMode) {
      void triggerKillSwitch(reason);
    }
    await this.recordIncident({
      severity: "critical",
      type: "emergency_stop",
      message: "Emergency stop activated",
      details: { reason, liveControlPosture: control.snapshot.posture, liveControlReason: control.snapshot.reasonCode },
    });
    await this.recordIncident({
      severity: "critical",
      type: "live_control_killed",
      message: control.message,
      details: {
        reason,
        liveControlPosture: control.snapshot.posture,
        liveControlReason: control.snapshot.reasonCode,
      },
    });
    return {
      success: true,
      status: this.status,
      message: "Emergency stop activated; runtime paused.",
    };
  }

  async pause(reason = "operator_pause"): Promise<RuntimeControlResult> {
    if (this.status === "stopped" || this.status === "error") {
      return {
        success: false,
        status: this.status,
        message: `Pause unsupported while runtime status=${this.status}`,
      };
    }
    if (this.status === "paused") {
      return { success: true, status: this.status, message: "Runtime already paused." };
    }
    this.status = "paused";
    await this.recordIncident({
      severity: "warning",
      type: "runtime_paused",
      message: "Runtime paused by control plane",
      details: { reason },
    });
    return { success: true, status: this.status, message: "Runtime paused." };
  }

  async resume(reason = "operator_resume"): Promise<RuntimeControlResult> {
    if (isKillSwitchHalted()) {
      return {
        success: false,
        status: this.status,
        message: "Resume blocked: kill switch is active.",
      };
    }
    if (this.status !== "paused") {
      return {
        success: false,
        status: this.status,
        message: `Resume unsupported while runtime status=${this.status}`,
      };
    }
    if (this.mode === "live" && this.config.liveTestMode) {
      const liveStart = startLiveTestRound("api_resume");
      if (!liveStart.success) {
        return {
          success: false,
          status: this.status,
          message: liveStart.message,
        };
      }
    }
    this.status = "running";
    if (!this.intervalRef) {
      this.intervalRef = setInterval(() => {
        void this.runCycle();
      }, this.loopIntervalMs);
    }
    await this.recordIncident({
      severity: "info",
      type: "runtime_resumed",
      message: "Runtime resumed by control plane",
      details: { reason },
    });
    await this.runCycle();
    return { success: true, status: this.status, message: "Runtime resumed." };
  }

  async halt(reason = "operator_halt"): Promise<RuntimeControlResult> {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
    if (this.mode === "live" && this.config.liveTestMode) {
      completeLiveTestRound(reason, "api_halt");
    }
    this.status = "stopped";
    await this.recordIncident({
      severity: "critical",
      type: "runtime_halted",
      message: "Runtime halted by control plane",
      details: { reason },
    });
    return { success: true, status: this.status, message: "Runtime halted." };
  }

  getStatus(): RuntimeStatus {
    return this.status;
  }

  getLastState(): EngineState | null {
    return this.lastState;
  }

  getSnapshot(): RuntimeSnapshot {
    const adapterHealth = this.getAdapterHealthSnapshot();
    return {
      status: this.status,
      mode: this.mode,
      paperModeActive: this.mode === "paper",
      cycleInFlight: this.cycleInFlight,
      liveControl: getMicroLiveControlSnapshot(),
      runtimeConfig: this.runtimeConfigManager?.getRuntimeConfigStatus(),
      counters: { ...this.counters },
      lastCycleAt: this.lastCycleAt,
      lastDecisionAt: this.lastDecisionAt,
      lastState: this.lastState,
      lastCycleSummary: this.lastCycleSummary,
      degradedState: this.getDegradedStateSnapshot(),
      adapterHealth,
      recentHistory: this.getReviewSummary(),
    };
  }

  async listRecentCycleSummaries(limit = 50): Promise<RuntimeCycleSummary[]> {
    return this.cycleSummaryWriter.list(limit);
  }

  async armLive(reason = "operator_arm"): Promise<RuntimeControlResult> {
    const control = armMicroLive(reason);
    await this.recordIncident({
      severity: control.success ? "info" : "warning",
      type: "live_control_armed",
      message: control.message,
      details: {
        reason,
        success: control.success,
        liveControlPosture: control.snapshot.posture,
        liveControlReason: control.snapshot.reasonCode,
      },
    });
    return {
      success: control.success,
      status: this.status,
      message: control.message,
    };
  }

  async disarmLive(reason = "operator_disarm"): Promise<RuntimeControlResult> {
    const control = disarmMicroLive(reason);
    await this.recordIncident({
      severity: "warning",
      type: "live_control_disarmed",
      message: control.message,
      details: {
        reason,
        liveControlPosture: control.snapshot.posture,
        liveControlReason: control.snapshot.reasonCode,
      },
    });
    return {
      success: true,
      status: this.status,
      message: control.message,
    };
  }

  async resetLiveKill(reason = "operator_reset_kill"): Promise<RuntimeControlResult> {
    const control = this.mode === "live" && this.config.liveTestMode ? resetLiveTestRound(reason) : resetKilledMicroLive(reason);
    if (this.mode === "live" && this.config.liveTestMode) {
      this.status = "paused";
    }
    if (this.runtimeConfigManager) {
      const mutation = await this.runtimeConfigManager.setKillSwitch({
        action: "reset",
        actor: "runtime",
        reason,
      });
      if (!mutation.accepted) {
        return {
          success: false,
          status: this.status,
          message: mutation.rejectionReason ?? mutation.message,
        };
      }
    } else {
      resetKillSwitch();
    }
    await this.recordIncident({
      severity: "info",
      type: "live_control_disarmed",
      message: control.message,
      details: {
        reason,
        liveControlPosture: control.snapshot.posture,
        liveControlReason: control.snapshot.reasonCode,
      },
    });
    return {
      success: control.success,
      status: this.status,
      message: control.message,
    };
  }

  async listRecentIncidents(limit = 50): Promise<IncidentRecord[]> {
    return this.incidentRecorder.list(limit);
  }

  private getReviewSummary(): RuntimeReviewSummary {
    const recentCycles = this.recentCycleSummaries.slice(-RECENT_CYCLE_LIMIT);
    const recentIncidents = this.recentIncidents.slice(-RECENT_INCIDENT_LIMIT);
    const cycleOutcomes: Record<RuntimeCycleOutcome, number> = {
      success: 0,
      blocked: 0,
      error: 0,
    };
    const attemptsByMode: Record<"dry" | "paper" | "live", number> = {
      dry: 0,
      paper: 0,
      live: 0,
    };
    const refusalCounts: Record<string, number> = {};
    const failureStageCounts: Record<string, number> = {};
    const verificationHealth = {
      passed: 0,
      failed: 0,
      failureReasons: {} as Record<string, number>,
    };

    for (const summary of recentCycles) {
      cycleOutcomes[summary.outcome] += 1;
      attemptsByMode[summary.mode] += 1;
      if (summary.blocked && summary.blockedReason) {
        refusalCounts[summary.blockedReason] = (refusalCounts[summary.blockedReason] ?? 0) + 1;
      }
      if (summary.errorOccurred) {
        failureStageCounts[summary.stage] = (failureStageCounts[summary.stage] ?? 0) + 1;
      }
      if (summary.verificationOccurred) {
        if (summary.verification?.passed === true) {
          verificationHealth.passed += 1;
        } else {
          verificationHealth.failed += 1;
          const reason = summary.verification?.reason ?? "unknown";
          verificationHealth.failureReasons[reason] = (verificationHealth.failureReasons[reason] ?? 0) + 1;
        }
      }
      if (summary.execution?.success === false) {
        const code = summary.execution.error ?? summary.execution.mode ?? "execution_failed";
        failureStageCounts[summary.execution.mode ?? summary.stage] =
          (failureStageCounts[summary.execution.mode ?? summary.stage] ?? 0) + 1;
        refusalCounts[code] = (refusalCounts[code] ?? 0) + 1;
      }
    }

    const incidentCounts: Record<string, number> = {};
    for (const incident of recentIncidents) {
      incidentCounts[incident.type] = (incidentCounts[incident.type] ?? 0) + 1;
      if (
        incident.type === "live_guardrail_refused" ||
        incident.type === "live_execution_refused"
      ) {
        const reason =
          incident.details?.reasonCode?.toString() ??
          incident.details?.blockedReason?.toString() ??
          incident.details?.reason?.toString() ??
          incident.message;
        refusalCounts[reason] = (refusalCounts[reason] ?? 0) + 1;
      }
      if (incident.type === "rollout_posture_transition") {
        failureStageCounts["rollout"] = (failureStageCounts["rollout"] ?? 0) + 1;
      }
    }

    const controlActions = recentIncidents.filter((incident) =>
      incident.type === "live_control_armed" ||
      incident.type === "live_control_disarmed" ||
      incident.type === "live_control_killed" ||
      incident.type === "live_control_blocked" ||
      incident.type === "runtime_paused" ||
      incident.type === "runtime_resumed" ||
      incident.type === "runtime_halted" ||
      incident.type === "emergency_stop"
    );

    const stateTransitions = recentIncidents.filter((incident) =>
      incident.type === "runtime_paused" ||
      incident.type === "runtime_resumed" ||
      incident.type === "runtime_halted" ||
      incident.type === "emergency_stop" ||
      incident.type === "rollout_posture_transition" ||
      incident.type === "live_control_armed" ||
      incident.type === "live_control_disarmed" ||
      incident.type === "live_control_killed" ||
      incident.type === "live_control_blocked"
    ).map((incident) => ({
      at: incident.at,
      type: incident.type,
      message: incident.message,
      details: incident.details,
    }));

    return {
      recentCycleCount: recentCycles.length,
      cycleOutcomes,
      attemptsByMode,
      refusalCounts,
      failureStageCounts,
      verificationHealth,
      incidentCounts,
      controlActions: controlActions.map((incident) => ({
        id: incident.id,
        at: incident.at,
        severity: incident.severity,
        type: incident.type,
        message: incident.message,
        details: incident.details,
      })),
      stateTransitions,
      recentCycles: recentCycles.map((summary) => ({
        traceId: summary.traceId,
        cycleTimestamp: summary.cycleTimestamp,
        mode: summary.mode,
        outcome: summary.outcome,
        stage: summary.stage,
        blocked: summary.blocked,
        blockedReason: summary.blockedReason,
        intakeOutcome: summary.intakeOutcome,
        executionOccurred: summary.executionOccurred,
        verificationOccurred: summary.verificationOccurred,
        decisionOccurred: summary.decisionOccurred,
        errorOccurred: summary.errorOccurred,
        decisionEnvelope: summary.decisionEnvelope,
        decision: summary.decision,
      })),
      recentIncidents: recentIncidents.map((incident) => ({
        id: incident.id,
        at: incident.at,
        severity: incident.severity,
        type: incident.type,
        message: incident.message,
        details: incident.details,
      })),
    };
  }

  async getCycleReplay(traceId: string): Promise<RuntimeCycleReplay | null> {
    const summary = await this.cycleSummaryWriter.getByTraceId(traceId);
    if (!summary) {
      return null;
    }

    const [incidents, journal] = await Promise.all([
      this.incidentRecorder.listByTraceId(traceId),
      this.journalWriter.getByTraceId(traceId),
    ]);

    return {
      traceId,
      summary,
      incidents,
      journal,
    };
  }


  private getAdapterHealthSnapshot(): RuntimeAdapterHealthSnapshot | undefined {
    if (this.mode !== "paper" || this.paperMarketAdapters.length === 0) {
      return undefined;
    }

    const health = this.paperAdapterCircuitBreaker.getHealth();
    const degradedAdapterIds = health
      .filter((entry) => !entry.healthy || entry.consecutiveFailures > 0)
      .map((entry) => entry.adapterId);
    const unhealthyAdapterIds = health.filter((entry) => !entry.healthy).map((entry) => entry.adapterId);

    return {
      total: health.length,
      healthy: health.filter((entry) => entry.healthy).length,
      unhealthy: unhealthyAdapterIds.length,
      degraded: degradedAdapterIds.length > 0,
      adapterIds: health.map((entry) => entry.adapterId),
      degradedAdapterIds,
      unhealthyAdapterIds,
    };
  }

  private getDegradedStateSnapshot(): RuntimeDegradedState | undefined {
    if (this.mode !== "paper") {
      return undefined;
    }

    return {
      active: this.consecutiveDegradedCycles > 0,
      consecutiveCycles: this.consecutiveDegradedCycles,
      lastDegradedAt: this.lastDegradedAt,
      lastRecoveredAt: this.lastRecoveredAt,
      lastReason: this.lastDegradedReason,
      recoveryCount: this.recoveryCount,
    };
  }

  private markAdapterDegraded(reason: string, at: string): void {
    this.consecutiveDegradedCycles += 1;
    this.lastDegradedAt = at;
    this.lastDegradedReason = reason;
  }

  private clearAdapterDegradedState(at: string): void {
    if (this.consecutiveDegradedCycles > 0) {
      this.recoveryCount += 1;
      this.lastRecoveredAt = at;
      this.recoveredThisCycle = true;
    }
    this.consecutiveDegradedCycles = 0;
  }

  private getCycleDegradedStateSummary(): RuntimeCycleDegradedState | undefined {
    if (this.mode !== "paper") {
      return undefined;
    }

    return {
      active: this.consecutiveDegradedCycles > 0,
      consecutiveCycles: this.consecutiveDegradedCycles,
      lastDegradedAt: this.lastDegradedAt,
      lastRecoveredAt: this.lastRecoveredAt,
      lastReason: this.lastDegradedReason,
      recoveryCount: this.recoveryCount,
      recoveredThisCycle: this.recoveredThisCycle,
    };
  }

  private getCycleAdapterHealthSummary(): RuntimeCycleAdapterHealthSnapshot | undefined {
    const snapshot = this.getAdapterHealthSnapshot();
    if (!snapshot) {
      return undefined;
    }

    return {
      total: snapshot.total,
      healthy: snapshot.healthy,
      unhealthy: snapshot.unhealthy,
      degraded: snapshot.degraded,
      degradedAdapterIds: [...snapshot.degradedAdapterIds],
      unhealthyAdapterIds: [...snapshot.unhealthyAdapterIds],
    };
  }

  private async runCycle(options: { propagateError?: boolean } = {}): Promise<void> {
    if (this.cycleInFlight || this.status !== "running") {
      return;
    }

    this.cycleInFlight = true;
    let currentCycleIntakeOutcome: RuntimeCycleIntakeOutcome = "invalid";
    let currentCycleTimestamp = this.clock.now().toISOString();
    let currentCycleTraceId = `runtime-${currentCycleTimestamp}`;

    try {
      await this.runtimeConfigManager?.refresh();

      if (isKillSwitchHalted()) {
        const now = currentCycleTimestamp;
        const traceId = `runtime-${now}`;
        this.status = "paused";
        this.lastState = {
          stage: "risk",
          traceId,
          timestamp: now,
          blocked: true,
          blockedReason: "RUNTIME_PHASE2_KILL_SWITCH_HALTED",
        };
        this.lastCycleAt = now;
        this.counters.blockedCount += 1;
        const incident = await this.recordIncident({
          severity: "critical",
          type: "runtime_paused",
          message: "Runtime paused because kill switch is active",
          details: { reason: "kill_switch_halted", intakeOutcome: "kill_switch_halted", traceId },
        });
        await this.persistCycleSummary({
          cycleTimestamp: now,
          traceId,
          mode: this.mode,
          outcome: "blocked",
          intakeOutcome: "kill_switch_halted",
          advanced: false,
          stage: "risk",
          blocked: true,
          blockedReason: "RUNTIME_PHASE2_KILL_SWITCH_HALTED",
          decisionOccurred: false,
          signalOccurred: false,
          riskOccurred: false,
          chaosOccurred: false,
          executionOccurred: false,
          verificationOccurred: false,
          paperExecutionProduced: false,
          errorOccurred: false,
          degradedState: this.getCycleDegradedStateSummary(),
          adapterHealth: this.getCycleAdapterHealthSummary(),
          incidentIds: [incident.id],
        });
        return;
      }

      this.runtimeConfigManager?.beginCycle();
      const now = currentCycleTimestamp;
      this.recoveredThisCycle = false;
      this.counters.cycleCount += 1;
      this.lastCycleAt = now;

      const paperIntake = await this.preparePaperIntake(now);
      if (paperIntake?.kind === "blocked") {
        currentCycleIntakeOutcome = paperIntake.summary.intakeOutcome;
        currentCycleTraceId = paperIntake.summary.traceId;
        const incident = await this.recordIncident({
          severity: "warning",
          type: "paper_ingest_blocked",
          message: "Paper ingest blocked",
          details: {
            blockedReason: paperIntake.summary.blockedReason ?? "unknown",
            intakeOutcome: paperIntake.summary.intakeOutcome,
            traceId: paperIntake.summary.traceId,
          },
        });
        this.lastState = {
          stage: "ingest",
          traceId: paperIntake.summary.traceId,
          timestamp: now,
          blocked: true,
          blockedReason: paperIntake.summary.blockedReason,
        };
        this.counters.blockedCount += 1;
        await this.persistCycleSummary({
          ...paperIntake.summary,
          incidentIds: [incident.id],
        });
        return;
      }

      currentCycleIntakeOutcome = paperIntake?.kind === "ready" ? paperIntake.intakeOutcome : "ok";

      this.lastState = await this.engine.run(
        async () => {
          if (paperIntake?.kind === "ready") {
            return {
              market: paperIntake.market,
              wallet: paperIntake.wallet,
            };
          }
          return {
            market: {
              schema_version: "market.v1",
              traceId: `runtime-${now}`,
              timestamp: now,
              source: "dexpaprika",
              poolId: "phase1-dry-run-pool",
              baseToken: "SOL",
              quoteToken: "USD",
              priceUsd: 100,
              volume24h: 1_000_000,
              liquidity: 10_000_000,
              freshnessMs: 0,
              status: "ok",
            },
            wallet: {
              traceId: `runtime-${now}`,
              timestamp: now,
              source: "moralis",
              walletAddress: this.config.walletAddress ?? "dry-run-wallet",
              balances: [],
              totalUsd: 0,
            },
          };
        },
        async (market) => {
          if (this.mode === "paper") {
            const out = runSignalEngine({
              market,
              scoreCard: {
                traceId: market.traceId,
                timestamp: market.timestamp,
                mci: 0.7,
                bci: 0.5,
                hybrid: 0.8,
                crossSourceConfidenceScore: 0.95,
                ageAdjusted: true,
                doublePenaltyApplied: false,
                version: "1.0",
                decisionHash: "dry-runtime-paper",
              },
              patternResult: {
                traceId: market.traceId,
                timestamp: market.timestamp,
                patterns: [],
                flags: [],
                confidence: 0.5,
                evidence: [],
              },
              dataQuality: { completeness: 1 },
              traceId: market.traceId,
              timestamp: market.timestamp,
              dryRun: false,
              executionMode: "paper",
            });
            if (out.blocked) {
              return { blocked: true, blockedReason: out.reason };
            }
            return {
              direction: "buy",
              confidence: 0.8,
              intent: out.intent,
            };
          }
          return {
            direction: "hold",
            confidence: 0,
          };
        },
        async () => {
          if (this.mode === "paper") {
            return { allowed: true };
          }
          return {
            allowed: false,
            reason: "RUNTIME_PHASE1_FAIL_CLOSED_UNTIL_PIPELINE_WIRED",
          };
        },
        async (intent: TradeIntent): Promise<ExecutionReport> => {
          if (this.mode === "paper") {
            return {
              traceId: intent.traceId,
              timestamp: intent.timestamp,
              tradeIntentId: intent.idempotencyKey,
              success: true,
              dryRun: false,
              executionMode: "paper",
              paperExecution: true,
              actualAmountOut: intent.minAmountOut,
            };
          }
          return {
            traceId: intent.traceId,
            timestamp: intent.timestamp,
            tradeIntentId: intent.idempotencyKey,
            success: false,
            error:
              this.mode === "live"
                ? "Live execution unreachable in fail-closed pre-live hardening mode"
                : "Execution unreachable in phase-1 fail-closed mode",
            dryRun: this.mode === "dry",
            executionMode: this.mode,
            paperExecution: false,
          };
        },
        async (intent: TradeIntent): Promise<RpcVerificationReport> => {
          if (this.mode === "paper") {
            return {
              traceId: intent.traceId,
              timestamp: intent.timestamp,
              passed: true,
              checks: { quoteInputs: true },
              reason: "PAPER_MODE_SIMULATED_VERIFICATION",
              verificationMode: "paper-simulated",
            };
          }
          return {
            traceId: intent.traceId,
            timestamp: intent.timestamp,
            passed: false,
            checks: {},
            reason:
              this.mode === "live"
                ? "Live RPC verification unreachable in fail-closed pre-live hardening mode"
                : "Verification unreachable in phase-1 fail-closed mode",
            verificationMode: "rpc",
          };
        }
      );

      currentCycleTraceId = this.lastState.traceId;
      this.lastDecisionAt = now;
      this.counters.decisionCount += 1;
      if (this.lastState.executionReport) this.counters.executionCount += 1;
      if (this.lastState.blocked) this.counters.blockedCount += 1;
      await this.persistCycleSummary(this.toCycleSummary(this.lastState, currentCycleIntakeOutcome));
    } catch (error) {
      this.status = "error";
      this.counters.errorCount += 1;
      this.logger.error("Dry-run runtime cycle failed", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const sameCycleState =
        this.lastState?.timestamp === (this.lastCycleAt ?? currentCycleTimestamp) ? this.lastState : undefined;
      const traceId = currentCycleTraceId;
      currentCycleTraceId = traceId;
      this.lastState = {
        stage: sameCycleState?.stage ?? "ingest",
        traceId,
        timestamp: this.lastCycleAt ?? currentCycleTimestamp,
        blocked: true,
        blockedReason: "RUNTIME_CYCLE_ERROR",
        error: errorMessage,
        tradeIntent: sameCycleState?.tradeIntent,
        executionReport: sameCycleState?.executionReport,
        rpcVerification: sameCycleState?.rpcVerification,
      };
      const incidentIds: string[] = [];
      const journalFailure = this.extractJournalFailureDetails(errorMessage, traceId);
      if (journalFailure) {
        const incident = await this.recordIncident({
          severity: "critical",
          type: "journal_failure",
          message: "Mandatory journal persistence failed",
          details: {
            error: errorMessage,
            intakeOutcome: currentCycleIntakeOutcome,
            traceId,
            ...(journalFailure.stage ? { stage: journalFailure.stage } : {}),
          },
        });
        incidentIds.push(incident.id);
      }
      const runtimeCycleErrorIncident = await this.recordIncident({
        severity: "critical",
        type: "runtime_cycle_error",
        message: "Runtime cycle failed",
        details: {
          error: errorMessage,
          intakeOutcome: currentCycleIntakeOutcome,
          traceId,
        },
      });
      incidentIds.push(runtimeCycleErrorIncident.id);
      await this.persistCycleSummary({
        cycleTimestamp: this.lastCycleAt ?? currentCycleTimestamp,
        traceId,
        mode: this.mode,
        outcome: "error",
        intakeOutcome: currentCycleIntakeOutcome,
        advanced: false,
        stage: this.lastState.stage,
        blocked: true,
        blockedReason: "RUNTIME_CYCLE_ERROR",
        decisionOccurred: false,
        signalOccurred: false,
        riskOccurred: false,
        chaosOccurred: false,
        executionOccurred: false,
        verificationOccurred: false,
        paperExecutionProduced: false,
        errorOccurred: true,
        error: errorMessage,
        tradeIntentId: this.lastState.tradeIntent?.idempotencyKey,
        execution: this.lastState.executionReport
          ? {
              success: this.lastState.executionReport.success,
              mode: this.lastState.executionReport.executionMode,
              paperExecution: this.lastState.executionReport.paperExecution,
              actualAmountOut: this.lastState.executionReport.actualAmountOut,
              error: this.lastState.executionReport.error,
            }
          : undefined,
        verification: this.lastState.rpcVerification
          ? {
              passed: this.lastState.rpcVerification.passed,
              mode: this.lastState.rpcVerification.verificationMode,
              reason: this.lastState.rpcVerification.reason,
            }
          : undefined,
        degradedState: this.getCycleDegradedStateSummary(),
        adapterHealth: this.getCycleAdapterHealthSummary(),
        incidentIds,
      });
      if (this.intervalRef) {
        clearInterval(this.intervalRef);
        this.intervalRef = null;
      }
      if (options.propagateError) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    } finally {
      await this.runtimeConfigManager?.endCycle();
      this.cycleInFlight = false;
    }
  }

  private async preparePaperIntake(
    now: string
  ): Promise<
    | {
        kind: "ready";
        market: MarketSnapshot;
        wallet: WalletSnapshot;
        intakeOutcome: RuntimeCycleIntakeOutcome;
      }
    | {
        kind: "blocked";
        summary: RuntimeCycleSummary;
      }
    | null
  > {
    if (this.mode !== "paper") {
      return null;
    }

    const traceId = `runtime-${now}`;

    const marketResult = await this.fetchMarketDataFn({
      adapters: this.paperMarketAdapters,
      circuitBreaker: this.paperAdapterCircuitBreaker,
      maxStalenessMs: this.maxPaperMarketStalenessMs,
    });

    if ("error" in marketResult) {
      const intakeOutcome: RuntimeCycleIntakeOutcome = marketResult.error.includes("stale")
        ? "stale"
        : "adapter_error";
      this.markAdapterDegraded(marketResult.error, now);
      return {
        kind: "blocked",
        summary: {
          cycleTimestamp: now,
          traceId,
          mode: this.mode,
          outcome: "blocked",
          intakeOutcome,
          advanced: false,
          stage: "ingest",
          blocked: true,
          blockedReason: `PAPER_INGEST_BLOCKED:${marketResult.error}`,
          decisionOccurred: false,
          signalOccurred: false,
          riskOccurred: false,
          chaosOccurred: false,
          executionOccurred: false,
          verificationOccurred: false,
          paperExecutionProduced: false,
          errorOccurred: false,
          degradedState: this.getCycleDegradedStateSummary(),
          adapterHealth: this.getCycleAdapterHealthSummary(),
          incidentIds: [],
        },
      };
    }

    this.clearAdapterDegradedState(now);

    const wallet = await this.fetchPaperWalletSnapshot();
    const walletProviderViolation = getPaperWalletProviderViolation(wallet);
    if (walletProviderViolation) {
      return {
        kind: "blocked",
        summary: {
          cycleTimestamp: now,
          traceId,
          mode: this.mode,
          outcome: "blocked",
          intakeOutcome: "invalid",
          advanced: false,
          stage: "ingest",
          blocked: true,
          blockedReason: `PAPER_INGEST_BLOCKED:${walletProviderViolation}`,
          decisionOccurred: false,
          signalOccurred: false,
          riskOccurred: false,
          chaosOccurred: false,
          executionOccurred: false,
          verificationOccurred: false,
          paperExecutionProduced: false,
          errorOccurred: false,
          degradedState: this.getCycleDegradedStateSummary(),
          adapterHealth: this.getCycleAdapterHealthSummary(),
          incidentIds: [],
        },
      };
    }

    if (!wallet.walletAddress) {
      return {
        kind: "blocked",
        summary: {
          cycleTimestamp: now,
          traceId,
          mode: this.mode,
          outcome: "blocked",
          intakeOutcome: "invalid",
          advanced: false,
          stage: "ingest",
          blocked: true,
          blockedReason: "PAPER_INGEST_BLOCKED:invalid_wallet_snapshot",
          decisionOccurred: false,
          signalOccurred: false,
          riskOccurred: false,
          chaosOccurred: false,
          executionOccurred: false,
          verificationOccurred: false,
          paperExecutionProduced: false,
          errorOccurred: false,
          degradedState: this.getCycleDegradedStateSummary(),
          adapterHealth: this.getCycleAdapterHealthSummary(),
          incidentIds: [],
        },
      };
    }

    return {
      kind: "ready",
      market: marketResult,
      wallet,
      intakeOutcome: "ok",
    };
  }

  private toCycleSummary(state: EngineState, intakeOutcome: RuntimeCycleIntakeOutcome): RuntimeCycleSummary {
    return {
      cycleTimestamp: this.lastCycleAt ?? state.timestamp,
      traceId: state.traceId,
      mode: this.mode,
      outcome: this.toCycleOutcome(state),
      intakeOutcome,
      advanced: state.stage !== "ingest",
      stage: state.stage,
      blocked: state.blocked === true,
      blockedReason: state.blockedReason,
      decisionEnvelope: state.decisionEnvelope,
      decision: state.tradeIntent
        ? {
            allowed: state.blocked !== true,
            direction: state.signal?.direction,
            confidence: state.signal?.confidence,
            riskAllowed: state.riskAllowed,
            chaosAllowed: state.chaosAllowed,
            reason: state.blockedReason ?? state.error,
            tradeIntentId: state.tradeIntent.idempotencyKey,
          }
        : undefined,
      decisionOccurred: state.tradeIntent !== undefined,
      signalOccurred: state.signal !== undefined,
      riskOccurred: state.riskAllowed !== undefined,
      chaosOccurred: state.chaosAllowed !== undefined,
      executionOccurred: state.executionReport !== undefined,
      verificationOccurred: state.rpcVerification !== undefined,
      paperExecutionProduced: state.executionReport?.paperExecution === true,
      verificationMode: state.rpcVerification?.verificationMode,
      errorOccurred: state.error !== undefined,
      error: state.error,
      tradeIntentId: state.tradeIntent?.idempotencyKey,
      execution: state.executionReport
        ? {
            success: state.executionReport.success,
            mode: state.executionReport.executionMode,
            paperExecution: state.executionReport.paperExecution,
            actualAmountOut: state.executionReport.actualAmountOut,
            error: state.executionReport.error,
          }
        : undefined,
      verification: state.rpcVerification
        ? {
            passed: state.rpcVerification.passed,
            mode: state.rpcVerification.verificationMode,
            reason: state.rpcVerification.reason,
          }
        : undefined,
      degradedState: this.getCycleDegradedStateSummary(),
      adapterHealth: this.getCycleAdapterHealthSummary(),
      incidentIds: [],
    };
  }

  private async persistCycleSummary(summary: RuntimeCycleSummary): Promise<void> {
    await this.cycleSummaryWriter.append(summary);
    this.lastCycleSummary = summary;
    this.recentCycleSummaries.push({ ...summary, incidentIds: [...summary.incidentIds] });
    while (this.recentCycleSummaries.length > RECENT_CYCLE_LIMIT) {
      this.recentCycleSummaries.shift();
    }
  }

  private async recordIncident(input: {
    severity: IncidentRecord["severity"];
    type: IncidentRecord["type"];
    message: string;
    details?: IncidentRecord["details"];
  }): Promise<IncidentRecord> {
    const record = await this.incidentRecorder.record(input);
    this.recentIncidents.push({ ...record, details: record.details ? { ...record.details } : undefined });
    while (this.recentIncidents.length > RECENT_INCIDENT_LIMIT) {
      this.recentIncidents.shift();
    }
    return record;
  }

  private toCycleOutcome(state: EngineState): RuntimeCycleOutcome {
    if (state.error !== undefined) {
      return "error";
    }
    if (state.blocked === true) {
      return "blocked";
    }
    return "success";
  }

  private extractJournalFailureDetails(
    errorMessage: string,
    traceId: string
  ): { stage?: string; traceId: string } | null {
    const missingWriterMatch = errorMessage.match(/^MANDATORY_JOURNAL_WRITER_MISSING:(.+)$/);
    if (missingWriterMatch) {
      return { stage: missingWriterMatch[1], traceId };
    }

    const forcedFailureMatch = errorMessage.match(/^forced journal failure at (.+)$/i);
    if (forcedFailureMatch) {
      return { stage: forcedFailureMatch[1], traceId };
    }

    return this.lastState?.stage === "journal" ? { stage: "journal", traceId } : null;
  }
}

export function createDryRunRuntime(config: Config, deps?: DryRunRuntimeDeps): DryRunRuntime {
  return new DryRunRuntime(config, deps);
}
