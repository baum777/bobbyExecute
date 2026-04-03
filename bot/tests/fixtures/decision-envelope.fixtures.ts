import { FakeClock } from "../../src/core/clock.js";
import { createCanonicalDecisionAuthority, type DecisionCoordinator, type DecisionEnvelope, type DecisionStage } from "../../src/core/decision/index.js";
import type { MarketSnapshot } from "../../src/core/contracts/market.js";
import type { WalletSnapshot } from "../../src/core/contracts/wallet.js";
import type { SignalPack } from "../../src/core/contracts/signalpack.js";
import type { ScoreCard } from "../../src/core/contracts/scorecard.js";
import type { PatternResult } from "../../src/core/contracts/pattern.js";
import type { RiskBreakdown } from "../../src/core/contracts/riskbreakdown.js";
import type { DecisionResult } from "../../src/core/contracts/decisionresult.js";
import type { TradeIntent, ExecutionReport, RpcVerificationReport } from "../../src/core/contracts/trade.js";

export const SHARED_DECISION_TIMESTAMP = "2026-03-17T12:00:00.000Z";
export const SHARED_DECISION_TRACE_ID = "shared-decision-trace";
export const RUNTIME_PHASE1_BLOCK_REASON = "RUNTIME_PHASE1_FAIL_CLOSED_UNTIL_PIPELINE_WIRED";

export interface DecisionEnvelopeFixtureSet {
  clock: FakeClock;
  timestamp: string;
  traceId: string;
  market: MarketSnapshot;
  wallet: WalletSnapshot;
  signal: { direction: "buy"; confidence: number };
  signalPack: SignalPack;
  scoreCard: ScoreCard;
  patternResult: PatternResult;
  riskBreakdown: RiskBreakdown;
  tradeIntent: TradeIntent;
  decisionResultAllow: DecisionResult;
  decisionResultDeny: DecisionResult;
  executionReport: ExecutionReport;
  rpcVerificationReport: RpcVerificationReport;
  allowEnvelope: DecisionEnvelope;
  denyEnvelope: DecisionEnvelope;
  invalidEnvelopes: unknown[];
}

export interface DecisionEnvelopeSemantics {
  traceId: string;
  stage: DecisionEnvelope["stage"];
  blocked: boolean;
  blockedReason?: string;
  decisionHash: string;
  resultHash: string;
}

export function decisionEnvelopeSemantics(envelope: DecisionEnvelope | null | undefined): DecisionEnvelopeSemantics | null {
  if (!envelope) {
    return null;
  }

  return {
    traceId: envelope.traceId,
    stage: envelope.stage,
    blocked: envelope.blocked,
    blockedReason: envelope.blockedReason,
    decisionHash: envelope.decisionHash,
    resultHash: envelope.resultHash,
  };
}

