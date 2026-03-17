import { Engine, type EngineState } from "../core/engine.js";
import type { Config } from "../config/config-schema.js";
import type { ExecutionReport, RpcVerificationReport, TradeIntent } from "../core/contracts/trade.js";
import { isKillSwitchHalted } from "../governance/kill-switch.js";
import { FileSystemJournalWriter } from "../journal-writer/writer.js";

export type RuntimeStatus = "idle" | "running" | "stopped" | "error";

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

  private async runCycle(options: { propagateError?: boolean } = {}): Promise<void> {
    if (this.cycleInFlight || this.status !== "running") {
      return;
    }

    if (isKillSwitchHalted()) {
      const now = new Date().toISOString();
      this.lastState = {
        stage: "risk",
        traceId: `runtime-${now}`,
        timestamp: now,
        blocked: true,
        blockedReason: "RUNTIME_PHASE2_KILL_SWITCH_HALTED",
      };
      return;
    }

    this.cycleInFlight = true;
    try {
      const now = new Date().toISOString();
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
        async () => ({ direction: "hold", confidence: 0 }),
        async () => ({
          allowed: false,
          reason: "RUNTIME_PHASE1_FAIL_CLOSED_UNTIL_PIPELINE_WIRED",
        }),
        async (intent: TradeIntent): Promise<ExecutionReport> => ({
          traceId: intent.traceId,
          timestamp: intent.timestamp,
          tradeIntentId: intent.idempotencyKey,
          success: false,
          error: "Execution unreachable in phase-1 fail-closed mode",
          dryRun: true,
        }),
        async (intent: TradeIntent): Promise<RpcVerificationReport> => ({
          traceId: intent.traceId,
          timestamp: intent.timestamp,
          passed: false,
          checks: {},
          reason: "Verification unreachable in phase-1 fail-closed mode",
        })
      );
    } catch (error) {
      this.status = "error";
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
