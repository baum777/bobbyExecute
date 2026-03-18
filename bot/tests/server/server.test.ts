/**
 * Wave 3: Server routes - /health, /kpi/* (offline with stubs).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createServer } from "../../src/server/index.js";
import { CircuitBreaker } from "../../src/governance/circuit-breaker.js";
import { InMemoryActionLogger } from "../../src/observability/action-log.js";
import { ADAPTER_IDS } from "../../src/adapters/adapters-with-cb.js";

const PORT = 3334;

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
    });
    expect(typeof body.lastDecisionAt === "string" || body.lastDecisionAt === null).toBe(true);
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
    } finally {
      await srv.close();
    }
  });
});
