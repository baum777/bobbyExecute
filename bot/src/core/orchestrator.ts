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
import { isKillSwitchHalted } from "../governance/kill-switch.js";
import { lookupActionHandbook } from "../governance/action-handbook-lookup.js";
import type { IntentSpec } from "./contracts/intent.js";
import { createTraceId } from "../observability/trace-id.js";
import { createCanonicalDecisionAuthority, type DecisionCoordinator } from "./decision/index.js";
import {
  assertDecisionEnvelope,
  type DecisionEnvelope,
  type DecisionStage,
} from "./contracts/decision-envelope.js";
import {
  type IdempotencyStore,
  IDEMPOTENCY_REPLAY_BLOCK,
} from "../storage/idempotency-store.js";
import type { SignalPack } from "./contracts/signalpack.js";
import type { ScoreCard } from "./contracts/scorecard.js";
import type { DecisionResult } from "./contracts/decisionresult.js";
import type { PatternResult } from "./contracts/pattern.js";
import { aggregateRisk } from "./risk/global-risk.js";
import { computeLiquidityRisk } from "./risk/liquidity-risk.js";
import { computeSocialManipRisk } from "./risk/social-manip-risk.js";
import { computeMomentumExhaustRisk } from "./risk/momentum-exhaust-risk.js";
import { computeStructuralWeaknessRisk } from "./risk/structural-weakness-risk.js";
import type { RiskBreakdown } from "./contracts/riskbreakdown.js";
import { deriveDecisionResult } from "./decision/decision-result-derivation.js";

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
  decisionEnvelope?: DecisionEnvelope;
  intentSpec?: IntentSpec;
  signalPack?: SignalPack;
  scoreCard?: ScoreCard;
  patternResult?: PatternResult;
  riskBreakdown?: RiskBreakdown;
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
  idempotencyStore?: IdempotencyStore;
  decisionCoordinator?: DecisionCoordinator;
}

export class Orchestrator {
  private readonly clock: Clock;
  private readonly dryRun: boolean;
  private readonly memoryDb: MemoryDB;
  private readonly memoryLog: MemoryLog;
  private readonly idempotencyStore?: IdempotencyStore;
  private readonly decisionCoordinator: DecisionCoordinator;

  constructor(config: OrchestratorConfig = {}) {
    this.clock = config.clock ?? new SystemClock();
    this.dryRun = config.dryRun ?? true;
    this.memoryDb = new MemoryDB();
    this.memoryLog = new MemoryLog();
    this.idempotencyStore = config.idempotencyStore;
    this.decisionCoordinator = config.decisionCoordinator ?? createCanonicalDecisionAuthority();
  }

