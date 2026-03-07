/**
 * Scoring Engine - MCI/BCI/Hybrid from SignalPack.
 * Normalized planning package: deterministic output for same input.
 */
import { computeScoreCard } from "../core/intelligence/mci-bci-formulas.js";
import type { ScoreCard } from "../core/contracts/scorecard.js";
import type { SignalPack } from "../core/contracts/signalpack.js";
import { createTraceId } from "../observability/trace-id.js";

export interface ScoringInput {
  signalPack: SignalPack;
  traceId?: string;
  timestamp?: string;
}

/**
 * Compute ScoreCard from SignalPack. Deterministic for same inputs.
 */
export function runScoringEngine(input: ScoringInput): ScoreCard {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const traceId = input.traceId ?? createTraceId({ timestamp, prefix: "score" });
  return computeScoreCard(traceId, timestamp, input.signalPack);
}
