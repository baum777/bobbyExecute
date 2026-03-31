/**
 * Wave 3: Server routes - /health, /kpi/* (offline with stubs).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createServer } from "../../src/server/index.js";
import { CircuitBreaker } from "../../src/governance/circuit-breaker.js";
import { InMemoryActionLogger } from "../../src/observability/action-log.js";
import { ADAPTER_IDS } from "../../src/adapters/adapters-with-cb.js";

const PORT = 3342;

describe("Server (Wave 3)", () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  let baseUrl: string;

  beforeEach(async () => {
    server = await createServer({
      port: PORT,
      host: "127.0.0.1",
      circuitBreaker: new CircuitBreaker([...ADAPTER_IDS]),
      actionLogger: new InMemoryActionLogger(),
      getP95: (name) => (name === "adapter" ? 42 : undefined),
    });
    baseUrl = `http://127.0.0.1:${PORT}`;
  });

  afterEach(async () => {
    await server.close();
  });

  it("GET /health returns status and uptime", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: expect.stringMatching(/^(OK|DEGRADED|FAIL)$/),
      uptimeMs: expect.any(Number),
      version: expect.any(String),
    });
    expect(body.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it("GET /health uses dynamic bot status resolver when provided", async () => {
    let status: "running" | "paused" | "stopped" = "running";
    const srv = await createServer({
      port: PORT + 3,
      host: "127.0.0.1",
      getBotStatus: () => status,
    });

    try {
      const runningRes = await fetch(`http://127.0.0.1:${PORT + 3}/health`);
      expect(runningRes.status).toBe(200);
      expect((await runningRes.json()).botStatus).toBe("running");

      status = "paused";
      const pausedRes = await fetch(`http://127.0.0.1:${PORT + 3}/health`);
      expect(pausedRes.status).toBe(200);
      expect((await pausedRes.json()).botStatus).toBe("paused");
    } finally {
      await srv.close();
    }
  });

  it("emits CORS headers for the configured dashboard origin", async () => {
    const dashboardOrigin = "https://dashboard.example.com";
    const srv = await createServer({
      port: PORT + 9,
      host: "127.0.0.1",
      dashboardOrigin,
    });

    try {
      const preflight = await fetch(`http://127.0.0.1:${PORT + 9}/health`, {
        method: "OPTIONS",
        headers: {
          Origin: dashboardOrigin,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "content-type",
        },
      });

      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe(dashboardOrigin);
      expect(preflight.headers.get("access-control-allow-methods")).toContain("GET");
      expect(preflight.headers.get("access-control-allow-headers")).not.toContain("x-control-token");

      const health = await fetch(`http://127.0.0.1:${PORT + 9}/health`, {
        headers: { Origin: dashboardOrigin },
      });
      expect(health.status).toBe(200);
      expect(health.headers.get("access-control-allow-origin")).toBe(dashboardOrigin);
    } finally {
      await srv.close();
    }
  });

  it("GET /kpi/summary uses dynamic bot status resolver", async () => {
    let status: "running" | "paused" | "stopped" = "running";
    const srv = await createServer({
      port: PORT + 2,
      host: "127.0.0.1",
      getBotStatus: () => status,
    });

    try {
      const runningRes = await fetch(`http://127.0.0.1:${PORT + 2}/kpi/summary`);
      expect(runningRes.status).toBe(200);
      expect((await runningRes.json()).botStatus).toBe("running");

      status = "paused";
      const pausedRes = await fetch(`http://127.0.0.1:${PORT + 2}/kpi/summary`);
      expect(pausedRes.status).toBe(200);
      expect((await pausedRes.json()).botStatus).toBe("paused");
    } finally {
      await srv.close();
    }
  });


  it("GET /health and /kpi/summary expose grounded runtime snapshot when provided", async () => {
    const srv = await createServer({
      port: PORT + 4,
      host: "127.0.0.1",
      getBotStatus: () => "running",
      getRuntimeSnapshot: () => ({
        status: "running",
        mode: "paper",
        paperModeActive: true,
        cycleInFlight: false,
        counters: {
          cycleCount: 3,
          decisionCount: 3,
          executionCount: 2,
          blockedCount: 1,
          errorCount: 0,
        },
        lastCycleAt: "2026-03-17T12:00:00.000Z",
        lastDecisionAt: "2026-03-17T12:00:00.000Z",
        lastState: {
          stage: "monitor",
          traceId: "trace-paper",
          timestamp: "2026-03-17T12:00:00.000Z",
          blocked: false,
        },
        degradedState: {
          active: true,
          consecutiveCycles: 2,
          lastDegradedAt: "2026-03-17T12:00:00.000Z",
          lastReason: "All adapters failed: Adapter primary: circuit breaker open",
        },
        adapterHealth: {
          total: 2,
          healthy: 1,
          unhealthy: 1,
          degraded: true,
          adapterIds: ["primary", "secondary"],
          unhealthyAdapterIds: ["primary"],
        },
      }),
    });

    try {
      const healthRes = await fetch(`http://127.0.0.1:${PORT + 4}/health`);
      expect(healthRes.status).toBe(200);
      const health = await healthRes.json();
      expect(health.runtime.mode).toBe("paper");
      expect(health.runtime.paperModeActive).toBe(true);
      expect(health.status).toBe("DEGRADED");
      expect(health.runtime.lastEngineStage).toBe("monitor");
      expect(health.runtime.degraded).toMatchObject({ active: true, consecutiveCycles: 2 });
      expect(health.runtime.adapterHealth).toMatchObject({ degraded: true, unhealthyAdapterIds: ["primary"] });

      const summaryRes = await fetch(`http://127.0.0.1:${PORT + 4}/kpi/summary`);
      expect(summaryRes.status).toBe(200);
      const summary = await summaryRes.json();
      expect(summary.runtime.mode).toBe("paper");
      expect(summary.runtime.executionCount).toBe(2);
      expect(summary.runtime.degraded).toMatchObject({ active: true, consecutiveCycles: 2 });
      expect(summary.runtime.adapterHealth).toMatchObject({ degraded: true, unhealthyAdapterIds: ["primary"] });
    } finally {
      await srv.close();
    }
  });

  it("derives health, dataQuality, and adapter status from runtime snapshot when circuit breaker is not wired", async () => {
    const srv = await createServer({
      port: PORT + 5,
      host: "127.0.0.1",
      getRuntimeSnapshot: () => ({
        status: "running",
        mode: "paper",
        paperModeActive: true,
        cycleInFlight: false,
        counters: {
          cycleCount: 4,
          decisionCount: 4,
          executionCount: 3,
          blockedCount: 1,
          errorCount: 0,
        },
        lastCycleAt: "2026-03-18T12:00:00.000Z",
        lastDecisionAt: "2026-03-18T12:00:00.000Z",
        lastState: {
          stage: "monitor",
          traceId: "trace-paper-runtime-only",
          timestamp: "2026-03-18T12:00:00.000Z",
          blocked: false,
        },
        degradedState: {
          active: false,
          consecutiveCycles: 0,
          recoveryCount: 1,
          lastRecoveredAt: "2026-03-18T11:59:00.000Z",
          lastReason: "paper ingest recovered",
        },
        adapterHealth: {
          total: 2,
          healthy: 1,
          unhealthy: 1,
          degraded: true,
          adapterIds: ["primary", "secondary"],
          degradedAdapterIds: ["primary"],
          unhealthyAdapterIds: ["primary"],
        },
      }),
    });

    try {
      const [healthRes, summaryRes, adaptersRes] = await Promise.all([
        fetch(`http://127.0.0.1:${PORT + 5}/health`),
        fetch(`http://127.0.0.1:${PORT + 5}/kpi/summary`),
        fetch(`http://127.0.0.1:${PORT + 5}/kpi/adapters`),
      ]);

      expect(healthRes.status).toBe(200);
      expect(summaryRes.status).toBe(200);
      expect(adaptersRes.status).toBe(200);

      const health = await healthRes.json();
      const summary = await summaryRes.json();
      const adapters = await adaptersRes.json();

      expect(health.status).toBe("DEGRADED");
      expect(summary.dataQuality).toBe(0.5);
      expect(adapters.adapters).toEqual([
        {
          id: "primary",
          status: "down",
          latencyMs: 0,
          lastSuccessAt: "2026-03-18T12:00:00.000Z",
          consecutiveFailures: 0,
        },
        {
          id: "secondary",
          status: "healthy",
          latencyMs: 0,
          lastSuccessAt: "2026-03-18T12:00:00.000Z",
          consecutiveFailures: 0,
        },
      ]);
    } finally {
      await srv.close();
    }
  });

  it("GET /health and /kpi/summary expose live-test control state while /runtime/status stays private", async () => {
    const srv = await createServer({
      port: PORT + 8,
      host: "127.0.0.1",
      getBotStatus: () => "running",
      getRuntimeSnapshot: () => ({
        status: "running",
        mode: "live",
        paperModeActive: false,
        cycleInFlight: false,
        liveControl: {
          mode: "live",
          liveTestMode: true,
          roundStatus: "running",
          roundStartedAt: "2026-03-19T12:00:00.000Z",
          posture: "live_armed",
          rolloutPosture: "micro_live",
          rolloutConfigured: true,
          rolloutConfigValid: true,
          rolloutReasonCode: undefined,
          rolloutReasonDetail: undefined,
          rolloutLastReasonAt: undefined,
          caps: {
            requireArm: true,
            maxNotionalPerTrade: 25,
            maxTradesPerWindow: 2,
            windowMs: 60 * 60 * 1000,
            cooldownMs: 60 * 1000,
            maxInFlight: 1,
            failuresToBlock: 3,
            failureWindowMs: 15 * 60 * 1000,
            maxDailyNotional: 50,
            allowlistTokens: [],
          },
          armed: true,
          killSwitchActive: false,
          blocked: false,
          disarmed: false,
          stopped: false,
          reasonCode: undefined,
          reasonDetail: undefined,
          counters: {
            inFlight: 0,
            tradesInWindow: 0,
            failuresInWindow: 0,
            dailyNotional: 0,
            tradesToday: 0,
            dailyLossUsd: 0,
          },
        },
        counters: {
          cycleCount: 0,
          decisionCount: 0,
          executionCount: 0,
          blockedCount: 0,
          errorCount: 0,
        },
      }),
    });

    try {
      const [healthRes, summaryRes, statusRes] = await Promise.all([
        fetch(`http://127.0.0.1:${PORT + 8}/health`),
        fetch(`http://127.0.0.1:${PORT + 8}/kpi/summary`),
        fetch(`http://127.0.0.1:${PORT + 8}/runtime/status`),
      ]);

      expect(healthRes.status).toBe(200);
      expect(summaryRes.status).toBe(200);
      expect(statusRes.status).toBe(404);

      const health = await healthRes.json();
      const summary = await summaryRes.json();

      expect(health.runtime.liveControl).toMatchObject({
        liveTestMode: true,
        roundStatus: "running",
        roundStartedAt: "2026-03-19T12:00:00.000Z",
        disarmed: false,
        stopped: false,
      });
      expect(summary.runtime.liveControl).toMatchObject({
        liveTestMode: true,
        roundStatus: "running",
        disarmed: false,
        stopped: false,
      });
    } finally {
      await srv.close();
    }
  });

  it("GET /kpi/summary returns bot status and metrics", async () => {
    const res = await fetch(`${baseUrl}/kpi/summary`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      botStatus: expect.stringMatching(/^(running|paused|stopped)$/),
      riskScore: expect.any(Number),
      chaosPassRate: expect.any(Number),
      dataQuality: expect.any(Number),
      tradesToday: expect.any(Number),
      metricProvenance: {
        riskScore: "default",
        chaosPassRate: "default",
        dataQuality: expect.stringMatching(/^(wired|derived|default)$/),
        lastDecisionAt: expect.stringMatching(/^(wired|derived|default)$/),
        tradesToday: expect.stringMatching(/^(wired|derived|default)$/),
      },
    });
    expect(typeof body.lastDecisionAt === "string" || body.lastDecisionAt === null).toBe(true);
  });

  it("does not expose control mutations on the public bot surface", async () => {
    const controlRes = await fetch(`${baseUrl}/control/runtime-config`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        patch: {
          filters: {
            allowlistTokens: ["SOL"],
          },
        },
      }),
    });

    expect(controlRes.status).toBe(404);

    const emergencyRes = await fetch(`${baseUrl}/emergency-stop`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    });

    expect([400, 404]).toContain(emergencyRes.status);
  });

  it("derives lastDecisionAt from runtime snapshot when action logger has no entries", async () => {
    const srv = await createServer({
      port: PORT + 6,
      host: "127.0.0.1",
      actionLogger: new InMemoryActionLogger(),
      getRuntimeSnapshot: () => ({
        status: "running",
        mode: "paper",
        paperModeActive: true,
        cycleInFlight: false,
        counters: {
          cycleCount: 2,
          decisionCount: 2,
          executionCount: 1,
          blockedCount: 1,
          errorCount: 0,
        },
        lastCycleAt: "2026-03-18T12:01:00.000Z",
        lastDecisionAt: "2026-03-18T12:01:00.000Z",
        lastState: {
          stage: "monitor",
          traceId: "trace-runtime-fallback",
          timestamp: "2026-03-18T12:01:00.000Z",
          blocked: false,
        },
      }),
    });

    try {
      const summaryRes = await fetch(`http://127.0.0.1:${PORT + 6}/kpi/summary`);
      expect(summaryRes.status).toBe(200);
      const summary = await summaryRes.json();
      expect(summary.lastDecisionAt).toBe("2026-03-18T12:01:00.000Z");
      expect(summary.tradesToday).toBe(0);
      expect(summary.metricProvenance?.lastDecisionAt).toBe("wired");
    } finally {
      await srv.close();
    }
  });

  it("counts tradesToday from grounded runtime action entries", async () => {
    const actionLogger = new InMemoryActionLogger();
    await actionLogger.append({
      agentId: "engine",
      userId: "system",
      action: "complete",
      input: {
        signal: { confidence: 0.8 },
        tradeIntent: { tokenOut: "USDC" },
        executionReport: { success: true, paperExecution: true },
      },
      output: {},
      ts: "2026-03-18T12:02:00.000Z",
      blocked: false,
      traceId: "trace-trade-complete",
    });
    await actionLogger.append({
      agentId: "engine",
      userId: "system",
      action: "risk_blocked",
      input: {
        signal: { confidence: 0.2 },
        tradeIntent: { tokenOut: "USDC" },
      },
      output: {},
      ts: "2026-03-18T12:03:00.000Z",
      blocked: true,
      reason: "RISK_FAIL_CLOSED",
      traceId: "trace-trade-blocked",
    });

    const srv = await createServer({
      port: PORT + 7,
      host: "127.0.0.1",
      actionLogger,
    });

    try {
      const [summaryRes, decisionsRes] = await Promise.all([
        fetch(`http://127.0.0.1:${PORT + 7}/kpi/summary`),
        fetch(`http://127.0.0.1:${PORT + 7}/kpi/decisions`),
      ]);
      expect(summaryRes.status).toBe(200);
      expect(decisionsRes.status).toBe(200);

      const summary = await summaryRes.json();
      const decisions = await decisionsRes.json();
      expect(summary.tradesToday).toBe(1);
      expect(summary.lastDecisionAt).toBe("2026-03-18T12:03:00.000Z");
      expect(summary.metricProvenance?.tradesToday).toBe("derived");
      expect(summary.metricProvenance?.lastDecisionAt).toBe("derived");
      expect(decisions.decisions[0]).toMatchObject({
        action: "block",
        token: "USDC",
        confidence: 0.2,
        reasons: ["RISK_FAIL_CLOSED"],
        provenanceKind: "derived",
        source: "action_log_projection",
        actionLogAction: "risk_blocked",
      });
      expect(decisions.decisions[1]).toMatchObject({
        action: "allow",
        token: "USDC",
        confidence: 0.8,
        provenanceKind: "derived",
        source: "action_log_projection",
        actionLogAction: "complete",
      });
    } finally {
      await srv.close();
    }
  });

  it("GET /kpi/decisions returns decisions array", async () => {
    const res = await fetch(`${baseUrl}/kpi/decisions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("decisions");
    expect(Array.isArray(body.decisions)).toBe(true);
  });

  it("GET /kpi/adapters returns adapter health", async () => {
    const res = await fetch(`${baseUrl}/kpi/adapters`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("adapters");
    expect(Array.isArray(body.adapters)).toBe(true);
    expect(body.adapters.length).toBeGreaterThanOrEqual(0);
    for (const a of body.adapters) {
      expect(a).toMatchObject({
        id: expect.any(String),
        status: expect.stringMatching(/^(healthy|degraded|down)$/),
        latencyMs: expect.any(Number),
        lastSuccessAt: expect.any(String),
        consecutiveFailures: expect.any(Number),
      });
    }
  });

  it("GET /kpi/metrics returns p95 latency", async () => {
    const res = await fetch(`${baseUrl}/kpi/metrics`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("p95LatencyMs");
    expect(typeof body.p95LatencyMs).toBe("object");
    expect(body.p95LatencyMs.adapter).toBe(42);
  });

  it("decisions include action log entries when present", async () => {
    const actionLogger = new InMemoryActionLogger();
    await actionLogger.append({
      agentId: "risk",
      userId: "test",
      action: "evaluate",
      input: { token: "So11111111111111111111111111111111111111112" },
      output: { confidence: 0.85 },
      ts: new Date().toISOString(),
      blocked: false,
    });
    const srv = await createServer({
      port: PORT + 1,
      host: "127.0.0.1",
      actionLogger,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${PORT + 1}/kpi/decisions`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.decisions.length).toBeGreaterThanOrEqual(1);
      const dec = body.decisions[0];
      expect(dec.action).toBe("allow");
      expect(dec.confidence).toBe(0.85);
      expect(dec.token).toContain("So11");
      expect(dec.provenanceKind).toBe("derived");
      expect(dec.source).toBe("action_log_projection");
    } finally {
      await srv.close();
    }
  });
});
