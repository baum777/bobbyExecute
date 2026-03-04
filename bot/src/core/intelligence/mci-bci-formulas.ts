/**
 * MCI/BCI/Hybrid Formeln - age-adjusted, double-penalty protected.
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: core/intelligence | Last Updated: 2026-03-04
 */
import type { SignalPack } from "../contracts/signalpack.js";
import type { ScoreCard } from "../contracts/scorecard.js";

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
  const decay = Math.exp(-AGE_DECAY_FACTOR * (signalAgeSeconds / maxAgeSeconds));
  return baseMci * decay;
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
    return { score: score * penalty, applied: true };
  }
  return { score, applied: false };
}

/**
 * Hybrid Score: Gewichtete Kombination MCI + BCI.
 */
export function computeHybrid(
  mci: number,
  bci: number,
  mciWeight = 0.6,
  bciWeight = 0.4
): number {
  return mci * mciWeight + bci * bciWeight;
}

/**
 * Cross-Source Confidence aus SignalPack.
 */
export function computeCrossSourceConfidence(signalPack: SignalPack): number {
  const n = signalPack.signals.length;
  if (n === 0) return 0;
  const q = signalPack.dataQuality;
  const completeness = q.completeness;
  const freshness = q.freshness;
  const reliability = q.sourceReliability ?? 1;
  return (completeness + freshness + reliability) / 3;
}

/**
 * Volle ScoreCard-Berechnung aus SignalPack.
 */
export function computeScoreCard(
  traceId: string,
  timestamp: string,
  signalPack: SignalPack
): ScoreCard {
  const n = signalPack.signals.length;
  const baseMci = n > 0
    ? signalPack.signals.reduce((s, sig) => s + (sig.priceUsd > 0 ? 0.5 : -0.5), 0) / n
    : 0;

  const maxAge = 3600;
  const avgAge = n > 0
    ? signalPack.signals.reduce((s, sig) => {
        const age = (Date.now() - new Date(sig.timestamp).getTime()) / 1000;
        return s + age;
      }, 0) / n
    : 0;

  const { score: mci, applied } = applyDoublePenalty(
    computeMciAgeAdjusted(baseMci, maxAge, avgAge),
    0.1
  );

  const bci = signalPack.dataQuality.completeness * 0.5 + signalPack.dataQuality.freshness * 0.5;
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
  };
}
