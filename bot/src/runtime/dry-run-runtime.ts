import { Engine, type EngineState } from "../core/engine.js";
import type { Config } from "../config/config-schema.js";
import type { ExecutionReport, RpcVerificationReport, TradeIntent } from "../core/contracts/trade.js";
import type { MarketSnapshot } from "../core/contracts/market.js";
import type { WalletSnapshot } from "../core/contracts/wallet.js";
import { isKillSwitchHalted } from "../governance/kill-switch.js";
import { CircuitBreaker } from "../governance/circuit-breaker.js";
import { FileSystemJournalWriter, type JournalWriter } from "../journal-writer/writer.js";
import type { JournalEntry } from "../core/contracts/journal.js";
import {
  fetchMarketData,
  type AdapterOrchestratorConfig,
  type MarketAdapterFetch,
} from "../adapters/orchestrator/adapter-orchestrator.js";
import {
  FileSystemRuntimeCycleSummaryWriter,
  type RuntimeCycleIntakeOutcome,
  type RuntimeCycleOutcome,
  type RuntimeCycleSummary,
  type RuntimeCycleSummaryWriter,
} from "../persistence/runtime-cycle-summary-repository.js";
import { FileSystemIncidentRepository, type IncidentRecord } from "../persistence/incident-repository.js";
import { RepositoryIncidentRecorder, type IncidentRecorder } from "../observability/incidents.js";

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
  unhealthyAdapterIds: string[];
}

export interface RuntimeDegradedState {
  active: boolean;
  consecutiveCycles: number;
  lastDegradedAt?: string;
  lastReason?: string;
}

export interface RuntimeSnapshot {
  status: RuntimeStatus;
  mode: "dry" | "paper" | "live";
  paperModeActive: boolean;
  cycleInFlight: boolean;
  counters: RuntimeCounters;
  lastCycleAt?: string;
  lastDecisionAt?: string;
  lastState: EngineState | null;
  lastCycleSummary?: RuntimeCycleSummary;
  degradedState?: RuntimeDegradedState;
  adapterHealth?: RuntimeAdapterHealthSnapshot;
}

export interface RuntimeCycleReplay {
  traceId: string;
  summary: RuntimeCycleSummary;
  incidents: IncidentRecord[];
  journal: JournalEntry[];
}

export interface DryRunRuntimeDeps {
  engine?: Engine;
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
  private readonly fetchMarketDataFn: typeof fetchMarketData;
  private readonly paperMarketAdapters: MarketAdapterFetch[];
  private readonly maxPaperMarketStalenessMs: number;
  private readonly paperAdapterCircuitBreaker: AdapterOrchestratorConfig["circuitBreaker"];
  private readonly fetchPaperWalletSnapshot: () => Promise<WalletSnapshot>;
  private readonly cycleSummaryWriter: RuntimeCycleSummaryWriter;
  private readonly incidentRecorder: IncidentRecorder;
  private readonly journalWriter: JournalWriter;
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
  private consecutiveDegradedCycles = 0;
  private lastDegradedAt?: string;
  private lastDegradedReason?: string;

