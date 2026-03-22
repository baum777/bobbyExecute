/**
 * Runtime control routes.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "../../src/server/index.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";
import type { DryRunRuntime } from "../../src/runtime/dry-run-runtime.js";
import { resetMicroLiveControlForTests } from "../../src/runtime/live-control.js";

const PORT = 3336;
const CONTROL_TOKEN = "phase10-control-token";

function authHeaders(token = CONTROL_TOKEN): HeadersInit {
  return { "x-control-token": token };
}

async function createLiveTestRuntime(tempDirPath: string): Promise<DryRunRuntime> {
  const { createDryRunRuntime } = await import("../../src/runtime/dry-run-runtime.js");
  return createDryRunRuntime({
    nodeEnv: "test",
    dryRun: false,
    tradingEnabled: true,
    liveTestMode: true,
    executionMode: "live",
    rpcMode: "real",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    dexpaprikaBaseUrl: "https://api.dexpaprika.com",
    moralisBaseUrl: "https://solana-gateway.moralis.io",
    walletAddress: "11111111111111111111111111111111",
    controlToken: CONTROL_TOKEN,
    operatorReadToken: "phase10-operator-read-token",
    journalPath: join(tempDirPath, "journal.jsonl"),
    circuitBreakerFailureThreshold: 5,
    circuitBreakerRecoveryMs: 60_000,
    maxSlippagePercent: 5,
    reviewPolicyMode: "required",
  });
}

describe("Control routes", () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  let baseUrl: string;
  let runtime: DryRunRuntime;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "control-test-"));
    resetKillSwitch();
    resetMicroLiveControlForTests();
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
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
      journalPath: join(tempDir, "journal.jsonl"),
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
    await rm(tempDir, { recursive: true, force: true });
    resetKillSwitch();
    resetMicroLiveControlForTests();
    delete process.env.LIVE_TRADING;
    delete process.env.RPC_MODE;
    delete process.env.ROLLOUT_POSTURE;
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
    expect(body.liveControl.posture).toBe("live_killed");
    expect(body.readiness).toMatchObject({
      canArmMicroLive: expect.any(Boolean),
      blockers: expect.any(Array),
    });

    const health = await fetch(`${baseUrl}/health`);
    expect((await health.json()).botStatus).toBe("paused");
  });

  it("POST /emergency-stop and /control/reset manage live-test round status explicitly", async () => {
    const liveTempDir = await mkdtemp(join(tmpdir(), "control-live-stop-"));
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.TRADING_ENABLED = "true";
    process.env.LIVE_TEST_MODE = "true";
    process.env.WALLET_ADDRESS = "11111111111111111111111111111111";
    process.env.CONTROL_TOKEN = CONTROL_TOKEN;
    process.env.OPERATOR_READ_TOKEN = "phase10-live-read-token";
    process.env.ROLLOUT_POSTURE = "micro_live";

    const runtimeLive = await createLiveTestRuntime(liveTempDir);
    await runtimeLive.start();
    const liveServer = await createServer({
      port: PORT + 10,
      host: "127.0.0.1",
      runtime: runtimeLive,
      getRuntimeSnapshot: () => runtimeLive.getSnapshot(),
      getBotStatus: () => {
        const s = runtimeLive.getStatus();
        return s === "running" ? "running" : s === "paused" ? "paused" : "stopped";
      },
      controlAuthToken: CONTROL_TOKEN,
    });

    try {
      const stopRes = await fetch(`http://127.0.0.1:${PORT + 10}/emergency-stop`, {
        method: "POST",
        headers: authHeaders(),
      });
      expect(stopRes.status).toBe(200);
      const stopBody = await stopRes.json();
      expect(stopBody.success).toBe(true);
      expect(stopBody.killSwitch.halted).toBe(true);
      expect(stopBody.liveControl.liveTestMode).toBe(true);
      expect(stopBody.liveControl.roundStatus).toBe("stopped");
      expect(stopBody.liveControl.stopped).toBe(true);
      expect(stopBody.liveControl.stopReason).toBe("kill_switch_emergency_stop");

      const resetRes = await fetch(`http://127.0.0.1:${PORT + 10}/control/reset`, {
        method: "POST",
        headers: authHeaders(),
      });
      expect(resetRes.status).toBe(200);
      const resetBody = await resetRes.json();
      expect(resetBody.success).toBe(true);
      expect(resetBody.killSwitch.halted).toBe(false);
      expect(resetBody.runtimeStatus).toBe("paused");
      expect(resetBody.liveControl.roundStatus).toBe("preflighted");
      expect(resetBody.liveControl.disarmed).toBe(true);
      expect(resetBody.liveControl.roundStoppedAt).toBeUndefined();
    } finally {
      await runtimeLive.stop();
      await liveServer.close();
      await rm(liveTempDir, { recursive: true, force: true });
    }
  });

  it("POST /control/reset fails closed while a live-test round is running and can recover after failure", async () => {
    const liveTempDir = await mkdtemp(join(tmpdir(), "control-live-reset-"));
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.TRADING_ENABLED = "true";
    process.env.LIVE_TEST_MODE = "true";
    process.env.WALLET_ADDRESS = "11111111111111111111111111111111";
    process.env.CONTROL_TOKEN = CONTROL_TOKEN;
    process.env.OPERATOR_READ_TOKEN = "phase10-live-read-token";
    process.env.ROLLOUT_POSTURE = "micro_live";

    const runtimeLive = await createLiveTestRuntime(liveTempDir);
    await runtimeLive.start();
    const liveServer = await createServer({
      port: PORT + 11,
      host: "127.0.0.1",
      runtime: runtimeLive,
      getRuntimeSnapshot: () => runtimeLive.getSnapshot(),
      getBotStatus: () => {
        const s = runtimeLive.getStatus();
        return s === "running" ? "running" : s === "paused" ? "paused" : "stopped";
      },
      controlAuthToken: CONTROL_TOKEN,
    });

    try {
      const firstReset = await fetch(`http://127.0.0.1:${PORT + 11}/control/reset`, {
        method: "POST",
        headers: authHeaders(),
      });
      expect(firstReset.status).toBe(409);
      const firstBody = await firstReset.json();
      expect(firstBody.success).toBe(false);
      expect(firstBody.liveControl.roundStatus).toBe("failed");
      expect(firstBody.runtimeStatus).toBe("paused");

      const secondReset = await fetch(`http://127.0.0.1:${PORT + 11}/control/reset`, {
        method: "POST",
        headers: authHeaders(),
      });
      expect(secondReset.status).toBe(200);
      const secondBody = await secondReset.json();
      expect(secondBody.success).toBe(true);
      expect(secondBody.killSwitch.halted).toBe(false);
      expect(secondBody.liveControl.roundStatus).toBe("preflighted");
      expect(secondBody.runtimeStatus).toBe("paused");
    } finally {
      await runtimeLive.stop();
      await liveServer.close();
      await rm(liveTempDir, { recursive: true, force: true });
    }
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
    expect(body.liveControl.posture).toBe("live_disarmed");
    expect(body.readiness).toMatchObject({
      canArmMicroLive: expect.any(Boolean),
      blockers: expect.any(Array),
    });

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

  it("POST /control/live/arm and /control/live/disarm manage explicit micro-live posture", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";

    const arm = await fetch(`${baseUrl}/control/live/arm`, { method: "POST", headers: authHeaders() });
    expect(arm.status).toBe(200);
    const armBody = await arm.json();
    expect(armBody.success).toBe(true);
    expect(armBody.liveControl.posture).toBe("live_armed");
    expect(armBody.liveControl.armed).toBe(true);
    expect(armBody.readiness).toMatchObject({
      canArmMicroLive: expect.any(Boolean),
      blockers: expect.any(Array),
    });

    const disarm = await fetch(`${baseUrl}/control/live/disarm`, { method: "POST", headers: authHeaders() });
    expect(disarm.status).toBe(200);
    const disarmBody = await disarm.json();
    expect(disarmBody.success).toBe(true);
    expect(disarmBody.liveControl.posture).toBe("live_disarmed");
    expect(disarmBody.liveControl.armed).toBe(false);
    expect(disarmBody.readiness).toMatchObject({
      canArmMicroLive: expect.any(Boolean),
      blockers: expect.any(Array),
    });
  });

  it("control actions persist canonical incident evidence", async () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";

    await fetch(`${baseUrl}/control/live/arm`, { method: "POST", headers: authHeaders() });
    await fetch(`${baseUrl}/control/live/disarm`, { method: "POST", headers: authHeaders() });
    await fetch(`${baseUrl}/emergency-stop`, { method: "POST", headers: authHeaders() });

    const incidents = await runtime.listRecentIncidents(20);
    const incidentTypes = incidents.map((incident) => incident.type);
    expect(incidentTypes).toContain("live_control_armed");
    expect(incidentTypes).toContain("live_control_disarmed");
    expect(incidentTypes).toContain("live_control_killed");
    expect(incidentTypes).toContain("emergency_stop");
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
