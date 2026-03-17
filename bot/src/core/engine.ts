/**
 * Trading engine - state machine orchestrator.
 * MAPPED from OrchestrAI_Labs packages/agent-runtime/src/orchestrator/orchestrator.ts
 * Simplified pipeline: Ingest -> Signal -> Risk -> Execute -> Verify -> Journal -> Monitor
 * Wave 6 P1: Global error escalation - critical errors trigger kill switch.
 * Wave 8 P0: Daily loss tracking - block when limit reached.
 */
import type { Clock } from "./clock.js";
import { triggerKillSwitch } from "../governance/kill-switch.js";
import { ChaosGateError } from "../chaos/chaos-suite.js";
import { runChaosGate } from "../governance/chaos-gate.js";
import type { ActionLogger } from "../observability/action-log.js";
import type { MarketSnapshot } from "./contracts/market.js";
import type { WalletSnapshot } from "./contracts/wallet.js";
import type { TradeIntent, ExecutionReport, RpcVerificationReport } from "./contracts/trade.js";
import type { JournalEntry } from "./contracts/journal.js";
import type { JournalWriter } from "../journal-writer/writer.js";
import { appendJournal } from "../persistence/journal-repository.js";
import { SystemClock } from "./clock.js";
import { hashDecision, hashResult } from "./determinism/hash.js";
import { createTraceId } from "../observability/trace-id.js";

export type EngineStage =
  | "ingest"
  | "signal"
  | "risk"
  | "chaos"
  | "execute"
  | "verify"
  | "journal"
  | "monitor";

export type ChaosDecision = {
  allowed: boolean;
  reason?: string;
  reportHash?: string;
};

