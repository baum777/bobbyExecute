/**
 * Runtime control routes.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createServer } from "../../src/server/index.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";
import type { DryRunRuntime } from "../../src/runtime/dry-run-runtime.js";

const PORT = 3336;

describe("Control routes", () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  let baseUrl: string;
  let runtime: DryRunRuntime;

  beforeEach(async () => {
    resetKillSwitch();
    const { createDryRunRuntime } = await import("../../src/runtime/dry-run-runtime.js");
    runtime = createDryRunRuntime({
      nodeEnv: "test",
      dryRun: true,
      tradingEnabled: false,
      executionMode: "dry",
      rpcMode: "stub",
      rpcUrl: "https://api.mainnet-beta.solana.com",
      dexpaprikaBaseUrl: "https://api.dexpaprika.com",
      moralisBaseUrl: "https://solana-gateway.moralis.io",
      walletAddress: "11111111111111111111111111111111",
      journalPath: "data/control-test-journal.jsonl",
      circuitBreakerFailureThreshold: 5,
      circuitBreakerRecoveryMs: 60_000,
      maxSlippagePercent: 5,
      reviewPolicyMode: "required",
    });
    await runtime.start();
    server = await createServer({ port: PORT, host: "127.0.0.1", runtime, getRuntimeSnapshot: () => runtime.getSnapshot(), getBotStatus: () => {
      const s = runtime.getStatus();
      return s === "running" ? "running" : s === "paused" ? "paused" : "stopped";
    }});
    baseUrl = `http://127.0.0.1:${PORT}`;
  });

  afterEach(async () => {
    await runtime.stop();
    await server.close();
    resetKillSwitch();
  });

  it("POST /emergency-stop pauses runtime and enables kill-switch", async () => {
    const res = await fetch(`${baseUrl}/emergency-stop`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.runtimeStatus).toBe("paused");
    expect(body.killSwitch.halted).toBe(true);

    const health = await fetch(`${baseUrl}/health`);
    expect((await health.json()).botStatus).toBe("paused");
  });

  it("POST /control/resume fails explicitly while kill-switch is active", async () => {
    await fetch(`${baseUrl}/emergency-stop`, { method: "POST" });
    const res = await fetch(`${baseUrl}/control/resume`, { method: "POST" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("kill switch is active");
  });

  it("POST /control/reset clears kill-switch but does not imply resume", async () => {
    await fetch(`${baseUrl}/emergency-stop`, { method: "POST" });
    const reset = await fetch(`${baseUrl}/control/reset`, { method: "POST" });
    expect(reset.status).toBe(200);
    const body = await reset.json();
    expect(body.killSwitch.halted).toBe(false);
    expect(body.runtimeStatus).toBe("paused");

    const resume = await fetch(`${baseUrl}/control/resume`, { method: "POST" });
    expect(resume.status).toBe(200);
    expect((await resume.json()).runtimeStatus).toBe("running");
  });

  it("POST /control/halt stops runtime", async () => {
    const res = await fetch(`${baseUrl}/control/halt`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runtimeStatus).toBe("stopped");

    const pause = await fetch(`${baseUrl}/control/pause`, { method: "POST" });
    expect(pause.status).toBe(409);
  });
});
