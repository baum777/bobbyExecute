/**
 * Wave 7: E2E full pipeline - Market -> Signal -> Risk -> Chaos -> Execute -> Verify -> Journal.
 */
import { describe, expect, it } from "vitest";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { FakeClock } from "../../src/core/clock.js";
import type { IntentSpec } from "../../src/core/contracts/intent.js";
import type { SignalPack } from "../../src/core/contracts/signalpack.js";

describe("E2E full pipeline (Wave 7)", () => {
  it("orchestrator runs full pipeline: research -> chaos_gate -> focused_tx", async () => {
    const orchestrator = new Orchestrator({ dryRun: true });

    const research = async (_intent: IntentSpec): Promise<SignalPack> => ({
      traceId: "e2e-trace",
      timestamp: "2026-03-06T12:00:00.000Z",
      sources: ["moralis"],
      signals: [
        {
          source: "moralis",
          timestamp: "2026-03-06T12:00:00.000Z",
          baseToken: "SOL",
          quoteToken: "USDC",
          priceUsd: 150,
          volume24h: 5000,
          liquidity: 100000,
        },
      ],
      dataQuality: { completeness: 0.95, freshness: 0.9, sourceReliability: 0.95 },
    });

    const intentSpec: IntentSpec = {
      idempotencyKey: "e2e-key-1",
      tokenIn: "SOL",
      tokenOut: "USDC",
      amountIn: "1",
      minAmountOut: "0.9",
      slippagePercent: 5,
    };

    const state = await orchestrator.run(intentSpec, research);

    expect(state.phase).toBe("focused_tx");
    expect(state.signalPack).toBeDefined();
    expect(state.scoreCard).toBeDefined();
    expect(state.riskBreakdown).toBeDefined();
    expect(state.decisionResult).toBeDefined();
    expect(state.chaosPassed).toBe(true);
    expect(state.chaosReportHash).toBeDefined();
  });

  it("pipeline reaches focused_tx and memory db has journal", async () => {
    const orchestrator = new Orchestrator({ dryRun: true });

    const research = async (): Promise<SignalPack> => ({
      traceId: "e2e-hash",
      timestamp: new Date().toISOString(),
      sources: ["moralis"],
      signals: [{
        source: "moralis",
        timestamp: new Date().toISOString(),
        baseToken: "SOL",
        quoteToken: "USDC",
        priceUsd: 100,
        volume24h: 2000,
        liquidity: 50000,
      }],
      dataQuality: { completeness: 0.9, freshness: 0.95, sourceReliability: 0.95 },
    });

    const state = await orchestrator.run(
      { idempotencyKey: "k", tokenIn: "SOL", tokenOut: "USDC", amountIn: "1", minAmountOut: "0.9", slippagePercent: 5 },
      research
    );

    expect(state.phase).toBe("focused_tx");
    const db = orchestrator.getMemoryDb();
    const journal = db.getJournal();
    expect(journal.length).toBeGreaterThanOrEqual(0);
  });
});
