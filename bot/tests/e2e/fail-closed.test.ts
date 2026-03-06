/**
 * Wave 7: E2E fail-closed - all abort conditions block trading.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { triggerKillSwitch, resetKillSwitch } from "../../src/governance/kill-switch.js";
import type { IntentSpec } from "../../src/core/contracts/intent.js";
import type { SignalPack } from "../../src/core/contracts/signalpack.js";

const researchOk = async (): Promise<SignalPack> => ({
  traceId: "fc-trace",
  timestamp: new Date().toISOString(),
  sources: ["moralis"],
  signals: [{
    source: "moralis",
    timestamp: new Date().toISOString(),
    baseToken: "SOL",
    quoteToken: "USDC",
    priceUsd: 150,
    volume24h: 5000,
    liquidity: 100000,
  }],
  dataQuality: { completeness: 0.95, freshness: 0.9, sourceReliability: 0.95 },
});

const intentSpec: IntentSpec = {
  idempotencyKey: "fc-key",
  tokenIn: "SOL",
  tokenOut: "USDC",
  amountIn: "1",
  minAmountOut: "0.9",
  slippagePercent: 5,
};

describe("E2E fail-closed (Wave 7)", () => {
  afterEach(() => {
    resetKillSwitch();
  });

  it("kill switch blocks orchestrator run", async () => {
    triggerKillSwitch("E2E test");
    const orchestrator = new Orchestrator({ dryRun: true });

    await expect(orchestrator.run(intentSpec, researchOk)).rejects.toThrow(/Kill switch|halted/);
  });

  it("review gate deny prevents focused_tx execution", async () => {
    const orchestrator = new Orchestrator({ dryRun: true });
    const reviewGateDeny = async () => false;
    const state = await orchestrator.run(intentSpec, researchOk, undefined, undefined, reviewGateDeny);
    expect(state.reviewGateApproved).toBe(false);
    expect(state.focusedTxExecuted).toBe(false);
  });

  it("chaos gate failure aborts (when MEV detected)", async () => {
    const { runChaosGate } = await import("../../src/governance/chaos-gate.js");
    await expect(runChaosGate("fc-chaos", { mevFrontRun: true, mevBackRun: true })).rejects.toThrow();
  });
});
