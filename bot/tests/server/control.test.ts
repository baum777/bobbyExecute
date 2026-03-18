/**
 * Runtime control routes.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createServer } from "../../src/server/index.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";
import type { DryRunRuntime } from "../../src/runtime/dry-run-runtime.js";

const PORT = 3336;
const CONTROL_TOKEN = "phase10-control-token";

function authHeaders(token = CONTROL_TOKEN): HeadersInit {
  return { "x-control-token": token };
}

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
      liveTestMode: false,
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
    }, controlAuthToken: CONTROL_TOKEN });
    baseUrl = `http://127.0.0.1:${PORT}`;
  });

  afterEach(async () => {
    await runtime.stop();
    await server.close();
    resetKillSwitch();
  });

  it("rejects control routes when authorization is missing or invalid", async () => {
    const missing = await fetch(`${baseUrl}/control/pause`, { method: "POST" });
    expect(missing.status).toBe(403);
    await expect(missing.json()).resolves.toMatchObject({
      success: false,
      code: "control_auth_invalid",
    });

    const invalid = await fetch(`${baseUrl}/control/pause`, {
      method: "POST",
      headers: authHeaders("wrong-token"),
    });
    expect(invalid.status).toBe(403);
    await expect(invalid.json()).resolves.toMatchObject({
      success: false,
      code: "control_auth_invalid",
    });
  });

  it("POST /emergency-stop pauses runtime and enables kill-switch", async () => {
    const res = await fetch(`${baseUrl}/emergency-stop`, { method: "POST", headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.runtimeStatus).toBe("paused");
    expect(body.killSwitch.halted).toBe(true);

    const health = await fetch(`${baseUrl}/health`);
    expect((await health.json()).botStatus).toBe("paused");
  });

  it("POST /control/resume fails explicitly while kill-switch is active", async () => {
    await fetch(`${baseUrl}/emergency-stop`, { method: "POST", headers: authHeaders() });
    const res = await fetch(`${baseUrl}/control/resume`, { method: "POST", headers: authHeaders() });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("kill switch is active");
  });

  it("POST /control/reset clears kill-switch but does not imply resume", async () => {
    await fetch(`${baseUrl}/emergency-stop`, { method: "POST", headers: authHeaders() });
    const reset = await fetch(`${baseUrl}/control/reset`, { method: "POST", headers: authHeaders() });
    expect(reset.status).toBe(200);
    const body = await reset.json();
    expect(body.killSwitch.halted).toBe(false);
    expect(body.runtimeStatus).toBe("paused");

    const resume = await fetch(`${baseUrl}/control/resume`, { method: "POST", headers: authHeaders() });
    expect(resume.status).toBe(200);
    expect((await resume.json()).runtimeStatus).toBe("running");
  });

  it("POST /control/halt stops runtime", async () => {
    const res = await fetch(`${baseUrl}/control/halt`, { method: "POST", headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runtimeStatus).toBe("stopped");

    const pause = await fetch(`${baseUrl}/control/pause`, { method: "POST", headers: authHeaders() });
    expect(pause.status).toBe(409);
  });

  it("control routes fail closed when no control token is configured", async () => {
    const unconfiguredServer = await createServer({ port: PORT + 1, host: "127.0.0.1", runtime });

    try {
      const res = await fetch(`http://127.0.0.1:${PORT + 1}/control/pause`, {
        method: "POST",
        headers: authHeaders(),
      });
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({
        success: false,
        code: "control_auth_unconfigured",
      });
    } finally {
      await unconfiguredServer.close();
    }
  });

  it("POST /emergency-stop fails closed when runtime control is unavailable", async () => {
    const runtimeLessServer = await createServer({
      port: PORT + 2,
      host: "127.0.0.1",
      controlAuthToken: CONTROL_TOKEN,
    });

    try {
      const res = await fetch(`http://127.0.0.1:${PORT + 2}/emergency-stop`, {
        method: "POST",
        headers: authHeaders(),
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.code).toBe("runtime_control_unavailable");
      expect(body.runtimeStatus).toBeUndefined();
      expect(body.message).toContain("runtime control is unavailable");
      expect(body.killSwitch.halted).toBe(true);
    } finally {
      await runtimeLessServer.close();
      resetKillSwitch();
    }
  });
});