export type EngineState = {
  stage: EngineStage;
  traceId: string;
  timestamp: string;
  market?: MarketSnapshot;
  wallet?: WalletSnapshot;
  signal?: { direction: string; confidence: number; cqd?: import("./contracts/cqd.js").CQDSnapshotV1 };
  tradeIntent?: TradeIntent;
  riskAllowed?: boolean;
  chaosAllowed?: boolean;
  chaosReportHash?: string;
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

export type ChaosHandler = (
  intent: TradeIntent,
  market: MarketSnapshot,
  wallet: WalletSnapshot,
  signal: { direction: string; confidence: number; cqd?: import("./contracts/cqd.js").CQDSnapshotV1 }
) => Promise<ChaosDecision>;

import type { EventBus } from "../eventbus/index.js";

export interface EngineConfig {
  clock?: Clock;
  actionLogger?: ActionLogger;
  dryRun?: boolean;
  /** For deterministic tests - when set, used as traceId suffix instead of random */
  traceIdSeed?: string;
  /** Optional JournalWriter - when provided, journal entries are persisted */
  journalWriter?: JournalWriter;
  /** Critical journaling policy for runtime authority artifacts */
  journalPolicy?: "optional" | "mandatory";
  /** Chaos authority decision before execute */
  chaosFn?: ChaosHandler;
  /** Optional EventBus for stage transitions */
  eventBus?: EventBus;
  /** Wave 8: Daily loss tracker - block execute when limit reached */
  dailyLossTracker?: { isLimitReached(): boolean; recordTrade(lossUsd: number): void };
}

export class Engine {
  private readonly clock: Clock;
  private readonly actionLogger?: ActionLogger;
  private readonly dryRun: boolean;
  private readonly traceIdSeed?: string;
  private readonly journalWriter?: JournalWriter;
  private readonly journalPolicy: "optional" | "mandatory";
  private readonly chaosFn: ChaosHandler;
  private readonly eventBus?: EventBus;
  private readonly dailyLossTracker?: { isLimitReached(): boolean; recordTrade(lossUsd: number): void };

  constructor(config: EngineConfig = {}) {
    this.clock = config.clock ?? new SystemClock();
    this.actionLogger = config.actionLogger;
    this.dryRun = config.dryRun ?? true;
    this.traceIdSeed = config.traceIdSeed;
    this.journalWriter = config.journalWriter;
    this.journalPolicy = config.journalPolicy ?? "optional";
    this.chaosFn = config.chaosFn ?? defaultChaosHandler;
    this.eventBus = config.eventBus;
    this.dailyLossTracker = config.dailyLossTracker;
  }

  async run(
    ingest: IngestHandler,
    signalFn: SignalHandler,
    riskFn: RiskHandler,
    executeFn: ExecuteHandler,
    verifyFn: VerifyHandler
  ): Promise<EngineState> {
    const timestamp = this.clock.now().toISOString();
    const traceId = createTraceId({
      timestamp,
      prefix: "trace",
      seed: this.traceIdSeed,
      mode: this.traceIdSeed || process.env.REPLAY_MODE === "true" ? "replay" : "live",
    });
    const state: EngineState = {
      stage: "ingest",
      traceId,
      timestamp,
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
        executionMode: this.dryRun ? "dry" : "paper",
      };
      state.tradeIntent = intent;
      await this.appendCriticalJournal(state, "decision_outcome", { market, wallet, signal }, { intent });

      const risk = await riskFn(intent, market, wallet);
      state.riskAllowed = risk.allowed;
      await this.appendCriticalJournal(
        state,
        "risk_decision",
        { intent, market, wallet },
        { allowed: risk.allowed, reason: risk.reason },
        !risk.allowed,
        risk.reason
      );
      if (!risk.allowed) {
        state.blocked = true;
        state.blockedReason = risk.reason;
        await this.log(state, "risk_blocked");
        return state;
      }

      if (this.dailyLossTracker?.isLimitReached()) {
        state.blocked = true;
        state.blockedReason = "Daily loss limit reached";
        await this.log(state, "daily_loss_blocked");
        return state;
      }

      state.blocked = false;
      state.stage = "chaos";
      await this.emitStageTransition(state, "risk", "chaos");

      const chaos = await this.chaosFn(intent, market, wallet, signal);
      state.chaosAllowed = chaos.allowed;
      state.chaosReportHash = chaos.reportHash;
      await this.appendCriticalJournal(
        state,
        "chaos_decision",
        { intent, market, wallet, signal },
        { allowed: chaos.allowed, reason: chaos.reason, reportHash: chaos.reportHash },
        !chaos.allowed,
        chaos.reason
      );
      if (!chaos.allowed) {
        state.blocked = true;
        state.blockedReason = chaos.reason ?? "Chaos gate denied execution";
        await this.log(state, "chaos_blocked");
        return state;
      }

      state.stage = "execute";
      await this.emitStageTransition(state, "chaos", "execute");
      const execReport = await executeFn(intent);
      state.executionReport = execReport;
      await this.appendCriticalJournal(state, "execution_result", { intent }, { execReport });
      state.stage = "verify";
      await this.emitStageTransition(state, "execute", "verify");

      const rpcVerify = await verifyFn(intent, execReport);
      state.rpcVerification = rpcVerify;
      await this.appendCriticalJournal(
        state,
        "verification_result",
        { intent, execReport },
        { rpcVerify },
        !rpcVerify.passed,
        rpcVerify.reason
      );
      if (!rpcVerify.passed) {
        state.blocked = true;
        state.blockedReason = rpcVerify.reason ?? "RPC verification failed";
        await this.log(state, "verify_failed");
        return state;
      }

      if (this.dailyLossTracker && !this.dryRun && state.executionReport) {
        const lossUsd = estimateLossUsd(intent, state.executionReport, state.market?.priceUsd);
        this.dailyLossTracker.recordTrade(lossUsd);
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
        await appendJournal(this.journalWriter, state.journalEntry);
      }
      await this.log(state, "complete");
      await this.emitStageTransition(state, "journal", "monitor");

      state.stage = "monitor";
      return state;
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
      state.blocked = true;
      if (err instanceof ChaosGateError || /No healthy adapters|CRITICAL|emergency/i.test(state.error)) {
        triggerKillSwitch(`Engine error escalation: ${state.error}`);
      }
      await this.log(state, "error");
      throw err;
    }
  }

  private async appendCriticalJournal(
    state: EngineState,
    stage: string,
    input: unknown,
    output: unknown,
    blocked = false,
    reason?: string
  ): Promise<void> {
    if (!this.journalWriter) {
      if (this.journalPolicy === "mandatory") {
        throw new Error(`MANDATORY_JOURNAL_WRITER_MISSING:${stage}`);
      }
      return;
    }

    const entry: JournalEntry = {
      traceId: state.traceId,
      timestamp: this.clock.now().toISOString(),
      stage,
      input,
      output,
      blocked,
      reason,
    };
    await appendJournal(this.journalWriter, entry);
    state.journalEntry = entry;
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

async function defaultChaosHandler(
  intent: TradeIntent,
  market: MarketSnapshot,
  _wallet: WalletSnapshot,
  _signal: { direction: string; confidence: number; cqd?: import("./contracts/cqd.js").CQDSnapshotV1 }
): Promise<ChaosDecision> {
  try {
    const { report } = await runChaosGate(intent.traceId, {
      liquidity: market.liquidity ?? 100_000,
      prevLiquidity: market.liquidity ?? 100_000,
      freshnessMs: market.freshnessMs ?? 0,
      prices: [market.priceUsd ?? 100, market.priceUsd ?? 100],
      sourceManipulationPrices: [market.priceUsd ?? 100, market.priceUsd ?? 100],
    });
    return {
      allowed: true,
      reportHash: report.auditHashChain,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      allowed: false,
      reason,
    };
  }
}

/** Wave 8: Rough USD loss when actual < expected. Assumes USDC 6 decimals for out. */
function estimateLossUsd(
  intent: TradeIntent,
  report: ExecutionReport,
  priceUsd?: number
): number {
  const minOut = parseFloat(intent.minAmountOut) || 0;
  const actualOut = parseFloat(report.actualAmountOut ?? "0") || 0;
  if (actualOut >= minOut) return 0;
  const lossUnits = minOut - actualOut;
  if (intent.tokenOut === "USDC") {
    return lossUnits / 1e6;
  }
  return (lossUnits / 1e6) * (priceUsd ?? 1);
}
