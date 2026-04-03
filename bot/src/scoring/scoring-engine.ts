/**
 * Scoring Engine - compatibility-only MCI/BCI/Hybrid bridge from SignalPack.
 * Normalized planning package: deterministic output for same input.
 * @deprecated compatibility-only migration surface for legacy parity fixtures.
 * Not part of the canonical BobbyExecute v2 authority path.
 * Retained temporarily for migration parity and test-only compatibility.
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
 * @deprecated compatibility-only migration surface for legacy parity fixtures.
 * Not part of the canonical BobbyExecute v2 authority path.
 * Do not add new callers outside the frozen compatibility/test allowlist.
 */
export function runScoringEngine(input: ScoringInput): ScoreCard {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const traceId = input.traceId ?? createTraceId({ timestamp, prefix: "score" });
  return computeScoreCard(traceId, timestamp, input.signalPack);
}
