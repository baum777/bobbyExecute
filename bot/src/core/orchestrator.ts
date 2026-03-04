/**
 * Orchestrator - 7-Phasen Extended Pipeline.
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: core | Last Updated: 2026-03-04
 */
import type { Clock } from "./clock.js";
import { SystemClock } from "./clock.js";
import { hashDecision, hashResult } from "./determinism/hash.js";
import { computeScoreCard } from "./intelligence/mci-bci-formulas.js";
import { recognizePatterns } from "../patterns/pattern-engine.js";
import { MemoryDB } from "../memory/memory-db.js";
import { MemoryLog } from "../memory/log-append.js";
import { runChaosGate } from "../governance/chaos-gate.js";
import type { IntentSpec } from "./contracts/intent.js";
import type { SignalPack } from "./contracts/signalpack.js";
import type { ScoreCard } from "./contracts/scorecard.js";
import type { DecisionResult } from "./contracts/decisionresult.js";
import type { PatternResult } from "./contracts/pattern.js";

export type OrchestratorPhase =
  | "research"
  | "analyse"
  | "reasoning"
  | "compress_db"
  | "chaos_gate"
  | "memory_log"
  | "focused_tx";

export interface OrchestratorState {
  phase: OrchestratorPhase;
  traceId: string;
  timestamp: string;
  intentSpec?: IntentSpec;
  signalPack?: SignalPack;
  scoreCard?: ScoreCard;
  patternResult?: PatternResult;
  decisionResult?: DecisionResult;
  chaosPassed?: boolean;
  error?: string;
}

export interface ResearchHandler {
  (intent: IntentSpec): Promise<SignalPack>;
}

export interface SecretsVaultHandler {
  (): Promise<unknown>;
}

export interface FocusedTxHandler {
  (decision: DecisionResult, secretLease: unknown): Promise<unknown>;
}

export interface OrchestratorConfig {
  clock?: Clock;
  dryRun?: boolean;
}

export class Orchestrator {
  private readonly clock: Clock;
  private readonly dryRun: boolean;
  private readonly memoryDb: MemoryDB;
  private readonly memoryLog: MemoryLog;

  constructor(config: OrchestratorConfig = {}) {
    this.clock = config.clock ?? new SystemClock();
    this.dryRun = config.dryRun ?? true;
    this.memoryDb = new MemoryDB();
    this.memoryLog = new MemoryLog();
  }

  async run(
    intentSpec: IntentSpec,
    research: ResearchHandler,
    secretsVault?: SecretsVaultHandler,
    focusedTx?: FocusedTxHandler
  ): Promise<OrchestratorState> {
    const traceId = `orch-${this.clock.now().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 9)}`;
    const state: OrchestratorState = {
      phase: "research",
      traceId,
      timestamp: this.clock.now().toISOString(),
      intentSpec,
    };

    try {
      const timestamp = this.clock.now().toISOString();

      const signalPack = await research(intentSpec);
      state.signalPack = signalPack;
      state.phase = "analyse";

      const scoreCard = computeScoreCard(traceId, timestamp, signalPack);
      state.scoreCard = scoreCard;
      state.phase = "reasoning";

      const patternResult = recognizePatterns(traceId, timestamp, scoreCard, signalPack);
      state.patternResult = patternResult;

      const decisionResult = toDecisionResult(traceId, timestamp, scoreCard, patternResult);
      state.decisionResult = decisionResult;
      state.phase = "compress_db";

      const dataQuality = {
        completeness: signalPack.dataQuality.completeness,
        freshness: signalPack.dataQuality.freshness,
      };

      if (this.memoryDb.shouldRenew(dataQuality)) {
        const snapshot = this.memoryDb.renew(
          { signalPack, scoreCard, patternResult, decisionResult },
          dataQuality
        );
        await this.memoryDb.compress(snapshot);
      }

      state.phase = "chaos_gate";

      const { passed } = await runChaosGate(traceId);
      state.chaosPassed = passed;

      state.phase = "memory_log";

      this.memoryLog.append({
        traceId,
        timestamp,
        stage: "orchestrator_complete",
        decisionHash: hashDecision({ scoreCard, patternResult }),
        resultHash: hashResult({ decisionResult }),
        input: { intentSpec, signalPack },
        output: { scoreCard, patternResult, decisionResult },
      });

      state.phase = "focused_tx";

      if (!this.dryRun && focusedTx && secretsVault) {
        const secretLease = await secretsVault();
        await focusedTx(decisionResult, secretLease);
      }

      return state;
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  getMemoryDb(): MemoryDB {
    return this.memoryDb;
  }

  getMemoryLog(): MemoryLog {
    return this.memoryLog;
  }
}

function toDecisionResult(
  traceId: string,
  timestamp: string,
  scoreCard: ScoreCard,
  patternResult: PatternResult
): DecisionResult {
  let direction: "buy" | "sell" | "hold" = "hold";
  if (scoreCard.hybrid > 0.6) direction = "buy";
  else if (scoreCard.hybrid < -0.4) direction = "sell";

  const decisionHash = hashDecision({ scoreCard, patternResult });

  return {
    traceId,
    timestamp,
    direction,
    confidence: Math.min(0.95, patternResult.confidence + Math.abs(scoreCard.hybrid) / 2),
    evidence: patternResult.evidence.map((e) => ({ id: e.id, hash: e.hash, type: "pattern", value: undefined })),
    decisionHash,
    rationale: `hybrid=${scoreCard.hybrid} patterns=${patternResult.patterns.join(",")}`,
  };
}