  async run(
    intentSpec: IntentSpec,
    research: ResearchHandler,
    secretsVault?: SecretsVaultHandler,
    focusedTx?: FocusedTxHandler,
    reviewGate?: ReviewGateHandler
  ): Promise<OrchestratorState> {
    const state: OrchestratorState = {
      phase: "research",
      traceId: "",
      timestamp: this.clock.now().toISOString(),
      intentSpec,
    };
    const replayMode = process.env.REPLAY_MODE === "true";
    let signalPack: SignalPack | undefined;
    let scoreCard: ScoreCard | undefined;
    let patternResult: PatternResult | undefined;
    let riskBreakdown: RiskBreakdown | undefined;
    let decisionResult: DecisionResult | undefined;

    try {
      if (isKillSwitchHalted()) {
        state.phase = "research";
        state.error = "Kill switch active - trading halted. Manual reset required.";
        throw new Error(state.error);
      }

      const envelope = assertDecisionEnvelope(
        await this.decisionCoordinator.run({
          entrypoint: "orchestrator",
          flow: "analysis",
          executionMode: this.dryRun ? "dry" : "paper",
          clock: this.clock,
          traceIdSeed: replayMode ? intentSpec : undefined,
          tracePrefix: "orch",
          handlers: {
            ingest: async (context) => {
              state.traceId = context.traceId;
              state.timestamp = context.timestamp;

              signalPack = await research(intentSpec);
              state.signalPack = signalPack;
              state.phase = "analyse";

              return { payload: { intentSpec, signalPack } };
            },
            signal: async (context) => {
              if (!signalPack) {
                throw new Error("ORCHESTRATOR_COORDINATOR_MISSING_SIGNAL_PACK");
              }

              scoreCard = computeScoreCard(context.traceId, context.timestamp, signalPack);
              state.scoreCard = scoreCard;
              state.phase = "reasoning";

              return { payload: { scoreCard } };
            },
            reasoning: async (context) => {
              if (!signalPack || !scoreCard) {
                throw new Error("ORCHESTRATOR_COORDINATOR_MISSING_REASONING_STATE");
              }

              patternResult = recognizePatterns(context.traceId, context.timestamp, scoreCard, signalPack);
              state.patternResult = patternResult;

              riskBreakdown = computeRiskBreakdown(context.traceId, context.timestamp, signalPack, scoreCard);
              state.riskBreakdown = riskBreakdown;

              decisionResult = deriveDecisionResult(
                context.traceId,
                context.timestamp,
                scoreCard,
                patternResult,
                riskBreakdown
              );
              state.decisionResult = decisionResult;
              state.phase = "compress_db";

              return { payload: { scoreCard, patternResult, riskBreakdown, decisionResult } };
            },
            risk: async (context) => {
              if (!signalPack || !scoreCard || !patternResult || !decisionResult) {
                throw new Error("ORCHESTRATOR_COORDINATOR_MISSING_RISK_STATE");
              }

              const dataQuality = {
                completeness: signalPack.dataQuality.completeness,
                freshness: signalPack.dataQuality.freshness,
              };

              if (this.memoryDb.shouldRenew(dataQuality)) {
                const snapshot = this.memoryDb.renew(
                  { signalPack, scoreCard, patternResult, decisionResult },
                  dataQuality,
                  context.traceId
                );
                await this.memoryDb.compress(snapshot);
              }

              state.phase = "chaos_gate";
              const { passed, report } = await runChaosGate(context.traceId);
              state.chaosPassed = passed;
              state.chaosReportHash = report.auditHashChain;

              this.memoryLog.append({
                traceId: context.traceId,
                timestamp: context.timestamp,
                stage: "orchestrator_complete",
                decisionHash: hashDecision({ scoreCard, patternResult }),
                resultHash: hashResult({ decisionResult }),
                input: { intentSpec, signalPack },
                output: { scoreCard, patternResult, decisionResult },
              });

              state.phase = "memory_log";
              return { payload: { passed, report } };
            },
            execute: async (context) => {
              if (!decisionResult) {
                throw new Error("ORCHESTRATOR_COORDINATOR_MISSING_DECISION_RESULT");
              }

              state.phase = "focused_tx";
              const reviewGateApproved = reviewGate ? await reviewGate(decisionResult) : true;
              state.reviewGateApproved = reviewGateApproved;

              if (!this.dryRun && this.idempotencyStore) {
                const idemKey = intentSpec.idempotencyKey ?? context.traceId;
                const exists = await this.idempotencyStore.has(idemKey);
                if (exists) {
                  throw new Error(`${IDEMPOTENCY_REPLAY_BLOCK}: ${idemKey}`);
                }
              }

              const liveAllowDecision = !this.dryRun && decisionResult.decision === "allow";
              if (liveAllowDecision && !reviewGateApproved) {
                throw new Error("Fail-closed: review gate rejected allow-decision execution");
              }
              if (liveAllowDecision && !focusedTx) {
                throw new Error("Fail-closed: focusedTx handler required for allow-decision execution");
              }
              if (liveAllowDecision && !secretsVault) {
                throw new Error("Fail-closed: secretsVault handler required for allow-decision execution");
              }

              const shouldExecuteTx =
                !isKillSwitchHalted() &&
                liveAllowDecision &&
                reviewGateApproved &&
                focusedTx &&
                secretsVault;
              state.focusedTxExecuted = Boolean(shouldExecuteTx);

              if (shouldExecuteTx) {
                const secretLease = ensureValidVaultLease(await secretsVault!());
                await focusedTx(decisionResult, secretLease);
                if (this.idempotencyStore) {
                  const idemKey = intentSpec.idempotencyKey ?? context.traceId;
                  await this.idempotencyStore.put(idemKey, { executed: true }, 86_400_000);
                }
              }

              return { payload: { reviewGateApproved, focusedTxExecuted: state.focusedTxExecuted } };
            },
            journal: async () => {
              if (!decisionResult) {
                throw new Error("ORCHESTRATOR_COORDINATOR_MISSING_JOURNAL_STATE");
              }

              state.nextAction = lookupActionHandbook({
                phase: state.phase,
                decision: decisionResult.decision,
                dryRun: this.dryRun,
                focusedTxExecuted: Boolean(state.focusedTxExecuted),
              });
              state.phase = "focused_tx";
              return { payload: { nextAction: state.nextAction } };
            },
            monitor: async () => {
              state.phase = "focused_tx";
              return { payload: { phase: state.phase } };
            },
          },
        }),
        "orchestrator"
      );

      state.decisionEnvelope = envelope;
      state.phase = mapDecisionStageToOrchestratorPhase(envelope.stage);
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

function computeRiskBreakdown(
  traceId: string,
  timestamp: string,
  signalPack: SignalPack,
  scoreCard: ScoreCard
): RiskBreakdown {
  const liq = signalPack.signals.reduce((s, x) => s + (x.liquidity ?? 0), 0) || 10000;
  const vol = signalPack.signals.reduce((s, x) => s + (x.volume24h ?? 0), 0) || 1000;
  const liquidity = computeLiquidityRisk(liq, vol);
  const socialManip = computeSocialManipRisk(0, vol / 1000);
  const momentumExhaust = computeMomentumExhaustRisk(scoreCard.hybrid, -0.1);
  const structuralWeakness = computeStructuralWeaknessRisk(
    signalPack.sources.length,
    scoreCard.doublePenaltyApplied ? 0.5 : 0.1
  );
  return aggregateRisk({
    traceId,
    timestamp,
    liquidity,
    socialManip,
    momentumExhaust,
    structuralWeakness,
  });
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

function mapDecisionStageToOrchestratorPhase(stage: DecisionStage): OrchestratorPhase {
  switch (stage) {
    case "ingest":
      return "research";
    case "signal":
      return "analyse";
    case "reasoning":
      return "reasoning";
    case "risk":
      return "chaos_gate";
    case "execute":
    case "verify":
    case "journal":
    case "monitor":
      return "focused_tx";
  }
}
