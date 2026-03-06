/**
 * Wave 7: E2E determinism - same input -> same output + hash.
 */
import { describe, expect, it } from "vitest";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { FakeClock } from "../../src/core/clock.js";
import { hashDecision } from "../../src/core/determinism/hash.js";
import type { IntentSpec } from "../../src/core/contracts/intent.js";
import type { SignalPack } from "../../src/core/contracts/signalpack.js";

describe("E2E determinism (Wave 7)", () => {
  it("same input yields same decision", async () => {
    const clock = new FakeClock("2026-03-06T12:00:00.000Z");
    const orchestrator = new Orchestrator({ dryRun: true, clock });

    const signalPack: SignalPack = {
      traceId: "det-trace",
      timestamp: clock.now().toISOString(),
      sources: ["moralis"],
      signals: [{
        source: "moralis",
        timestamp: clock.now().toISOString(),
        baseToken: "SOL",
        quoteToken: "USDC",
        priceUsd: 150,
        volume24h: 5000,
        liquidity: 100000,
      }],
      dataQuality: { completeness: 0.95, freshness: 0.9, sourceReliability: 0.95 },
    };

    const intentSpec: IntentSpec = {
      idempotencyKey: "det-key",
      tokenIn: "SOL",
      tokenOut: "USDC",
      amountIn: "1",
      minAmountOut: "0.9",
      slippagePercent: 5,
    };

    const research = async () => signalPack;

    const state1 = await orchestrator.run(intentSpec, research);
    const state2 = await orchestrator.run(intentSpec, research);

    expect(state1.decisionResult?.decision).toBe(state2.decisionResult?.decision);
    expect(state1.phase).toBe(state2.phase);
  });

  it("canonicalize + hash stable across equivalent objects", () => {
    const a = { x: 1, y: { b: 2, a: 1 } };
    const b = { y: { a: 1, b: 2 }, x: 1 };
    expect(hashDecision(a)).toBe(hashDecision(b));
  });
});
