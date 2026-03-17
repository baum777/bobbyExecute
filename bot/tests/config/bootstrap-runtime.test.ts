import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap } from "../../src/bootstrap.js";
import { resetConfigCache } from "../../src/config/load-config.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";

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
      expect(stopBody.state?.halted).toBe(true);

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
    delete process.env.LIVE_TRADING;

    const { server, runtime } = await bootstrap({
      host: "127.0.0.1",
      port: 3353,
    });

    try {
      const res = await fetch("http://127.0.0.1:3353/health");
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(runtime.getSnapshot().mode).toBe("paper");
      expect(body.runtime?.mode).toBe("paper");
      expect(body.runtime?.paperModeActive).toBe(true);
      expect(body.runtime?.counters?.decisionCount).toBe(0);
      expect(body.runtime?.lastEngineStage).toBe("ingest");
      expect(body.runtime?.lastBlockedReason).toContain("PAPER_INGEST_BLOCKED");
      expect(body.runtime?.lastIntakeOutcome).toMatch(/stale|adapter_error/);
    } finally {
      await runtime.stop();
      await server.close();
    }
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