export async function buildDecisionEnvelopeFixtureSet(): Promise<DecisionEnvelopeFixtureSet> {
  const clock = new FakeClock(SHARED_DECISION_TIMESTAMP);
  const timestamp = clock.now().toISOString();
  const traceId = SHARED_DECISION_TRACE_ID;

  const market: MarketSnapshot = {
    schema_version: "market.v1",
    traceId,
    timestamp,
    source: "dexpaprika",
    poolId: "shared-pool",
    baseToken: "SOL",
    quoteToken: "USDC",
    priceUsd: 100,
    volume24h: 1_000,
    liquidity: 1_000_000,
    freshnessMs: 0,
    status: "ok",
  };

  const wallet: WalletSnapshot = {
    traceId,
    timestamp,
    source: "moralis",
    walletAddress: "11111111111111111111111111111111",
    balances: [
      {
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        decimals: 9,
        amount: "1",
        amountUsd: 100,
      },
    ],
    totalUsd: 100,
  };

  const signal = { direction: "buy" as const, confidence: 0.91 };
  const signalPack: SignalPack = {
    traceId,
    timestamp,
    signals: [
      {
        source: "paprika",
        timestamp,
        baseToken: "SOL",
        quoteToken: "USDC",
        priceUsd: 100,
        volume24h: 1_000,
        liquidity: 100_000,
      },
    ],
    dataQuality: {
      completeness: 1,
      freshness: 1,
      sourceReliability: 1,
    },
    sources: ["paprika"],
  };

  const scoreCard: ScoreCard = {
    traceId,
    timestamp,
    mci: 0.7,
    bci: 0.5,
    hybrid: 0.8,
    crossSourceConfidenceScore: 0.95,
    ageAdjusted: true,
    doublePenaltyApplied: false,
    version: "1.0",
    decisionHash: "score-card-hash",
  };

  const patternResult: PatternResult = {
    traceId,
    timestamp,
    patterns: ["smart_money_fakeout"],
    flags: ["shared-fixture"],
    confidence: 0.94,
    evidence: [
      {
        id: "pattern-evidence-1",
        hash: "pattern-evidence-hash-1",
      },
    ],
  };

  const riskBreakdown: RiskBreakdown = {
    traceId,
    timestamp,
    liquidity: 0.05,
    socialManip: 0.08,
    momentumExhaust: 0.12,
    structuralWeakness: 0.04,
    aggregate: 0.12,
    capsApplied: ["shared-cap"],
  };

  const tradeIntent: TradeIntent = {
    traceId,
    timestamp,
    idempotencyKey: `${traceId}-intent`,
    tokenIn: "SOL",
    tokenOut: "USDC",
    amountIn: "1",
    minAmountOut: "0.95",
    slippagePercent: 1,
    dryRun: true,
    executionMode: "dry",
  };

  const decisionResultAllow: DecisionResult = {
    traceId,
    timestamp,
    decision: "allow",
    direction: "buy",
    confidence: 0.93,
    evidence: [
      {
        id: "decision-evidence-1",
        hash: "decision-evidence-hash-1",
        type: "pattern",
      },
    ],
    decisionHash: "decision-result-allow-hash",
    rationale: "shared-allow-fixture",
  };

  const decisionResultDeny: DecisionResult = {
    traceId,
    timestamp,
    decision: "deny",
    direction: "buy",
    confidence: 0.93,
    evidence: [
      {
        id: "decision-evidence-1",
        hash: "decision-evidence-hash-1",
        type: "pattern",
      },
    ],
    decisionHash: "decision-result-deny-hash",
    rationale: "shared-deny-fixture",
  };

  const executionReport: ExecutionReport = {
    traceId,
    timestamp,
    tradeIntentId: tradeIntent.idempotencyKey,
    success: true,
    dryRun: true,
    executionMode: "paper",
    paperExecution: true,
    actualAmountOut: tradeIntent.minAmountOut,
  };

  const rpcVerificationReport: RpcVerificationReport = {
    traceId,
    timestamp,
    passed: true,
    checks: { quoteInputs: true },
    reason: "PAPER_MODE_SIMULATED_VERIFICATION",
    verificationMode: "paper-simulated",
  };

  const coordinator = createCanonicalDecisionAuthority();

  const allowEnvelope = await coordinator.run({
    entrypoint: "engine",
    flow: "trade",
    executionMode: "dry",
    clock,
    traceIdSeed: "shared-allow",
    tracePrefix: "shared",
    handlers: {
      ingest: async () => ({ payload: { market, wallet } }),
      signal: async () => ({ payload: { signal, tradeIntent } }),
      risk: async () => ({ payload: { allowed: true, reason: undefined } }),
      execute: async () => ({ payload: { executionReport } }),
      verify: async () => ({ payload: { rpcVerificationReport } }),
      journal: async () => ({ payload: { journal: "complete" } }),
      monitor: async () => ({ payload: { stage: "monitor" } }),
    },
  });

  const denyEnvelope = await coordinator.run({
    entrypoint: "orchestrator",
    flow: "analysis",
    executionMode: "dry",
    clock,
    traceIdSeed: "shared-deny",
    tracePrefix: "shared",
    handlers: {
      ingest: async () => ({ payload: { signalPack } }),
      signal: async () => ({ payload: { scoreCard } }),
      reasoning: async () => ({ payload: { patternResult, riskBreakdown, decisionResult: decisionResultDeny } }),
      risk: async () => ({
        blocked: true,
        blockedReason: RUNTIME_PHASE1_BLOCK_REASON,
        payload: { allowed: false, reason: RUNTIME_PHASE1_BLOCK_REASON },
      }),
      journal: async () => ({ payload: { journal: "blocked" } }),
      monitor: async () => ({ payload: { stage: "monitor" } }),
    },
  });

  return {
    clock,
    timestamp,
    traceId,
    market,
    wallet,
    signal,
    signalPack,
    scoreCard,
    patternResult,
    riskBreakdown,
    tradeIntent,
    decisionResultAllow,
    decisionResultDeny,
    executionReport,
    rpcVerificationReport,
    allowEnvelope,
    denyEnvelope,
    invalidEnvelopes: [
      {
        ...allowEnvelope,
        resultHash: undefined,
      },
      {
        ...allowEnvelope,
        blocked: "false",
      },
      {
        ...denyEnvelope,
        stage: "invalid-stage",
      },
    ],
  };
}

export function makeEnvelopeRelayCoordinator(envelope: DecisionEnvelope): DecisionCoordinator {
  return {
    async run(request) {
      const timestamp = request.clock.now().toISOString();
      const traceId = envelope.traceId;
      const stages: DecisionStage[] = [
        "ingest",
        "signal",
        "reasoning",
        "risk",
        "execute",
        "verify",
        "journal",
        "monitor",
      ];

      for (const stage of stages) {
        const handler = request.handlers[stage];
        if (!handler) {
          continue;
        }

        const outcome = await handler({
          entrypoint: request.entrypoint,
          flow: request.flow,
          stage,
          traceId,
          timestamp,
        });

        if (outcome?.blocked) {
          break;
        }

        if (envelope.blocked && stage === "risk") {
          break;
        }
      }

      const base = { ...envelope, entrypoint: request.entrypoint, flow: request.flow, traceId };
      if (envelope.schemaVersion === "decision.envelope.v3") {
        return {
          ...base,
          executionMode: request.executionMode ?? envelope.executionMode,
        };
      }
      return {
        ...base,
        executionMode: request.executionMode ?? (envelope as { executionMode?: string }).executionMode ?? "dry",
      };
    },
  };
}
