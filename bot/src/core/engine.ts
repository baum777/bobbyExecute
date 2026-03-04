/**
 * Trading engine - state machine orchestrator.
 * MAPPED from OrchestrAI_Labs packages/agent-runtime/src/orchestrator/orchestrator.ts
 * Simplified pipeline: Ingest -> Signal -> Risk -> Execute -> Verify -> Journal -> Monitor
 */
import type { Clock } from "./clock.js";
import type { ActionLogger } from "../observability/action-log.js";
import type { MarketSnapshot } from "./contracts/market.js";
import type { WalletSnapshot } from "./contracts/wallet.js";
import type { TradeIntent } from "./contracts/trade.js";
import type { RpcVerificationReport } from "./contracts/trade.js";
import type { ExecutionReport } from "./contracts/trade.js";
import type { JournalEntry } from "./contracts/journal.js";
import type { JournalWriter } from "../journal-writer/writer.js";
import { SystemClock } from "./clock.js";
import { hashDecision, hashResult } from "./determinism/hash.js";

export type EngineStage =
  | "ingest"
  | "signal"
  | "risk"
  | "execute"
  | "verify"
  | "journal"
  | "monitor";

export type EngineState = {
  stage: EngineStage;
  traceId: string;
  timestamp: string;
  market?: MarketSnapshot;
  wallet?: WalletSnapshot;
  signal?: { direction: string; confidence: number; cqd?: import("./contracts/cqd.js").CQDSnapshotV1 };
  tradeIntent?: TradeIntent;
  riskAllowed?: boolean;
  executionPlan?: unknown;
  executionReport?: ExecutionReport;
  rpcVerification?: RpcVerificationReport;
  journalEntry?: JournalEntry;
  error?: string;
  blocked?: boolean;
  blockedReason?: string;
};

export type IngestHandler = () => Promise<{
  market: MarketSnapshot;
  wallet: WalletSnapshot;
}>;

export type SignalHandler = (market: MarketSnapshot) => Promise<{
  direction: string;
  confidence: number;
  cqd?: import("./contracts/cqd.js").CQDSnapshotV1;
}>;

export type RiskHandler = (
  intent: TradeIntent,
  market: MarketSnapshot,
  wallet: WalletSnapshot
) => Promise<{ allowed: boolean; reason?: string }>;

export type ExecuteHandler = (
  intent: TradeIntent
) => Promise<ExecutionReport>;

export type VerifyHandler = (
  intent: TradeIntent,
  report: ExecutionReport
) => Promise<RpcVerificationReport>;

export interface EngineConfig {
  clock?: Clock;
  actionLogger?: ActionLogger;
  dryRun?: boolean;
  /** For deterministic tests - when set, used as traceId suffix instead of random */
  traceIdSeed?: string;
  /** Optional JournalWriter - when provided, journal entries are persisted */
  journalWriter?: JournalWriter;
}

export class Engine {
  private readonly clock: Clock;
  private readonly actionLogger?: ActionLogger;
  private readonly dryRun: boolean;
  private readonly traceIdSeed?: string;
  private readonly journalWriter?: JournalWriter;
  private readonly eventBus?: EventBus;

  constructor(config: EngineConfig = {}) {
    this.clock = config.clock ?? new SystemClock();
    this.actionLogger = config.actionLogger;
    this.dryRun = config.dryRun ?? true;
    this.traceIdSeed = config.traceIdSeed;
    this.journalWriter = config.journalWriter;
    this.eventBus = config.eventBus;
  }

  async run(
    ingest: IngestHandler,
    signalFn: SignalHandler,
    riskFn: RiskHandler,
    executeFn: ExecuteHandler,
    verifyFn: VerifyHandler
  ): Promise<EngineState> {
    const traceId = this.traceIdSeed
      ? `trace-${this.clock.now().toISOString().replace(/[:.]/g, "-")}-${this.traceIdSeed}`
      : `trace-${this.clock.now().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 9)}`;
    const state: EngineState = {
      stage: "ingest",
      traceId,
      timestamp: this.clock.now().toISOString(),
    };

    try {
      const { market, wallet } = await ingest();
      state.market = market;
      state.wallet = wallet;
      state.stage = "signal";

      const signal = await signalFn(market);
      state.signal = signal;
      state.stage = "risk";
      await this.emitStageTransition(state, "signal", "risk");

      const intent: TradeIntent = {
        traceId,
        timestamp: this.clock.now().toISOString(),
        idempotencyKey: `${traceId}-intent`,
        tokenIn: "SOL",
        tokenOut: "USDC",
        amountIn: "1",
        minAmountOut: "0.95",
        slippagePercent: 1,
        dryRun: this.dryRun,
      };
      state.tradeIntent = intent;

      const risk = await riskFn(intent, market, wallet);
      state.riskAllowed = risk.allowed;
      if (!risk.allowed) {
        state.blocked = true;
        state.blockedReason = risk.reason;
        await this.log(state, "risk_blocked");
        return state;
      }

      state.blocked = false;
      state.stage = "execute";
      await this.emitStageTransition(state, "risk", "execute");
      const execReport = await executeFn(intent);
      state.executionReport = execReport;
      state.stage = "verify";
      await this.emitStageTransition(state, "execute", "verify");

      const rpcVerify = await verifyFn(intent, execReport);
      state.rpcVerification = rpcVerify;
      if (!rpcVerify.passed) {
        state.blocked = true;
        state.blockedReason = rpcVerify.reason ?? "RPC verification failed";
        await this.log(state, "verify_failed");
        return state;
      }

      state.stage = "journal";
      await this.emitStageTransition(state, "verify", "journal");
      const decisionHash = hashDecision({ market, wallet, signal });
      const resultHash = hashResult({ execReport, rpcVerify });
      state.journalEntry = {
        traceId,
        timestamp: this.clock.now().toISOString(),
        stage: "complete",
        decisionHash,
        resultHash,
        input: { market, wallet, signal, intent },
        output: { execReport, rpcVerify },
        blocked: false,
      };
      if (this.journalWriter) {
        await this.journalWriter.append(state.journalEntry);
      }
      await this.log(state, "complete");
      await this.emitStageTransition(state, "journal", "monitor");

      state.stage = "monitor";
      return state;
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
      state.blocked = true;
      await this.log(state, "error");
      throw err;
    }
  }

  private async emitStageTransition(
    state: EngineState,
    fromStage: string,
    toStage: string
  ): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.emit({
      type: "StageTransition",
      traceId: state.traceId,
      timestamp: this.clock.now().toISOString(),
      fromStage,
      toStage,
      payload: {
        market: state.market,
        wallet: state.wallet,
        signal: state.signal,
        tradeIntent: state.tradeIntent,
        executionReport: state.executionReport,
        rpcVerification: state.rpcVerification,
      },
    });
  }

  private async log(state: EngineState, action: string): Promise<void> {
    if (!this.actionLogger) return;

    // Use current event hash chain if possible (simplified for now)
    const payload = {
      traceId: state.traceId,
      stage: state.stage,
      market: state.market,
      wallet: state.wallet,
      signal: state.signal,
      tradeIntent: state.tradeIntent,
      executionReport: state.executionReport,
      rpcVerification: state.rpcVerification,
    };

    const event_hash = hashDecision(payload);

    await this.actionLogger.append({
      agentId: "engine",
      userId: "system",
      action,
      input: payload,
      output: {
        event_hash, // Log the deterministic hash
        journalEntry: state.journalEntry,
      },
      ts: state.timestamp,
      blocked: state.blocked,
      reason: state.blockedReason ?? state.error,
      traceId: state.traceId,
    });
  }
}