  constructor(
    private readonly config: Config,
    deps: DryRunRuntimeDeps = {}
  ) {
    this.journalWriter = deps.journalWriter ?? new FileSystemJournalWriter(config.journalPath);
    this.engine =
      deps.engine ??
      new Engine({
        dryRun: config.executionMode !== "live",
        journalWriter: this.journalWriter,
        journalPolicy: "mandatory",
      });
    this.loopIntervalMs = deps.loopIntervalMs ?? 15_000;
    this.logger = deps.logger ?? console;
    this.mode = config.executionMode;
    this.fetchMarketDataFn = deps.fetchMarketDataFn ?? fetchMarketData;
    this.paperMarketAdapters = deps.paperMarketAdapters ?? [];
    this.paperAdapterCircuitBreaker =
      deps.paperAdapterCircuitBreaker ?? new CircuitBreaker(this.paperMarketAdapters.map((adapter) => adapter.id));
    this.maxPaperMarketStalenessMs = deps.maxPaperMarketStalenessMs ?? 15_000;
    this.fetchPaperWalletSnapshot =
      deps.fetchPaperWalletSnapshot ??
      (async () => ({
        traceId: "paper-wallet-unavailable",
        timestamp: new Date().toISOString(),
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
    this.status = "stopped";
  }

  async emergencyStop(reason = "operator_emergency_stop"): Promise<RuntimeControlResult> {
    this.status = "paused";
    await this.recordIncident({
      severity: "critical",
      type: "emergency_stop",
      message: "Emergency stop activated",
      details: { reason },
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
      counters: { ...this.counters },
      lastCycleAt: this.lastCycleAt,
      lastDecisionAt: this.lastDecisionAt,
      lastState: this.lastState,
      lastCycleSummary: this.lastCycleSummary,
      degradedState:
        this.mode === "paper"
          ? {
              active: this.consecutiveDegradedCycles > 0,
              consecutiveCycles: this.consecutiveDegradedCycles,
              lastDegradedAt: this.lastDegradedAt,
              lastReason: this.lastDegradedReason,
            }
          : undefined,
      adapterHealth,
    };
  }

  async listRecentCycleSummaries(limit = 50): Promise<RuntimeCycleSummary[]> {
    return this.cycleSummaryWriter.list(limit);
  }

  async listRecentIncidents(limit = 50): Promise<IncidentRecord[]> {
    return this.incidentRecorder.list(limit);
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
    const unhealthyAdapterIds = health.filter((entry) => !entry.healthy).map((entry) => entry.adapterId);

    return {
      total: health.length,
      healthy: health.filter((entry) => entry.healthy).length,
      unhealthy: unhealthyAdapterIds.length,
      degraded: unhealthyAdapterIds.length > 0,
      adapterIds: health.map((entry) => entry.adapterId),
      unhealthyAdapterIds,
    };
  }

  private markAdapterDegraded(reason: string, at: string): void {
    this.consecutiveDegradedCycles += 1;
    this.lastDegradedAt = at;
    this.lastDegradedReason = reason;
  }

  private clearAdapterDegradedState(): void {
    this.consecutiveDegradedCycles = 0;
    this.lastDegradedAt = undefined;
    this.lastDegradedReason = undefined;
  }

  private async runCycle(options: { propagateError?: boolean } = {}): Promise<void> {
    if (this.cycleInFlight || this.status !== "running") {
      return;
    }

    let currentCycleIntakeOutcome: RuntimeCycleIntakeOutcome = "invalid";
    let currentCycleTimestamp = new Date().toISOString();
    let currentCycleTraceId = `runtime-${currentCycleTimestamp}`;

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
        incidentIds: [incident.id],
      });
      return;
    }

    this.cycleInFlight = true;
    try {
      const now = currentCycleTimestamp;
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
        async () => ({
          direction: this.mode === "paper" ? "buy" : "hold",
          confidence: this.mode === "paper" ? 0.8 : 0,
        }),
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
            error: "Execution unreachable in phase-1 fail-closed mode",
            dryRun: true,
            executionMode: "dry",
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
            reason: "Verification unreachable in phase-1 fail-closed mode",
            verificationMode: "paper-simulated",
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
      const traceId = this.lastState?.traceId ?? currentCycleTraceId;
      currentCycleTraceId = traceId;
      this.lastState = {
        stage: this.lastState?.stage ?? "ingest",
        traceId,
        timestamp: this.lastCycleAt ?? currentCycleTimestamp,
        blocked: true,
        blockedReason: "RUNTIME_CYCLE_ERROR",
        error: errorMessage,
        tradeIntent: this.lastState?.tradeIntent,
        executionReport: this.lastState?.executionReport,
        rpcVerification: this.lastState?.rpcVerification,
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
          incidentIds: [],
        },
      };
    }

    this.clearAdapterDegradedState();

    const wallet = await this.fetchPaperWalletSnapshot();
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
      incidentIds: [],
    };
  }

  private async persistCycleSummary(summary: RuntimeCycleSummary): Promise<void> {
    await this.cycleSummaryWriter.append(summary);
    this.lastCycleSummary = summary;
  }

  private async recordIncident(input: {
    severity: IncidentRecord["severity"];
    type: IncidentRecord["type"];
    message: string;
    details?: IncidentRecord["details"];
  }): Promise<IncidentRecord> {
    return this.incidentRecorder.record(input);
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
