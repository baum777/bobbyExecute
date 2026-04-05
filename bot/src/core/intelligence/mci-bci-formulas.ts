/**
 * MCI/BCI/Hybrid Formeln - age-adjusted, double-penalty protected.
 * Version: 1.1.0 | Owner: Kimi Swarm | Layer: core/intelligence | Last Updated: 2026-03-05
 * Changes: Hybrid weights updated to 0.55/0.45 per Target Architecture
 */
// Local shape-only bridge so this formulas file stays off the frozen core-contract owners.
export interface MciBciSignal {
  timestamp: string;
  priceUsd: number;
}

export interface MciBciSignalPack {
  signals: readonly MciBciSignal[];
  dataQuality: {
    completeness: number;
    freshness: number;
    sourceReliability?: number;
    crossSourceConfidence?: number;
  };
}

export interface MciBciScoreCard {
  traceId: string;
  timestamp: string;
  mci: number;
  bci: number;
  hybrid: number;
  crossSourceConfidenceScore: number;
  ageAdjusted: boolean;
  doublePenaltyApplied: boolean;
  version: string;
  decisionHash?: string;
}

const AGE_DECAY_FACTOR = 0.01;
const DOUBLE_PENALTY_THRESHOLD = 0.3;

/**
 * Age-Adjusted MCI: Markt-Confidence mit Zeit-Decay.
 * Ältere Signale werden abgewertet.
 */
export function computeMciAgeAdjusted(
  baseMci: number,
  maxAgeSeconds: number,
  signalAgeSeconds: number
): number {
  if (maxAgeSeconds <= 0) return clamp(baseMci, -1, 1);
  const decay = Math.exp(-AGE_DECAY_FACTOR * (signalAgeSeconds / maxAgeSeconds));
  return clamp(baseMci * decay, -1, 1);
}

/**
 * Double-Penalty: Bei großer Inkonsistenz zwischen Quellen wird stärker bestraft.
 */
export function applyDoublePenalty(
  score: number,
  crossSourceVariance: number
): { score: number; applied: boolean } {
  if (crossSourceVariance > DOUBLE_PENALTY_THRESHOLD) {
    const penalty = 1 - Math.min(crossSourceVariance, 1);
    return { score: clamp(score * penalty, -1, 1), applied: true };
  }
  return { score: clamp(score, -1, 1), applied: false };
}

/**
 * Hybrid Score: Gewichtete Kombination MCI + BCI.
 * Target Architecture: 0.55 MCI / 0.45 BCI
 */
export function computeHybrid(
  mci: number,
  bci: number,
  mciWeight = 0.55,  // CHANGED from 0.6 to 0.55 per Target Architecture
  bciWeight = 0.45   // CHANGED from 0.4 to 0.45 per Target Architecture
): number {
  return clamp(mci * mciWeight + bci * bciWeight, -1, 1);
}

/**
 * Cross-Source Confidence aus SignalPack.
 */
export function computeCrossSourceConfidence(signalPack: MciBciSignalPack): number {
  const n = signalPack.signals.length;
  if (n === 0) return 0;
  const q = signalPack.dataQuality;
  if (typeof q.crossSourceConfidence === "number") {
    return clamp(q.crossSourceConfidence, 0, 1);
  }
  const completeness = q.completeness;
  const freshness = q.freshness;
  const reliability = q.sourceReliability ?? 1;
  return clamp((completeness + freshness + reliability) / 3, 0, 1);
}

/**
 * Volle ScoreCard-Berechnung aus SignalPack.
 */
export function computeScoreCard(
  traceId: string,
  timestamp: string,
  signalPack: MciBciSignalPack
): MciBciScoreCard {
  const n = signalPack.signals.length;
  const baseMci = computeBaseMci(signalPack);

  const maxAge = 3600;
  const avgAge = n > 0
    ? signalPack.signals.reduce((s, sig) => {
        const age = (Date.now() - new Date(sig.timestamp).getTime()) / 1000;
        return s + age;
      }, 0) / n
    : 0;

  const crossSourceVariance = computeCrossSourceVariance(signalPack);
  const { score: mci, applied } = applyDoublePenalty(
    computeMciAgeAdjusted(baseMci, maxAge, avgAge),
    crossSourceVariance
  );

  const bci = clamp(
    signalPack.dataQuality.completeness * 0.5 + signalPack.dataQuality.freshness * 0.5,
    -1,
    1
  );
  const hybrid = computeHybrid(mci, bci);
  const crossSource = computeCrossSourceConfidence(signalPack);

  return {
    traceId,
    timestamp,
    mci,
    bci,
    hybrid,
    crossSourceConfidenceScore: crossSource,
    ageAdjusted: true,
    doublePenaltyApplied: applied,
    version: "1.0",
  };
}

function computeBaseMci(signalPack: MciBciSignalPack): number {
  if (signalPack.signals.length < 2) {
    return signalPack.signals.length === 1 && signalPack.signals[0].priceUsd > 0 ? 0.5 : 0;
  }

  const sorted = [...signalPack.signals].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const first = sorted[0].priceUsd;
  const last = sorted[sorted.length - 1].priceUsd;
  if (first <= 0) return 0;
  const momentum = (last - first) / first;
  return clamp(momentum, -1, 1);
}

function computeCrossSourceVariance(signalPack: MciBciSignalPack): number {
  const prices = signalPack.signals.map((signal: MciBciSignal) => signal.priceUsd).filter((price: number) => price > 0);
  if (prices.length < 2) return 0;
  const mean = prices.reduce((sum: number, price: number) => sum + price, 0) / prices.length;
  if (mean <= 0) return 0;
  const variance =
    prices.reduce((sum: number, price: number) => sum + (price - mean) * (price - mean), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  return clamp(stdDev / mean, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
