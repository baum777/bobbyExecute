import { describe, expect, it } from "vitest";
import { IntentSpecSchema } from "@bot/core/contracts/intent.js";
import { ScoreCardSchema } from "@bot/core/contracts/scorecard.js";
import { DecisionResultSchema } from "@bot/core/contracts/decisionresult.js";
import { DataQualitySchema } from "@bot/core/contracts/dataquality.js";
import { SignalPackSchema } from "@bot/core/contracts/signalpack.js";
import {
  applyDoublePenalty,
  computeHybrid,
  computeMciAgeAdjusted,
  computeScoreCard,
} from "@bot/core/intelligence/mci-bci-formulas.js";

describe("Phase 0 Bootstrap Validation", () => {
  it("validates IntentSpec, ScoreCard, DecisionResult, DataQuality and SignalPack contracts", () => {
    const now = new Date().toISOString();
    const intent = IntentSpecSchema.parse({
      traceId: "phase-0-intent",
      timestamp: now,
      targetPairs: ["SOL/USDC"],
      constraints: { maxSlippagePercent: 2, maxPositionSizeUsd: 1000 },
      dryRun: true,
    });
    expect(intent.targetPairs.length).toBe(1);

    const signalPack = SignalPackSchema.parse({
      traceId: "phase-0-signals",
      timestamp: now,
      signals: [
        {
          source: "moralis",
          timestamp: now,
          baseToken: "SOL",
          quoteToken: "USDC",
          priceUsd: 100,
          volume24h: 100000,
          liquidity: 500000,
        },
      ],
      dataQuality: {
        completeness: 0.95,
        freshness: 0.92,
        sourceReliability: 0.93,
        crossSourceConfidence: 0.9,
      },
      sources: ["moralis"],
    });
    expect(signalPack.signals[0].priceUsd).toBe(100);

    const scoreCard = ScoreCardSchema.parse({
      traceId: "phase-0-score",
      timestamp: now,
      mci: 0.5,
      bci: 0.6,
      hybrid: 0.56,
      crossSourceConfidenceScore: 0.9,
      ageAdjusted: true,
      doublePenaltyApplied: false,
    });
    expect(scoreCard.hybrid).toBeGreaterThan(0.5);

    const decision = DecisionResultSchema.parse({
      traceId: "phase-0-decision",
      timestamp: now,
      decision: "allow",
      direction: "buy",
      confidence: 0.8,
      evidence: [{ id: "ev-1", hash: "abc123", type: "pattern" }],
      decisionHash: "hash-1",
      rationale: "bootstrap check",
    });
    expect(decision.decision).toBe("allow");

    const dataQuality = DataQualitySchema.parse({
      traceId: "phase-0-quality",
      timestamp: now,
      completeness: 0.95,
      freshness: 0.9,
      sourceReliability: 0.94,
      crossSourceConfidence: 0.9,
    });
    expect(dataQuality.completeness).toBeGreaterThanOrEqual(0.7);
  });

  it("checks MCI/BCI/Hybrid defaults and double-penalty behavior", () => {
    const agedMci = computeMciAgeAdjusted(0.8, 3600, 1800);
    expect(agedMci).toBeGreaterThan(0);
    expect(agedMci).toBeLessThanOrEqual(0.8);

    const penalty = applyDoublePenalty(0.8, 0.5);
    expect(penalty.applied).toBe(true);
    expect(penalty.score).toBeLessThan(0.8);

    const hybrid = computeHybrid(0.8, 0.2);
    expect(hybrid).toBeCloseTo(0.56, 5);
  });

  it("computes ScoreCard with cross-source variance aware penalty", () => {
    const now = new Date().toISOString();
    const signalPack = SignalPackSchema.parse({
      traceId: "phase-0-scorecard",
      timestamp: now,
      signals: [
        {
          source: "moralis",
          timestamp: new Date(Date.now() - 2_000).toISOString(),
          baseToken: "SOL",
          quoteToken: "USDC",
          priceUsd: 1,
          volume24h: 10000,
          liquidity: 20000,
        },
        {
          source: "dexscreener",
          timestamp: now,
          baseToken: "SOL",
          quoteToken: "USDC",
          priceUsd: 3,
          volume24h: 12000,
          liquidity: 21000,
        },
      ],
      dataQuality: { completeness: 0.9, freshness: 0.9, sourceReliability: 0.9 },
      sources: ["moralis", "dexscreener"],
    });

    const score = computeScoreCard("phase-0-trace", now, signalPack);
    expect(score.crossSourceConfidenceScore).toBeGreaterThanOrEqual(0);
    expect(score.crossSourceConfidenceScore).toBeLessThanOrEqual(1);
    expect(score.ageAdjusted).toBe(true);
    expect(score.doublePenaltyApplied).toBe(true);
  });
});
