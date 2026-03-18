import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap } from "../../src/bootstrap.js";
import { resetConfigCache } from "../../src/config/load-config.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";
import type { MarketSnapshot } from "../../src/core/contracts/market.js";
import type { WalletSnapshot } from "../../src/core/contracts/wallet.js";

const ORIG_ENV = process.env;

describe("bootstrap runtime closure (phase-1)", () => {
  beforeEach(() => {
    resetConfigCache();
    process.env = { ...ORIG_ENV };
    delete process.env.LIVE_TRADING;
    delete process.env.RPC_MODE;
  });

  afterEach(() => {
    resetKillSwitch();
    resetConfigCache();
    process.env = ORIG_ENV;
  });

  it("starts server and dry-run runtime together", async () => {
    const { server, runtime } = await bootstrap({
      host: "127.0.0.1",
      port: 3351,
    });

    try {
      expect(runtime.getStatus()).toBe("running");
      expect(runtime.getLastState()?.blocked).toBe(true);
      expect(runtime.getLastState()?.blockedReason).toBe(
        "RUNTIME_PHASE1_FAIL_CLOSED_UNTIL_PIPELINE_WIRED"
      );

      const res = await fetch("http://127.0.0.1:3351/health");
      expect(res.status).toBe(200);
      const healthBefore = await res.json();
      expect(healthBefore.botStatus).toBe("running");
      expect(healthBefore.runtime?.mode).toBe("dry");
      expect(healthBefore.runtime?.paperModeActive).toBe(false);

      const summaryBefore = await fetch("http://127.0.0.1:3351/kpi/summary");
      expect(summaryBefore.status).toBe(200);
      const summaryPayload = await summaryBefore.json();
      expect(summaryPayload.botStatus).toBe("running");
      expect(summaryPayload.runtime?.mode).toBe("dry");

      const stopRes = await fetch("http://127.0.0.1:3351/emergency-stop", { method: "POST" });
      expect(stopRes.status).toBe(200);
      const stopBody = await stopRes.json();
      expect(stopBody.success).toBe(true);
      expect(stopBody.killSwitch?.halted).toBe(true);
      expect(stopBody.runtimeStatus).toBe("paused");

      const healthAfterStop = await fetch("http://127.0.0.1:3351/health");
      expect(healthAfterStop.status).toBe(200);
      const healthPayload = await healthAfterStop.json();
      expect(healthPayload.botStatus).toBe("paused");
      expect(healthPayload.killSwitch?.halted).toBe(true);

      const summaryAfter = await fetch("http://127.0.0.1:3351/kpi/summary");
      expect(summaryAfter.status).toBe(200);
      expect((await summaryAfter.json()).botStatus).toBe("paused");
    } finally {
      await runtime.stop();
      await server.close();
    }
  });


  it("starts in paper mode with runtime truth surfaced in health", async () => {
    process.env.DRY_RUN = "false";
    process.env.WALLET_ADDRESS = "11111111111111111111111111111111";
    delete process.env.LIVE_TRADING;

    const marketSnapshot: MarketSnapshot = {
      schema_version: "market.v1",
      traceId: "paper-market-1",
      timestamp: "2026-03-18T00:00:00.000Z",
      source: "dexpaprika",
      poolId: "paper-pool-1",
      baseToken: "SOL",
      quoteToken: "USD",
      priceUsd: 125,
      volume24h: 100000,
      liquidity: 500000,
      freshnessMs: 0,
      status: "ok",
    };
    const walletSnapshot: WalletSnapshot = {
      traceId: "paper-wallet-1",
      timestamp: "2026-03-18T00:00:00.000Z",
      source: "moralis",
      walletAddress: process.env.WALLET_ADDRESS,
      balances: [],
      totalUsd: 0,
    };

    const { server, runtime } = await bootstrap({
      host: "127.0.0.1",
      port: 3353,
      runtimeDeps: {
        paperMarketAdapters: [
          {
            id: "primary",
            fetch: async () => marketSnapshot,
          },
        ],
        fetchPaperWalletSnapshot: async () => walletSnapshot,
      },
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const res = await fetch("http://127.0.0.1:3353/health");
      expect(res.status).toBe(200);
      const body = await res.json();
      const snapshot = runtime.getSnapshot();

      expect(snapshot.mode).toBe("paper");
      expect(snapshot.counters.decisionCount).toBe(1);
      expect(snapshot.counters.executionCount).toBe(1);
      expect(snapshot.lastCycleSummary?.intakeOutcome).toBe("ok");
      expect(body.runtime?.mode).toBe("paper");
      expect(body.runtime?.paperModeActive).toBe(true);
      expect(body.runtime?.counters?.decisionCount).toBeGreaterThanOrEqual(1);
      expect(body.runtime?.counters?.executionCount).toBeGreaterThanOrEqual(1);
      expect(body.runtime?.lastEngineStage).toBe("monitor");
      expect(body.runtime?.lastBlockedReason).toBeUndefined();
      expect(body.runtime?.lastIntakeOutcome).toBe("ok");
    } finally {
      await runtime.stop();
      await server.close();
    }
  });

  it("fails closed when paper runtime dependencies cannot be wired", async () => {
    process.env.DRY_RUN = "false";
    delete process.env.LIVE_TRADING;
    delete process.env.WALLET_ADDRESS;

    await expect(
      bootstrap({
        host: "127.0.0.1",
        port: 3354,
      })
    ).rejects.toThrow(/Paper runtime requires WALLET_ADDRESS/);
  });

  it("fails fast on invalid startup config", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "stub";

    await expect(
      bootstrap({
        host: "127.0.0.1",
        port: 3352,
      })
    ).rejects.toThrow(/LIVE_TRADING=true.*requires RPC_MODE=real/);
  });
});
