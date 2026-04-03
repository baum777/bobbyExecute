/**
 * Signal Engine - compatibility-only trade-intent bridge from scores + policy.
 * Normalized planning package: blocks on low data quality (completeness < 0.7).
 * @deprecated compatibility-only migration surface for legacy parity fixtures.
 * Not part of the canonical BobbyExecute v2 authority path.
 * Retained temporarily for migration parity and test-only compatibility.
 */
import type { MarketSnapshot } from "../core/contracts/market.js";
import type { ScoreCard } from "../core/contracts/scorecard.js";
import type { PatternResult } from "../core/contracts/pattern.js";
import type { TradeIntent } from "../core/contracts/trade.js";
import { DATA_QUALITY_MIN_COMPLETENESS } from "../core/contracts/dataquality.js";
import { createTraceId } from "../observability/trace-id.js";

export interface SignalInput {
  market: MarketSnapshot;
  scoreCard: ScoreCard;
  patternResult: PatternResult;
  /** Data quality for fail-closed gate. completeness < 0.7 blocks. */
  dataQuality?: { completeness: number };
  traceId?: string;
  timestamp?: string;
  dryRun?: boolean;
  executionMode?: "dry" | "paper" | "live";
}

export type SignalOutput =
  | { blocked: false; intent: TradeIntent }
  | { blocked: true; reason: string; reasonCodes: string[] };

/**
 * Generate trade intent from scores. Blocks when data quality < 0.7.
 * @deprecated compatibility-only migration surface for legacy parity fixtures.
 * Not part of the canonical BobbyExecute v2 authority path.
 * Do not add new callers outside the frozen compatibility/test allowlist.
 */
export function runSignalEngine(input: SignalInput): SignalOutput {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const traceId = input.traceId ?? createTraceId({ timestamp, prefix: "signal" });

  const completeness = input.dataQuality?.completeness ?? 1;
  if (completeness < DATA_QUALITY_MIN_COMPLETENESS) {
    return {
      blocked: true,
      reason: `Data quality completeness ${completeness} below threshold ${DATA_QUALITY_MIN_COMPLETENESS}`,
      reasonCodes: ["DATA_QUALITY_LOW"],
    };
  }

  const intent: TradeIntent = {
    traceId,
    timestamp,
    idempotencyKey: `${traceId}-intent`,
    tokenIn: input.market.baseToken,
    tokenOut: input.market.quoteToken === "USD" ? "USDC" : input.market.quoteToken,
    amountIn: "1",
    minAmountOut: String(input.market.priceUsd * 0.95),
    slippagePercent: 1,
    dryRun: input.dryRun ?? true,
    executionMode: input.executionMode ?? "dry",
  };

  return { blocked: false, intent };
}
