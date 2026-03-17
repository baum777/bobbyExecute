/**
 * Wave 7: E2E fail-closed - all abort conditions block trading.
 */
import { describe, expect, it, afterEach } from "vitest";
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

const researchAllow = async (): Promise<SignalPack> => ({
  traceId: "fc-trace-allow",
  timestamp: new Date().toISOString(),
  sources: ["moralis", "dexscreener"],
  signals: [
    {
      source: "moralis",
      timestamp: new Date().toISOString(),
      baseToken: "SOL",
      quoteToken: "USDC",
      priceUsd: 100,
      volume24h: 250000,
      liquidity: 1500000,
    },
    {
      source: "dexscreener",
      timestamp: new Date().toISOString(),
      baseToken: "SOL",
      quoteToken: "USDC",
      priceUsd: 300,
      volume24h: 250000,
      liquidity: 1500000,
    },
  ],
  dataQuality: {
    completeness: 0.99,
    freshness: 0.99,
    sourceReliability: 0.99,
    crossSourceConfidence: 0.95,
  },
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

  it("phase 7 fail-closed: live allow requires review gate approval", async () => {
    const orchestrator = new Orchestrator({ dryRun: false });

    await expect(
      orchestrator.run(intentSpec, researchAllow, async () => ({ ttlSeconds: 120 }), async () => undefined, async () => false)
    ).rejects.toThrow("Fail-closed: review gate rejected allow-decision execution");
  });

  it("phase 7 fail-closed: live allow requires focusedTx + vault handlers", async () => {
    const noFocusedTx = new Orchestrator({ dryRun: false });
    await expect(
      noFocusedTx.run(intentSpec, researchAllow, async () => ({ ttlSeconds: 120 }), undefined, async () => true)
    ).rejects.toThrow("Fail-closed: focusedTx handler required for allow-decision execution");

    const noVault = new Orchestrator({ dryRun: false });
    await expect(
      noVault.run(intentSpec, researchAllow, undefined, async () => undefined, async () => true)
    ).rejects.toThrow("Fail-closed: secretsVault handler required for allow-decision execution");
  });

  it("phase 6 memory log remains append-only before phase 7 fail-closed abort", async () => {
    const orchestrator = new Orchestrator({ dryRun: false });

    await expect(
      orchestrator.run(intentSpec, researchAllow, async () => ({ ttlSeconds: 120 }), async () => undefined, async () => false)
    ).rejects.toThrow();

    const entries = orchestrator.getMemoryLog().getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].stage).toBe("orchestrator_complete");
  });

  it("chaos gate failure aborts (when MEV detected)", async () => {
    const { runChaosGate } = await import("../../src/governance/chaos-gate.js");
    await expect(runChaosGate("fc-chaos", { mevFrontRun: true, mevBackRun: true })).rejects.toThrow();
  });
});
