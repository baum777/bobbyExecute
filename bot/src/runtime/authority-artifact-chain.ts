/**
 * Canonical runtime authority chain after PR-M1-02 cutover.
 *
 * This helper drives runtime authority from the surviving deterministic chain:
 * SourceObservation -> DiscoveryEvidence -> CandidateToken -> UniverseBuildResult ->
 * DataQualityV1 -> CQDSnapshotV1 -> ConstructedSignalSetV1 -> ScoreCardV1.
 *
 * Sidecars remain out of the authority path. The chain may still use internal
 * deterministic bridge artifacts required by existing builders, but it never
 * delegates authority to legacy scoring/signal modules.
 */
import { hashDecision } from "../core/determinism/hash.js";
import type { MarketSnapshot } from "../core/contracts/market.js";
import type { WalletSnapshot } from "../core/contracts/wallet.js";
import type { TradeIntent } from "../core/contracts/trade.js";
import type { CQDSnapshotV1 } from "../core/contracts/cqd.js";
import { createSourceObservation } from "../discovery/source-observation.js";
import { buildDiscoveryEvidence } from "../discovery/discovery-evidence.js";
import { createCandidateToken } from "../discovery/candidate-discovery.js";
import { buildUniverseResult } from "../intelligence/universe/build-universe-result.js";
import { buildDataQualityV1 } from "../intelligence/quality/build-data-quality.js";
import { buildCQDSnapshotV1 } from "../intelligence/cqd/build-cqd.js";
import { buildSignalPackV1 } from "../intelligence/forensics/build-signal-pack.js";
import { buildConstructedSignalSetV1 } from "../intelligence/signals/build-constructed-signal-set.js";
import { buildScoreCardV1 } from "../intelligence/scoring/build-score-card.js";
import { runRiskEngine } from "../risk/risk-engine.js";
import type {
  RuntimeCycleAuthorityArtifactChainSummary,
  RuntimeAuthorityArtifactFailureStage,
  RuntimeAuthorityArtifactStatus,
} from "../persistence/runtime-cycle-summary-repository.js";

export interface BuildRuntimeAuthorityArtifactChainInput {
  mode: "dry" | "paper" | "live";
  traceId: string;
  cycleTimestamp: string;
  market?: MarketSnapshot;
  wallet?: WalletSnapshot;
}

