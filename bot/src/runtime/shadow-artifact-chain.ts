/**
 * Runtime shadow artifact chain (PR-M1-01).
 * Derived-only parity scaffold; never authority-canonical.
 * Provenance/support context only, not canonical decision history.
 */
import type { MarketSnapshot } from "../core/contracts/market.js";
import type { WalletSnapshot } from "../core/contracts/wallet.js";
import { createSourceObservation } from "../discovery/source-observation.js";
import { buildDiscoveryEvidence } from "../discovery/discovery-evidence.js";
import { createCandidateToken } from "../discovery/candidate-discovery.js";
import { buildUniverseResult } from "../intelligence/universe/build-universe-result.js";
import { buildDataQualityV1 } from "../intelligence/quality/build-data-quality.js";
import { buildCQDSnapshotV1 } from "../intelligence/cqd/build-cqd.js";
import {
  buildSignalPackV1,
  buildTrendReversalMonitorInputV1,
} from "../intelligence/forensics/build-signal-pack.js";
import { buildTrendReversalObservationV1 } from "../intelligence/forensics/trend-reversal-monitor-worker.js";
import { buildConstructedSignalSetV1 } from "../intelligence/signals/build-constructed-signal-set.js";
import { buildScoreCardV1 } from "../intelligence/scoring/build-score-card.js";
import type {
  RuntimeCycleShadowArtifactChainSummary,
  RuntimeShadowArtifactFailureStage,
} from "../persistence/runtime-cycle-summary-repository.js";

export interface RuntimeAuthorityParityInput {
  blocked: boolean;
  blockedReason?: string;
  signalDirection?: string;
  signalConfidence?: number;
  tradeIntentId?: string;
}

