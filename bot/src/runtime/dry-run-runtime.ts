import { Engine, type EngineState } from "../core/engine.js";
import type { Config } from "../config/config-schema.js";
import type { ExecutionReport, RpcVerificationReport, TradeIntent } from "../core/contracts/trade.js";
import { isKillSwitchHalted } from "../governance/kill-switch.js";
import { FileSystemJournalWriter } from "../journal-writer/writer.js";

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
}

export interface DryRunRuntimeDeps {
  engine?: Engine;
  loopIntervalMs?: number;
  logger?: Pick<Console, "info" | "error">;
}

/**
 * Phase-1 runtime loop: runs deterministic dry-run control cycles.
 * Fail-closed defaults: risk denies every cycle until full pipeline wiring lands.
 */
export class DryRunRuntime {
  private readonly engine: Engine;
  private readonly loopIntervalMs: number;
  private readonly logger: Pick<Console, "info" | "error">;
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
      return;
    }


    this.cycleInFlight = true;
    try {
      const now = new Date().toISOString();
      this.counters.cycleCount += 1;
      this.lastCycleAt = now;
      this.lastState = await this.engine.run(
        async () => ({
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
        }),
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
    } catch (error) {
      this.status = "error";
      this.counters.errorCount += 1;
      this.logger.error("Dry-run runtime cycle failed", error);
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
}

export function createDryRunRuntime(config: Config, deps?: DryRunRuntimeDeps): DryRunRuntime {
  return new DryRunRuntime(config, deps);
}