export interface RuntimeAuthorityArtifactResolution {
  summary: RuntimeCycleAuthorityArtifactChainSummary;
  blocked: boolean;
  blockedReason?: string;
  signal?: {
    direction: "buy" | "hold";
    confidence: number;
    cqd?: CQDSnapshotV1;
  };
  intent?: TradeIntent;
  riskInput?: Parameters<typeof runRiskEngine>[0];
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseTimestampMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function walletFreshnessMs(input: BuildRuntimeAuthorityArtifactChainInput): number {
  if (!input.wallet) {
    return 0;
  }

  const cycleMs = parseTimestampMs(input.cycleTimestamp);
  const walletMs = parseTimestampMs(input.wallet.timestamp);
  if (cycleMs <= 0 || walletMs <= 0) {
    return 0;
  }

  return Math.max(0, cycleMs - walletMs);
}

function sumWalletUsd(wallet: WalletSnapshot): number {
  if (typeof wallet.totalUsd === "number" && Number.isFinite(wallet.totalUsd)) {
    return wallet.totalUsd;
  }
  return wallet.balances.reduce((sum, balance) => {
    return sum + (typeof balance.amountUsd === "number" && Number.isFinite(balance.amountUsd) ? balance.amountUsd : 0);
  }, 0);
}

function holderConcentrationPct(wallet: WalletSnapshot): number {
  const totalUsd = sumWalletUsd(wallet);
  if (totalUsd <= 0 || wallet.balances.length === 0) {
    return 0;
  }

  const largest = wallet.balances.reduce((max, balance) => {
    const usd = typeof balance.amountUsd === "number" && Number.isFinite(balance.amountUsd) ? balance.amountUsd : 0;
    return Math.max(max, usd);
  }, 0);

  return Math.max(0, Math.min(1, largest / totalUsd));
}

function buildBlockedSummary(input: {
  status: RuntimeAuthorityArtifactStatus;
  failureStage: RuntimeAuthorityArtifactFailureStage;
  failureReason: string;
  traceId: string;
  mode: BuildRuntimeAuthorityArtifactChainInput["mode"];
  inputRefs?: string[];
  evidenceRefs?: string[];
  sourceObservationRefs?: string[];
  discoveryEvidenceRef?: string;
  discoveryEvidenceHash?: string;
  dataQuality?: ReturnType<typeof buildDataQualityV1>;
  cqdHash?: string;
  cqdAnomalyFlags?: string[];
  cqdStageError?: string;
}): RuntimeCycleAuthorityArtifactChainSummary {
  return {
    artifactMode: "authority",
    derivedOnly: false,
    nonAuthoritative: false,
    authorityInfluence: true,
    canonicalDecisionHistory: false,
    chainVersion: "authority_artifact_chain.v1",
    status: input.status,
    failureStage: input.failureStage,
    failureReason: input.failureReason,
    inputRefs: uniqueSorted(input.inputRefs ?? [`runtime_trace:${input.traceId}`, `runtime_mode:${input.mode}`]),
    evidenceRefs: uniqueSorted(input.evidenceRefs ?? []),
    decision: {
      blocked: true,
      blockedReason: input.failureReason,
    },
    artifacts: {
      sourceObservationCount: input.sourceObservationRefs?.length ?? 0,
      sourceObservationRefs: uniqueSorted(input.sourceObservationRefs ?? []),
      discoveryEvidenceRef: input.discoveryEvidenceRef,
      discoveryEvidenceHash: input.discoveryEvidenceHash,
      dataQualityStatus: input.dataQuality?.status,
      dataQualityReasonCodes: input.dataQuality?.reasonCodes ? uniqueSorted(input.dataQuality.reasonCodes) : undefined,
      dataQualityMissingCriticalFields: input.dataQuality?.missingCriticalFields
        ? uniqueSorted(input.dataQuality.missingCriticalFields)
        : undefined,
      dataQualityStaleSources: input.dataQuality?.staleSources ? uniqueSorted(input.dataQuality.staleSources) : undefined,
      dataQualityCrossSourceConfidence: input.dataQuality?.crossSourceConfidence,
      cqdHash: input.cqdHash,
      cqdAnomalyFlags: input.cqdAnomalyFlags ? uniqueSorted(input.cqdAnomalyFlags) : undefined,
      cqdStageError: input.cqdStageError,
    },
  };
}

export function buildRuntimeAuthorityArtifactChain(
  input: BuildRuntimeAuthorityArtifactChainInput
): RuntimeAuthorityArtifactResolution {
  if (!input.market || !input.wallet) {
    const summary = buildBlockedSummary({
      status: "skipped",
      failureStage: "input_intake",
      failureReason: "AUTHORITY_CHAIN_SKIPPED:missing_runtime_intake",
      traceId: input.traceId,
      mode: input.mode,
      inputRefs: [`runtime_trace:${input.traceId}`, `runtime_mode:${input.mode}`],
    });
    return {
      summary,
      blocked: true,
      blockedReason: summary.failureReason,
    };
  }

  try {
    const cycleTimestampMs = parseTimestampMs(input.cycleTimestamp);
    const marketObservation = createSourceObservation({
      source: "market",
      token: input.market.baseToken,
      observedAtMs: cycleTimestampMs,
      freshnessMs: input.market.freshnessMs ?? 0,
      payload: {
        priceUsd: input.market.priceUsd,
        volume24h: input.market.volume24h,
        liquidityUsd: input.market.liquidity,
        holderCount: input.wallet.balances.length,
        holderConcentrationPct: holderConcentrationPct(input.wallet),
      },
      rawRef: `market:${input.market.traceId}`,
      notes: ["authority_market_intake"],
    });
    const walletObservation = createSourceObservation({
      source: "wallet",
      token: input.market.baseToken,
      observedAtMs: cycleTimestampMs,
      freshnessMs: walletFreshnessMs(input),
      payload: {
        priceUsd: input.market.priceUsd,
        volume24h: input.market.volume24h,
        liquidityUsd: input.market.liquidity,
        holderCount: input.wallet.balances.length,
        holderConcentrationPct: holderConcentrationPct(input.wallet),
      },
      rawRef: `wallet:${input.wallet.traceId}`,
      notes: ["authority_wallet_intake"],
    });
    const sourceObservations = [marketObservation, walletObservation];

    const discoveryEvidence = buildDiscoveryEvidence({
      token: input.market.baseToken,
      chain: "solana",
      observations: sourceObservations,
      collectedAtMs: cycleTimestampMs,
      knownRequiredFields: ["priceUsd", "volume24h", "liquidityUsd"],
      sourceFieldPresence: {
        market: ["priceUsd", "volume24h", "liquidityUsd", "holderCount", "holderConcentrationPct"],
        wallet: ["priceUsd", "volume24h", "liquidityUsd", "holderCount", "holderConcentrationPct"],
      },
      sourceDisagreements: {},
      notes: [`runtime_mode:${input.mode}`],
    });
    const candidateToken = createCandidateToken(discoveryEvidence, {
      symbol: input.market.baseToken,
    });
    const universeBuildResult = buildUniverseResult({
      token: discoveryEvidence.token,
      chain: "solana",
      observationsBySource: {
        market: marketObservation.isStale ? "STALE" : marketObservation.status,
        wallet: walletObservation.isStale ? "STALE" : walletObservation.status,
      },
      normalizedFeatures: {
        liquidityUsd: input.market.liquidity,
        volume_24h_usd: input.market.volume24h,
        price_usd: input.market.priceUsd,
        holder_count: input.wallet.balances.length,
        holder_concentration_pct: holderConcentrationPct(input.wallet),
        liquidity_score:
          typeof input.market.liquidity === "number" && Number.isFinite(input.market.liquidity)
            ? Math.max(0, Math.min(1, input.market.liquidity / 1_000_000))
            : 0,
        reclaim_gap_pct: input.market.priceUsd > 0 ? 0.02 : 0,
        higher_low_pct: input.market.priceUsd > 0 ? 0.03 : 0,
        relative_volume_pct: input.market.volume24h > 0 ? 1.2 : 0,
        volume_momentum_pct: input.market.volume24h > 0 ? 0.25 : 0,
        net_flow_usd: sumWalletUsd(input.wallet) > 0 ? sumWalletUsd(input.wallet) : 0,
        participation_pct: input.wallet.balances.length > 0 ? Math.min(1, input.wallet.balances.length / 10) : 0,
      },
    });
    const dataQuality = buildDataQualityV1({
      evidence: discoveryEvidence,
      candidates: [candidateToken],
      universe: universeBuildResult,
      traceId: `authority-data-quality:${input.traceId}`,
      timestamp: input.cycleTimestamp,
    });

    if (dataQuality.status === "fail" || !dataQuality.routeViable || !dataQuality.liquidityEligible) {
      const failureReason = `AUTHORITY_DATA_QUALITY_BLOCKED:${dataQuality.reasonCodes.join("+") || dataQuality.status}`;
      const summary = buildBlockedSummary({
        status: "blocked",
        failureStage: "data_quality",
        failureReason,
        traceId: input.traceId,
        mode: input.mode,
        inputRefs: [
          `runtime_trace:${input.traceId}`,
          `runtime_mode:${input.mode}`,
          `market:${input.market.traceId}`,
          `wallet:${input.wallet.traceId}`,
          `discovery_evidence:${discoveryEvidence.evidenceId}`,
          `data_quality:${dataQuality.traceId}`,
        ],
        evidenceRefs: [discoveryEvidence.evidenceRef],
        sourceObservationRefs: sourceObservations.map((observation) => observation.rawRef ?? observation.payloadHash),
        discoveryEvidenceRef: discoveryEvidence.evidenceRef,
        discoveryEvidenceHash: discoveryEvidence.payloadHash,
        dataQuality,
      });
      return {
        summary,
        blocked: true,
        blockedReason: failureReason,
      };
    }

    let cqdSnapshot: CQDSnapshotV1;
    try {
      cqdSnapshot = buildCQDSnapshotV1({
        evidence: discoveryEvidence,
        candidates: [candidateToken],
        universe: universeBuildResult,
        quality: dataQuality,
      });
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);
      const summary = buildBlockedSummary({
        status: "blocked",
        failureStage: "cqd_snapshot",
        failureReason,
        traceId: input.traceId,
        mode: input.mode,
        inputRefs: [
          `runtime_trace:${input.traceId}`,
          `runtime_mode:${input.mode}`,
          `market:${input.market.traceId}`,
          `wallet:${input.wallet.traceId}`,
          `discovery_evidence:${discoveryEvidence.evidenceId}`,
          `data_quality:${dataQuality.traceId}`,
        ],
        evidenceRefs: [discoveryEvidence.evidenceRef],
        sourceObservationRefs: sourceObservations.map((observation) => observation.rawRef ?? observation.payloadHash),
        discoveryEvidenceRef: discoveryEvidence.evidenceRef,
        discoveryEvidenceHash: discoveryEvidence.payloadHash,
        dataQuality,
        cqdStageError: failureReason,
      });
      return {
        summary,
        blocked: true,
        blockedReason: failureReason,
      };
    }

    const signalPack = buildSignalPackV1({
      token: discoveryEvidence.token,
      chain: "solana",
      traceId: `authority-signal-pack:${input.traceId}`,
      timestamp: input.cycleTimestamp,
      dataQuality,
      cqdSnapshot,
      evidenceRefs: [discoveryEvidence.evidenceRef],
      notes: [`runtime_mode:${input.mode}`],
    });
    const constructedSignalSet = buildConstructedSignalSetV1({
      token: discoveryEvidence.token,
      chain: "solana",
      traceId: `authority-constructed-signals:${input.traceId}`,
      timestamp: input.cycleTimestamp,
      dataQuality,
      cqdSnapshot,
      signalPack,
      contextAvailability: {
        supplementalHintsAvailable: true,
        missingSupplementalHints: [],
      },
      evidenceRefs: [discoveryEvidence.evidenceRef],
      notes: [`runtime_mode:${input.mode}`],
    });
    const scoreCard = buildScoreCardV1({
      constructedSignalSet,
    });

    const scoreComposite = scoreCard.aggregateScores.composite;
    const scoreConfidence = scoreCard.confidence ?? null;
    const constructive = scoreCard.aggregateScores.constructive ?? 0;
    const riskPressure = scoreCard.aggregateScores.riskPressure ?? 0;
    const confidenceValue = scoreConfidence ?? 0;
    const direction: "buy" | "hold" =
      scoreComposite !== null &&
      scoreComposite > 0 &&
      confidenceValue >= 0.35 &&
      constructive >= riskPressure
        ? "buy"
        : "hold";
    const blockedReason =
      direction === "hold"
        ? `AUTHORITY_NO_TRADE:composite=${scoreComposite ?? "null"}:confidence=${confidenceValue.toFixed(3)}`
        : undefined;

    const summaryInputRefs = uniqueSorted([
      `runtime_trace:${input.traceId}`,
      `runtime_mode:${input.mode}`,
      `market:${input.market.traceId}`,
      `wallet:${input.wallet.traceId}`,
      `discovery_evidence:${discoveryEvidence.evidenceId}`,
      `candidate_token:${candidateToken.token}:${candidateToken.firstSeenMs}`,
      `universe_build_result:${universeBuildResult.included ? "included" : "excluded"}`,
      `data_quality:${dataQuality.traceId}`,
      `cqd:${cqdSnapshot.hash}`,
      `constructed_signal_set:${constructedSignalSet.payloadHash}`,
      `score_card:${scoreCard.payloadHash}`,
    ]);
    const summaryEvidenceRefs = uniqueSorted([
      discoveryEvidence.evidenceRef,
      ...cqdSnapshot.evidence_pack,
      ...constructedSignalSet.evidenceRefs,
      ...scoreCard.evidenceRefs,
    ]);
    const summary: RuntimeCycleAuthorityArtifactChainSummary = {
      artifactMode: "authority",
      derivedOnly: false,
      nonAuthoritative: false,
      authorityInfluence: true,
      canonicalDecisionHistory: false,
      chainVersion: "authority_artifact_chain.v1",
      status: direction === "hold" ? "blocked" : "built",
      inputRefs: summaryInputRefs,
      evidenceRefs: summaryEvidenceRefs,
      decision: {
        blocked: direction === "hold",
        blockedReason,
        direction,
        confidence: confidenceValue,
        tradeIntentId: direction === "buy" ? `${input.traceId}-intent` : undefined,
      },
      artifacts: {
        sourceObservationCount: sourceObservations.length,
        sourceObservationRefs: sourceObservations.map((observation) => observation.rawRef ?? observation.payloadHash),
        discoveryEvidenceRef: discoveryEvidence.evidenceRef,
        discoveryEvidenceHash: discoveryEvidence.payloadHash,
        dataQualityStatus: dataQuality.status,
        dataQualityReasonCodes: uniqueSorted(dataQuality.reasonCodes),
        dataQualityMissingCriticalFields: uniqueSorted(dataQuality.missingCriticalFields),
        dataQualityStaleSources: uniqueSorted(dataQuality.staleSources),
        dataQualityCrossSourceConfidence: dataQuality.crossSourceConfidence,
        cqdHash: cqdSnapshot.hash,
        cqdAnomalyFlags: uniqueSorted(cqdSnapshot.anomaly_flags),
        constructedSignalSetPayloadHash: constructedSignalSet.payloadHash,
        constructedSignalSetBuildStatus: constructedSignalSet.buildStatus,
        scoreCardPayloadHash: scoreCard.payloadHash,
        scoreCardBuildStatus: scoreCard.buildStatus,
        scoreComposite,
        scoreConfidence,
      },
    };

    if (direction === "hold") {
      return {
        summary,
        blocked: true,
        blockedReason: blockedReason ?? "AUTHORITY_NO_TRADE",
      };
    }

    const intent: TradeIntent = {
      traceId: input.traceId,
      timestamp: input.cycleTimestamp,
      idempotencyKey: `${input.traceId}-intent`,
      tokenIn: input.market.baseToken,
      tokenOut: input.market.quoteToken === "USD" ? "USDC" : input.market.quoteToken,
      amountIn: "1",
      minAmountOut: String(input.market.priceUsd * 0.95),
      slippagePercent: 1,
      dryRun: input.mode !== "live",
      executionMode: input.mode,
    };

    const liquidityScore = universeBuildResult.normalizedFeatures.liquidity_score ?? 0;
    const riskInput = {
      traceId: input.traceId,
      timestamp: input.cycleTimestamp,
      liquidity: clamp01(1 - liquidityScore),
      socialManip: dataQuality.status === "pass" && cqdSnapshot.anomaly_flags.length === 0 ? 0.1 : 0.8,
      momentumExhaust: clamp01(1 - ((constructive + 1) / 2)),
      structuralWeakness: clamp01(Math.max(0, riskPressure * 0.5)),
    };

    return {
      summary,
      blocked: false,
      signal: {
        direction,
        confidence: confidenceValue,
        cqd: cqdSnapshot,
      },
      intent,
      riskInput,
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);
    const summary = buildBlockedSummary({
      status: "error",
      failureStage: "source_observation",
      failureReason,
      traceId: input.traceId,
      mode: input.mode,
    });
    return {
      summary,
      blocked: true,
      blockedReason: failureReason,
    };
  }
}
