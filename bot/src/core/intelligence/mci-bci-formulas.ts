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
 */
export function computeHybrid(
  mci: number,
  bci: number,
  mciWeight = 0.6,
  bciWeight = 0.4
): number {
  return clamp(mci * mciWeight + bci * bciWeight, -1, 1);
}

/**
 * Cross-Source Confidence aus SignalPack.
 */
export function computeCrossSourceConfidence(signalPack: SignalPack): number {
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
  signalPack: SignalPack
): ScoreCard {
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
  };
}

function computeBaseMci(signalPack: SignalPack): number {
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

function computeCrossSourceVariance(signalPack: SignalPack): number {
  const prices = signalPack.signals.map((s) => s.priceUsd).filter((p) => p > 0);
  if (prices.length < 2) return 0;
  const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  if (mean <= 0) return 0;
  const variance =
    prices.reduce((sum, p) => sum + (p - mean) * (p - mean), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  return clamp(stdDev / mean, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