export interface BuildRuntimeShadowArtifactChainInput {
  mode: "dry" | "paper" | "live";
  traceId: string;
  cycleTimestamp: string;
  market?: MarketSnapshot;
  wallet?: WalletSnapshot;
  oldAuthority: RuntimeAuthorityParityInput;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function parseTimestampMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function walletFreshnessMs(input: BuildRuntimeShadowArtifactChainInput): number {
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

function compactSummary(input: {
  status: RuntimeCycleShadowArtifactChainSummary["status"];
  oldAuthority: RuntimeAuthorityParityInput;
  failureStage?: RuntimeShadowArtifactFailureStage;
  failureReason?: string;
  sourceObservationRefs?: string[];
  staleSources?: string[];
  discoveryEvidenceRef?: string;
  discoveryEvidenceHash?: string;
  qualityStatus?: "pass" | "degraded" | "fail";
  qualityReasonCodes?: string[];
  qualityMissingCriticalFields?: string[];
  qualityStaleSources?: string[];
  qualityCrossSourceConfidence?: number;
  cqdHash?: string;
  cqdAnomalyFlags?: string[];
  cqdStageError?: string;
  constructedSignalSetPayloadHash?: string;
  constructedSignalSetBuildStatus?: "built" | "degraded" | "invalidated";
  scoreCardPayloadHash?: string;
  scoreCardBuildStatus?: "built" | "degraded" | "invalidated";
  scoreComposite?: number | null;
  scoreConfidence?: number | null;
  inputRefs?: string[];
  evidenceRefs?: string[];
}): RuntimeCycleShadowArtifactChainSummary {
  const shadowBlocked =
    input.status === "blocked" || input.status === "error" || input.qualityStatus === "fail";
  const oldConfidence = input.oldAuthority.signalConfidence;
  const newConfidence = typeof input.scoreConfidence === "number" ? input.scoreConfidence : null;

  return {
    artifactMode: "shadow",
    derivedOnly: true,
    nonAuthoritative: true,
    authorityInfluence: false,
    canonicalDecisionHistory: false,
    chainVersion: "shadow_artifact_chain.v1",
    status: input.status,
    failureStage: input.failureStage,
    failureReason: input.failureReason,
    inputRefs: uniqueSorted(input.inputRefs ?? []),
    evidenceRefs: uniqueSorted(input.evidenceRefs ?? []),
    parity: {
      oldAuthority: {
        blocked: input.oldAuthority.blocked,
        blockedReason: input.oldAuthority.blockedReason,
        signalDirection: input.oldAuthority.signalDirection,
        signalConfidence: input.oldAuthority.signalConfidence,
        tradeIntentId: input.oldAuthority.tradeIntentId,
      },
      shadowDerived: {
        blocked: shadowBlocked,
        qualityStatus: input.qualityStatus,
        scoreComposite: input.scoreComposite ?? null,
        scoreConfidence: input.scoreConfidence ?? null,
        cqdHash: input.cqdHash,
      },
      deltas: {
        blockedMismatch: shadowBlocked !== input.oldAuthority.blocked,
        confidenceDelta:
          typeof oldConfidence === "number" && typeof newConfidence === "number"
            ? newConfidence - oldConfidence
            : null,
      },
    },
    artifacts: {
      sourceObservationCount: input.sourceObservationRefs?.length ?? 0,
      sourceObservationRefs: uniqueSorted(input.sourceObservationRefs ?? []),
      staleSources: uniqueSorted(input.staleSources ?? []),
      discoveryEvidenceRef: input.discoveryEvidenceRef,
      discoveryEvidenceHash: input.discoveryEvidenceHash,
      qualityStatus: input.qualityStatus,
      qualityReasonCodes: uniqueSorted(input.qualityReasonCodes ?? []),
      qualityMissingCriticalFields: uniqueSorted(input.qualityMissingCriticalFields ?? []),
      qualityStaleSources: uniqueSorted(input.qualityStaleSources ?? []),
      qualityCrossSourceConfidence: input.qualityCrossSourceConfidence,
      cqdHash: input.cqdHash,
      cqdAnomalyFlags: uniqueSorted(input.cqdAnomalyFlags ?? []),
      cqdStageError: input.cqdStageError,
      constructedSignalSetPayloadHash: input.constructedSignalSetPayloadHash,
      constructedSignalSetBuildStatus: input.constructedSignalSetBuildStatus,
      scoreCardPayloadHash: input.scoreCardPayloadHash,
      scoreCardBuildStatus: input.scoreCardBuildStatus,
    },
  };
}

export function buildRuntimeShadowArtifactChain(
  input: BuildRuntimeShadowArtifactChainInput
): RuntimeCycleShadowArtifactChainSummary {
  if (!input.market || !input.wallet) {
    return compactSummary({
      status: "skipped",
      failureStage: "input_intake",
      failureReason: "SHADOW_CHAIN_SKIPPED:missing_runtime_intake",
      oldAuthority: input.oldAuthority,
      inputRefs: [`runtime_trace:${input.traceId}`, `runtime_mode:${input.mode}`],
    });
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
        netFlowUsd: 0,
        relativeVolumePct: 1,
        drawdownPct: 0,
        rangePct: 0.01,
        reclaimGapPct: 0,
        higherLowPct: 0,
        lowerHighPct: 0,
      },
      rawRef: `market:${input.market.traceId}`,
      notes: ["runtime_market_intake"],
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
        netFlowUsd: 0,
        relativeVolumePct: 1,
        drawdownPct: 0,
        rangePct: 0.01,
        reclaimGapPct: 0,
        higherLowPct: 0,
        lowerHighPct: 0,
      },
      rawRef: `wallet:${input.wallet.traceId}`,
      notes: ["runtime_wallet_intake"],
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
        net_flow_usd: 0,
        relative_volume_pct: 1,
        drawdown_pct: 0,
        range_pct: 0.01,
        reclaim_gap_pct: 0,
        higher_low_pct: 0,
        lower_high_pct: 0,
        liquidity_score: Math.max(0, Math.min(1, input.market.liquidity / 1_000_000)),
      },
    });
    const dataQuality = buildDataQualityV1({
      evidence: discoveryEvidence,
      candidates: [candidateToken],
      universe: universeBuildResult,
      traceId: `shadow-data-quality:${input.traceId}`,
      timestamp: input.cycleTimestamp,
    });

    let cqdSnapshot: ReturnType<typeof buildCQDSnapshotV1>;
    try {
      cqdSnapshot = buildCQDSnapshotV1({
        evidence: discoveryEvidence,
        candidates: [candidateToken],
        universe: universeBuildResult,
        quality: dataQuality,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return compactSummary({
        status: "blocked",
        failureStage: "cqd_snapshot",
        failureReason: reason,
        oldAuthority: input.oldAuthority,
        sourceObservationRefs: sourceObservations.map((observation) => observation.rawRef ?? observation.payloadHash),
        staleSources: sourceObservations.filter((observation) => observation.isStale).map((observation) => observation.source),
        discoveryEvidenceRef: discoveryEvidence.evidenceRef,
        discoveryEvidenceHash: discoveryEvidence.payloadHash,
        qualityStatus: dataQuality.status,
        qualityReasonCodes: dataQuality.reasonCodes,
        qualityMissingCriticalFields: dataQuality.missingCriticalFields,
        qualityStaleSources: dataQuality.staleSources,
        qualityCrossSourceConfidence: dataQuality.crossSourceConfidence,
        cqdStageError: reason,
        inputRefs: [
          `runtime_trace:${input.traceId}`,
          `market:${input.market.traceId}`,
          `wallet:${input.wallet.traceId}`,
        ],
        evidenceRefs: [discoveryEvidence.evidenceRef],
      });
    }

    const signalPack = buildSignalPackV1({
      token: discoveryEvidence.token,
      chain: "solana",
      traceId: `shadow-signal-pack:${input.traceId}`,
      timestamp: input.cycleTimestamp,
      dataQuality,
      cqdSnapshot,
      evidenceRefs: [discoveryEvidence.evidenceRef],
      notes: [`runtime_mode:${input.mode}`],
    });
    const trendReversalObservation = buildTrendReversalObservationV1(
      buildTrendReversalMonitorInputV1({
        token: discoveryEvidence.token,
        chain: "solana",
        traceId: `shadow-trend-monitor:${input.traceId}`,
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
      })
    );
    const constructedSignalSet = buildConstructedSignalSetV1({
      token: discoveryEvidence.token,
      chain: "solana",
      traceId: `shadow-constructed-signals:${input.traceId}`,
      timestamp: input.cycleTimestamp,
      dataQuality,
      cqdSnapshot,
      signalPack,
      trendReversalObservation,
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
    const shadowBlocked =
      dataQuality.status === "fail" ||
      !dataQuality.routeViable ||
      !dataQuality.liquidityEligible ||
      constructedSignalSet.buildStatus === "invalidated" ||
      scoreCard.buildStatus === "invalidated";

    return compactSummary({
      status: shadowBlocked ? "blocked" : "built",
      oldAuthority: input.oldAuthority,
      sourceObservationRefs: sourceObservations.map((observation) => observation.rawRef ?? observation.payloadHash),
      staleSources: sourceObservations.filter((observation) => observation.isStale).map((observation) => observation.source),
      discoveryEvidenceRef: discoveryEvidence.evidenceRef,
      discoveryEvidenceHash: discoveryEvidence.payloadHash,
      qualityStatus: dataQuality.status,
      qualityReasonCodes: dataQuality.reasonCodes,
      qualityMissingCriticalFields: dataQuality.missingCriticalFields,
      qualityStaleSources: dataQuality.staleSources,
      qualityCrossSourceConfidence: dataQuality.crossSourceConfidence,
      cqdHash: cqdSnapshot.hash,
      cqdAnomalyFlags: cqdSnapshot.anomaly_flags,
      constructedSignalSetPayloadHash: constructedSignalSet.payloadHash,
      constructedSignalSetBuildStatus: constructedSignalSet.buildStatus,
      scoreCardPayloadHash: scoreCard.payloadHash,
      scoreCardBuildStatus: scoreCard.buildStatus,
      scoreComposite: scoreCard.aggregateScores.composite,
      scoreConfidence: scoreCard.confidence,
      inputRefs: uniqueSorted([
        `runtime_trace:${input.traceId}`,
        `market:${input.market.traceId}`,
        `wallet:${input.wallet.traceId}`,
        ...constructedSignalSet.inputRefs,
        ...scoreCard.inputRefs,
      ]),
      evidenceRefs: uniqueSorted([
        discoveryEvidence.evidenceRef,
        ...cqdSnapshot.evidence_pack,
        ...constructedSignalSet.evidenceRefs,
        ...scoreCard.evidenceRefs,
      ]),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return compactSummary({
      status: "error",
      failureStage: "source_observation",
      failureReason: reason,
      oldAuthority: input.oldAuthority,
      inputRefs: [`runtime_trace:${input.traceId}`],
    });
  }
}
