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
import { lookupActionHandbook } from "../governance/action-handbook-lookup.js";
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
  chaosReportHash?: string;
  reviewGateApproved?: boolean;
  focusedTxExecuted?: boolean;
  nextAction?: string;
  error?: string;
}

export interface ResearchHandler {
  (intent: IntentSpec): Promise<SignalPack>;
}

export interface SecretsVaultHandler {
  (): Promise<unknown>;
}

export interface SecretLease {
  ttlSeconds: number;
  expiresAt?: string;
  leaseId?: string;
  renewable?: boolean;
}

export interface FocusedTxHandler {
  (decision: DecisionResult, secretLease: SecretLease): Promise<unknown>;
}

export interface ReviewGateHandler {
  (decision: DecisionResult): Promise<boolean>;
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
    focusedTx?: FocusedTxHandler,
    reviewGate?: ReviewGateHandler
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

      const { passed, report } = await runChaosGate(traceId);
      state.chaosPassed = passed;
      state.chaosReportHash = report.auditHashChain;

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

      const reviewGateApproved = reviewGate ? await reviewGate(decisionResult) : true;
      state.reviewGateApproved = reviewGateApproved;

      const shouldExecuteTx =
        !this.dryRun &&
        decisionResult.decision === "allow" &&
        reviewGateApproved &&
        focusedTx &&
        secretsVault;
      state.focusedTxExecuted = Boolean(shouldExecuteTx);

      if (shouldExecuteTx) {
        const secretLease = ensureValidVaultLease(await secretsVault());
        await focusedTx(decisionResult, secretLease);
      }

      state.nextAction = lookupActionHandbook({
        phase: state.phase,
        decision: decisionResult.decision,
        dryRun: this.dryRun,
        focusedTxExecuted: state.focusedTxExecuted,
      });

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

  const hasReliableConfidence = scoreCard.crossSourceConfidenceScore >= 0.85;
  const decision: "allow" | "deny" =
    direction !== "hold" && hasReliableConfidence ? "allow" : "deny";

  const decisionHash = hashDecision({ scoreCard, patternResult });

  return {
    traceId,
    timestamp,
    decision,
    direction,
    confidence: Math.min(0.95, patternResult.confidence + Math.abs(scoreCard.hybrid) / 2),
    evidence: patternResult.evidence.map((e) => ({ id: e.id, hash: e.hash, type: "pattern", value: undefined })),
    decisionHash,
    rationale: `decision=${decision} hybrid=${scoreCard.hybrid} patterns=${patternResult.patterns.join(",")}`,
  };
}

function ensureValidVaultLease(rawLease: unknown): SecretLease {
  if (!rawLease || typeof rawLease !== "object") {
    throw new Error("Invalid Vault lease: expected object");
  }

  const lease = rawLease as Partial<SecretLease>;
  if (typeof lease.ttlSeconds !== "number" || !Number.isFinite(lease.ttlSeconds)) {
    throw new Error("Invalid Vault lease: ttlSeconds is required");
  }
  if (lease.ttlSeconds <= 0 || lease.ttlSeconds > 3600) {
    throw new Error(`Invalid Vault lease: ttlSeconds ${lease.ttlSeconds} out of bounds (1..3600)`);
  }

  if (lease.expiresAt) {
    const expires = Date.parse(lease.expiresAt);
    if (Number.isNaN(expires)) {
      throw new Error("Invalid Vault lease: expiresAt is not a valid timestamp");
    }
    if (expires <= Date.now()) {
      throw new Error("Invalid Vault lease: lease already expired");
    }
  }

  return {
    ttlSeconds: lease.ttlSeconds,
    expiresAt: lease.expiresAt,
    leaseId: lease.leaseId,
    renewable: lease.renewable,
  };
}
