/**
 * Pattern Engine - 8 feste Patterns (deterministisch).
 * Version: 1.1.0 | Owner: Kimi Swarm | Layer: patterns | Last Updated: 2026-03-04
 */
import { sha256 } from "../core/determinism/hash.js";
import { canonicalize } from "../core/determinism/canonicalize.js";
import type {
  MciBciScoreCard,
  MciBciSignal,
  MciBciSignalPack,
} from "../core/intelligence/mci-bci-formulas.js";
import type { PatternResult, PatternId, PatternEvidence } from "../core/contracts/pattern.js";
import { PATTERN_IDS } from "../core/contracts/pattern.js";

type PatternScoreCard = MciBciScoreCard;

interface PatternSignal extends MciBciSignal {
  source: string;
  volume24h?: number;
  liquidity?: number;
}

interface PatternSignalPack {
  signals: readonly PatternSignal[];
  sources: readonly string[];
  dataQuality: MciBciSignalPack["dataQuality"];
}

export function recognizePatterns(
  traceId: string,
  timestamp: string,
  scoreCard: PatternScoreCard,
  signalPack: PatternSignalPack
): PatternResult {
  const patterns: PatternId[] = [];
  const flags: string[] = [];
  const evidence: PatternEvidence[] = [];

  if (velocityLiquidityDivergence(scoreCard, signalPack)) {
    patterns.push("velocity_liquidity_divergence");
    flags.push("risk_velocity_liquidity_divergence");
    addEvidence(evidence, "vld", { scoreCard: scoreCard.hybrid, signals: signalPack.signals.length });
  }
  if (bundleSybilCluster(signalPack)) {
    patterns.push("bundle_sybil_cluster");
    flags.push("risk_bundle_sybil_cluster");
    addEvidence(evidence, "bsc", { signals: signalPack.signals.length });
  }
  if (narrativeShift(signalPack)) {
    patterns.push("narrative_shift");
    flags.push("risk_narrative_shift");
    addEvidence(evidence, "ns", { sources: signalPack.sources.length });
  }
  if (smartMoneyFakeout(scoreCard)) {
    patterns.push("smart_money_fakeout");
    flags.push("risk_smart_money_fakeout");
    addEvidence(evidence, "smf", { mci: scoreCard.mci, bci: scoreCard.bci });
  }
  if (earlyPumpRisk(scoreCard, signalPack)) {
    patterns.push("early_pump_risk");
    flags.push("risk_early_pump");
    addEvidence(evidence, "epr", { hybrid: scoreCard.hybrid });
  }
  if (sentimentStructuralMismatch(scoreCard)) {
    patterns.push("sentiment_structural_mismatch");
    flags.push("risk_sentiment_structural_mismatch");
    addEvidence(evidence, "ssm", { bci: scoreCard.bci, mci: scoreCard.mci });
  }
  if (crossSourceAnomaly(signalPack)) {
    patterns.push("cross_source_anomaly");
    flags.push("risk_cross_source_anomaly");
    addEvidence(evidence, "csa", { dataQuality: signalPack.dataQuality });
  }
  if (fragileExpansion(signalPack)) {
    patterns.push("fragile_expansion");
    flags.push("risk_fragile_expansion");
    addEvidence(evidence, "fe", { signals: signalPack.signals });
  }

  const confidence = patterns.length > 0
    ? Math.min(0.9, 0.3 + patterns.length * 0.1)
    : 0.5;

  return {
    traceId,
    timestamp,
    patterns,
    flags: flags.length > 0 ? flags : ["none"],
    confidence,
    evidence,
  };
}

function addEvidence(evidence: PatternEvidence[], id: string, payload: unknown): void {
  const hash = sha256(canonicalize(payload));
  evidence.push({ id: `ev-${id}-${hash.slice(0, 12)}`, hash });
}

function velocityLiquidityDivergence(scoreCard: PatternScoreCard, signalPack: PatternSignalPack): boolean {
  const hasVolume = signalPack.signals.some((s) => (s.volume24h ?? 0) > 0);
  const hasLiquidity = signalPack.signals.some((s) => (s.liquidity ?? 0) > 0);
  return hasVolume && !hasLiquidity && scoreCard.hybrid > 0.5;
}

function bundleSybilCluster(signalPack: PatternSignalPack): boolean {
  return signalPack.signals.length >= 5 && signalPack.sources.length >= 3;
}

function narrativeShift(signalPack: PatternSignalPack): boolean {
  const xSources = signalPack.sources.filter((s) => s.startsWith("x_tl"));
  return xSources.length >= 2 && signalPack.signals.length >= 4;
}

function smartMoneyFakeout(scoreCard: PatternScoreCard): boolean {
  const divergence = Math.abs(scoreCard.mci - scoreCard.bci);
  return divergence > 0.4 && scoreCard.mci * scoreCard.bci < 0;
}

function earlyPumpRisk(scoreCard: PatternScoreCard, signalPack: PatternSignalPack): boolean {
  const avgPrice = signalPack.signals.reduce((s, x) => s + x.priceUsd, 0) / Math.max(1, signalPack.signals.length);
  return scoreCard.hybrid > 0.7 && avgPrice < 0.01;
}

function sentimentStructuralMismatch(scoreCard: PatternScoreCard): boolean {
  return Math.abs(scoreCard.bci - scoreCard.mci) > 0.5;
}

function crossSourceAnomaly(signalPack: PatternSignalPack): boolean {
  const conf = signalPack.dataQuality.crossSourceConfidence ?? signalPack.dataQuality.sourceReliability ?? 0;
  return conf < 0.85 && signalPack.signals.length >= 2;
}

function fragileExpansion(signalPack: PatternSignalPack): boolean {
  const withLiquidity = signalPack.signals.filter((s) => (s.liquidity ?? 0) > 0);
  const totalLiq = withLiquidity.reduce((s, x) => s + (x.liquidity ?? 0), 0);
  return signalPack.signals.length > 3 && totalLiq < 10_000;
}

export { PATTERN_IDS };
