import { describe, expect, it } from "vitest";
import { runScoringEngine } from "../../src/scoring/scoring-engine.js";
import { runSignalEngine } from "../../src/signals/signal-engine.js";
import { runExecution } from "../../src/execution/execution-engine.js";
import { fetchMarketWithFallback, type MarketAdapterFetch } from "../../src/adapters/orchestrator/adapter-orchestrator.js";
import type { SignalPack } from "../../src/core/contracts/signalpack.js";
import type { MarketSnapshot } from "../../src/core/contracts/market.js";
import type { PatternResult } from "../../src/core/contracts/pattern.js";
import type { TradeIntent } from "../../src/core/contracts/trade.js";

const now = "2026-03-17T12:00:00.000Z";

const signalPack: SignalPack = {
  traceId: "score-trace",
  timestamp: now,
  sources: ["moralis", "dexscreener"],
  signals: [
    {
      source: "moralis",
      timestamp: now,
      baseToken: "SOL",
      quoteToken: "USDC",
      priceUsd: 100,
      volume24h: 1000,
      liquidity: 100000,
    },
    {
      source: "dexscreener",
      timestamp: now,
      baseToken: "SOL",
      quoteToken: "USDC",
      priceUsd: 100,
      volume24h: 1000,
      liquidity: 100000,
    },
  ],
  dataQuality: {
    completeness: 0.95,
    freshness: 0.95,
    sourceReliability: 0.95,
    crossSourceConfidence: 0.9,
  },
};

const market: MarketSnapshot = {
  traceId: "signal-trace",
  timestamp: now,
  source: "dexpaprika",
  poolId: "pool-1",
  baseToken: "SOL",
  quoteToken: "USDC",
  priceUsd: 100,
  volume24h: 1000,
  liquidity: 100000,
  freshnessMs: 0,
};

const pattern: PatternResult = {
  traceId: "pattern-trace",
  timestamp: now,
  patterns: [],
  flags: [],
  confidence: 0.8,
  evidence: [],
};

const intent: TradeIntent = {
  traceId: "exec-trace",
  timestamp: now,
  idempotencyKey: "exec-key",
  tokenIn: "SOL",
  tokenOut: "USDC",
  amountIn: "1",
  minAmountOut: "0.9",
  slippagePercent: 1,
  dryRun: false,
  executionMode: "live",
};

const paperIntent: TradeIntent = {
  ...intent,
  traceId: "paper-exec-trace",
  idempotencyKey: "paper-exec-key",
  executionMode: "paper",
};

describe("runtime truthfulness closure", () => {
  it("scoring is deterministic for equal input", () => {
    const a = runScoringEngine({ signalPack, traceId: "same", timestamp: now });
    const b = runScoringEngine({ signalPack, traceId: "same", timestamp: now });
    expect(a).toStrictEqual(b);
  });

  it("signal engine blocks on low data quality completeness", () => {
    const score = runScoringEngine({ signalPack, traceId: "s", timestamp: now });
    const out = runSignalEngine({
      market,
      scoreCard: score,
      patternResult: pattern,
      dataQuality: { completeness: 0.4 },
      traceId: "sig",
      timestamp: now,
      dryRun: true,
      executionMode: "dry",
    });

    expect(out.blocked).toBe(true);
    if (out.blocked) {
      expect(out.reasonCodes).toContain("DATA_QUALITY_LOW");
    }
  });

  it("execution engine blocks live mode when live trading is disabled", async () => {
    delete process.env.LIVE_TRADING;

    const result = await runExecution(
      {
        executeFn: async () => ({
          traceId: intent.traceId,
          timestamp: intent.timestamp,
          tradeIntentId: intent.idempotencyKey,
          success: true,
          dryRun: false,
        }),
        verifyFn: async () => ({
          traceId: intent.traceId,
          timestamp: intent.timestamp,
          passed: true,
          checks: {},
        }),
      },
      intent
    );

    expect(result.blocked).toBe(true);
    expect(result.report.success).toBe(false);
    expect(result.verification.passed).toBe(false);
    expect(result.report.executionMode).toBe("live");
    expect(result.verification.verificationMode).toBe("rpc");
  });

  it("execution engine marks paper execution and simulated verification", async () => {
    const result = await runExecution(
      {
        executeFn: async () => ({
          traceId: paperIntent.traceId,
          timestamp: paperIntent.timestamp,
          tradeIntentId: paperIntent.idempotencyKey,
          success: true,
          dryRun: false,
        }),
        verifyFn: async () => ({
          traceId: paperIntent.traceId,
          timestamp: paperIntent.timestamp,
          passed: true,
          checks: {},
        }),
      },
      paperIntent
    );

    expect(result.blocked).toBe(false);
    expect(result.report.executionMode).toBe("paper");
    expect(result.report.paperExecution).toBe(true);
    expect(result.verification.verificationMode).toBe("paper-simulated");
  });

  it("adapter orchestrator rejects stale snapshots and fails closed when all stale", async () => {
    const staleAdapter: MarketAdapterFetch = {
      id: "stale-1",
      fetch: async () => ({ ...market, freshnessMs: 99_999 }),
    };
    const staleAdapter2: MarketAdapterFetch = {
      id: "stale-2",
      fetch: async () => ({ ...market, traceId: "m2", freshnessMs: 80_000 }),
    };

    const result = await fetchMarketWithFallback([staleAdapter, staleAdapter2], "pool-1", 15_000);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("stale");
    }
  });
});
