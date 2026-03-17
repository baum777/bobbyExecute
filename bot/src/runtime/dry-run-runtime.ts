import { Engine, type EngineState } from "../core/engine.js";
import type { Config } from "../config/config-schema.js";
import type { ExecutionReport, RpcVerificationReport, TradeIntent } from "../core/contracts/trade.js";
import type { MarketSnapshot } from "../core/contracts/market.js";
import type { WalletSnapshot } from "../core/contracts/wallet.js";
import { isKillSwitchHalted } from "../governance/kill-switch.js";
import { CircuitBreaker } from "../governance/circuit-breaker.js";
import { FileSystemJournalWriter } from "../journal-writer/writer.js";
import {
  fetchMarketData,
  type AdapterOrchestratorConfig,
  type MarketAdapterFetch,
} from "../adapters/orchestrator/adapter-orchestrator.js";
import {
  FileSystemRuntimeCycleSummaryWriter,
  type RuntimeCycleIntakeOutcome,
  type RuntimeCycleSummary,
  type RuntimeCycleSummaryWriter,
} from "../persistence/runtime-cycle-summary-repository.js";

export type RuntimeStatus = "idle" | "running" | "paused" | "stopped" | "error";

export interface RuntimeCounters {
  cycleCount: number;
  decisionCount: number;
  executionCount: number;
  blockedCount: number;
  errorCount: number;
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

  constructor(
    private readonly config: Config,
    deps: DryRunRuntimeDeps = {}
  ) {
    this.engine =
      deps.engine ??
      new Engine({
        dryRun: config.executionMode !== "live",
        journalWriter: new FileSystemJournalWriter(config.journalPath),
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

  getStatus(): RuntimeStatus {
    return this.status;
  }

  getLastState(): EngineState | null {
    return this.lastState;
  }

  getSnapshot(): RuntimeSnapshot {
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
    };
  }

  private async runCycle(options: { propagateError?: boolean } = {}): Promise<void> {
    if (this.cycleInFlight || this.status !== "running") {
      return;
    }

    if (isKillSwitchHalted()) {
      const now = new Date().toISOString();
      this.status = "paused";
      this.lastState = {
        stage: "risk",
        traceId: `runtime-${now}`,
        timestamp: now,
        blocked: true,
        blockedReason: "RUNTIME_PHASE2_KILL_SWITCH_HALTED",
      };
      this.lastCycleAt = now;
      this.counters.blockedCount += 1;
      await this.persistCycleSummary({
        cycleTimestamp: now,
        mode: this.mode,
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
        traceId: this.lastState.traceId,
      });
      return;
    }

    this.cycleInFlight = true;
    try {
      const now = new Date().toISOString();
      this.counters.cycleCount += 1;
      this.lastCycleAt = now;

      const paperIntake = await this.preparePaperIntake(now);
      if (paperIntake?.kind === "blocked") {
        this.lastState = {
          stage: "ingest",
          traceId: `runtime-${now}`,
          timestamp: now,
          blocked: true,
          blockedReason: paperIntake.summary.blockedReason,
        };
        this.counters.blockedCount += 1;
        await this.persistCycleSummary({
          ...paperIntake.summary,
          traceId: this.lastState.traceId,
        });
        return;
      }

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

      this.lastDecisionAt = now;
      this.counters.decisionCount += 1;
      if (this.lastState.executionReport) this.counters.executionCount += 1;
      if (this.lastState.blocked) this.counters.blockedCount += 1;
      await this.persistCycleSummary(this.toCycleSummary(this.lastState, paperIntake?.kind === "ready" ? paperIntake.intakeOutcome : "ok"));
    } catch (error) {
      this.status = "error";
      this.counters.errorCount += 1;
      this.logger.error("Dry-run runtime cycle failed", error);
      await this.persistCycleSummary({
        cycleTimestamp: this.lastCycleAt ?? new Date().toISOString(),
        mode: this.mode,
        intakeOutcome: "invalid",
        advanced: false,
        stage: "ingest",
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
        error: error instanceof Error ? error.message : String(error),
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

    const marketResult = await this.fetchMarketDataFn({
      adapters: this.paperMarketAdapters,
      circuitBreaker: this.paperAdapterCircuitBreaker,
      maxStalenessMs: this.maxPaperMarketStalenessMs,
    });

    if ("error" in marketResult) {
      const intakeOutcome: RuntimeCycleIntakeOutcome = marketResult.error.includes("stale")
        ? "stale"
        : "adapter_error";
      return {
        kind: "blocked",
        summary: {
          cycleTimestamp: now,
          mode: this.mode,
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
        },
      };
    }

    const wallet = await this.fetchPaperWalletSnapshot();
    if (!wallet.walletAddress) {
      return {
        kind: "blocked",
        summary: {
          cycleTimestamp: now,
          mode: this.mode,
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
      mode: this.mode,
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
      traceId: state.traceId,
    };
  }

  private async persistCycleSummary(summary: RuntimeCycleSummary): Promise<void> {
    this.lastCycleSummary = summary;
    await this.cycleSummaryWriter.append(summary);
  }
}

export function createDryRunRuntime(config: Config, deps?: DryRunRuntimeDeps): DryRunRuntime {
  return new DryRunRuntime(config, deps);
}
