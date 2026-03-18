import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/index.js";
import { createDryRunRuntime } from "../../src/runtime/dry-run-runtime.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";
import {
  InMemoryRuntimeCycleSummaryWriter,
  type RuntimeCycleSummary,
} from "../../src/persistence/runtime-cycle-summary-repository.js";
import { InMemoryIncidentRepository, type IncidentRecord } from "../../src/persistence/incident-repository.js";
import { RepositoryIncidentRecorder } from "../../src/observability/incidents.js";

const config = {
  nodeEnv: "test" as const,
  dryRun: true,
  tradingEnabled: false,
  liveTestMode: false,
  executionMode: "dry" as const,
  rpcMode: "stub" as const,
  rpcUrl: "https://api.mainnet-beta.solana.com",
  dexpaprikaBaseUrl: "https://api.dexpaprika.com",
  moralisBaseUrl: "https://solana-gateway.moralis.io",
  walletAddress: "11111111111111111111111111111111",
  journalPath: "data/operator-surfaces-journal.jsonl",
  circuitBreakerFailureThreshold: 5,
  circuitBreakerRecoveryMs: 60_000,
  maxSlippagePercent: 5,
  reviewPolicyMode: "required" as const,
};
const OPERATOR_READ_TOKEN = "phase10-operator-read-token";

function authHeaders(token = OPERATOR_READ_TOKEN): HeadersInit {
  return { "x-operator-token": token };
}

function createMarketSnapshot(traceId: string, freshnessMs = 0) {
  return {
    schema_version: "market.v1" as const,
    traceId,
    timestamp: new Date().toISOString(),
    source: "dexpaprika" as const,
    poolId: `${traceId}-pool`,
    baseToken: "SOL",
    quoteToken: "USD",
    priceUsd: 100,
    volume24h: 1_000,
    liquidity: 50_000,
    freshnessMs,
    status: "ok" as const,
  };
}

async function waitForCondition(check: () => boolean | Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for server test condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("Operator read-only surfaces", () => {
  const servers: Array<Awaited<ReturnType<typeof createServer>>> = [];
  const runtimes: ReturnType<typeof createDryRunRuntime>[] = [];

  afterEach(async () => {
    for (const runtime of runtimes) await runtime.stop();
    for (const server of servers) await server.close();
    resetKillSwitch();
    servers.length = 0;
    runtimes.length = 0;
  });

  it("GET /runtime/cycles returns grounded persisted summaries", async () => {
    const cycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const incidentRecorder = new RepositoryIncidentRecorder(new InMemoryIncidentRepository());
    const runtime = createDryRunRuntime(config, {
      cycleSummaryWriter,
      incidentRecorder,
    });
    runtimes.push(runtime);
    await runtime.start();
    const persistedCycles = await cycleSummaryWriter.list(5);

    const server = await createServer({
      port: 3345,
      host: "127.0.0.1",
      runtime,
      getRuntimeSnapshot: () => runtime.getSnapshot(),
      operatorReadAuthToken: OPERATOR_READ_TOKEN,
    });
    servers.push(server);

    const res = await fetch("http://127.0.0.1:3345/runtime/cycles?limit=5", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.cycles)).toBe(true);
    expect(body.cycles.length).toBeGreaterThanOrEqual(1);
    expect(body.cycles[0]).toHaveProperty("cycleTimestamp");
    expect(body.cycles).toEqual(persistedCycles);
  });

  it("GET /runtime/cycles respects bounded limits without fabricating results", async () => {
    const cycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const seededCycles: RuntimeCycleSummary[] = [
      {
        cycleTimestamp: "2026-03-18T00:00:00.000Z",
        traceId: "cycle-1",
        mode: "dry",
        outcome: "blocked",
        intakeOutcome: "invalid",
        advanced: false,
        stage: "risk",
        blocked: true,
        blockedReason: "BLOCKED_1",
        decisionOccurred: false,
        signalOccurred: false,
        riskOccurred: true,
        chaosOccurred: false,
        executionOccurred: false,
        verificationOccurred: false,
        paperExecutionProduced: false,
        errorOccurred: false,
        incidentIds: ["incident-1"],
      },
      {
        cycleTimestamp: "2026-03-18T00:01:00.000Z",
        traceId: "cycle-2",
        mode: "dry",
        outcome: "blocked",
        intakeOutcome: "invalid",
        advanced: false,
        stage: "risk",
        blocked: true,
        blockedReason: "BLOCKED_2",
        decisionOccurred: false,
        signalOccurred: false,
        riskOccurred: true,
        chaosOccurred: false,
        executionOccurred: false,
        verificationOccurred: false,
        paperExecutionProduced: false,
        errorOccurred: false,
        incidentIds: ["incident-2"],
      },
      {
        cycleTimestamp: "2026-03-18T00:02:00.000Z",
        traceId: "cycle-3",
        mode: "dry",
        outcome: "blocked",
        intakeOutcome: "invalid",
        advanced: false,
        stage: "risk",
        blocked: true,
        blockedReason: "BLOCKED_3",
        decisionOccurred: false,
        signalOccurred: false,
        riskOccurred: true,
        chaosOccurred: false,
        executionOccurred: false,
        verificationOccurred: false,
        paperExecutionProduced: false,
        errorOccurred: false,
        incidentIds: ["incident-3"],
      },
    ];
    for (const cycle of seededCycles) {
      await cycleSummaryWriter.append(cycle);
    }

    const runtime = createDryRunRuntime(config, {
      cycleSummaryWriter,
      incidentRecorder: new RepositoryIncidentRecorder(new InMemoryIncidentRepository()),
    });
    runtimes.push(runtime);

    const server = await createServer({
      port: 3346,
      host: "127.0.0.1",
      runtime,
      getRuntimeSnapshot: () => runtime.getSnapshot(),
      operatorReadAuthToken: OPERATOR_READ_TOKEN,
    });
    servers.push(server);

    const res = await fetch("http://127.0.0.1:3346/runtime/cycles?limit=2", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.cycles).toEqual(seededCycles.slice(-2));
  });

  it("GET /incidents returns grounded persisted incidents including journal_failure", async () => {
    const incidentRepository = new InMemoryIncidentRepository();
    const incidentRecorder = new RepositoryIncidentRecorder(incidentRepository);
    const runtime = createDryRunRuntime(config, {
      cycleSummaryWriter: new InMemoryRuntimeCycleSummaryWriter(),
      incidentRecorder,
    });
    runtimes.push(runtime);
    await incidentRecorder.record({
      severity: "critical",
      type: "journal_failure",
      message: "Journal append failed",
      at: "2026-03-18T00:03:00.000Z",
      details: { stage: "chaos_decision", traceId: "trace-journal-failure" },
    });
    await incidentRecorder.record({
      severity: "warning",
      type: "runtime_paused",
      message: "Paused for review",
      at: "2026-03-18T00:04:00.000Z",
      details: { reason: "operator" },
    });
    const persistedIncidents = await incidentRepository.list(10);

    const server = await createServer({
      port: 3347,
      host: "127.0.0.1",
      runtime,
      getRuntimeSnapshot: () => runtime.getSnapshot(),
      operatorReadAuthToken: OPERATOR_READ_TOKEN,
    });
    servers.push(server);

    const res = await fetch("http://127.0.0.1:3347/incidents?limit=10", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.incidents).toEqual(persistedIncidents);
    expect(body.incidents.some((incident: IncidentRecord) => incident.type === "journal_failure")).toBe(true);
  });

  it("GET /runtime/cycles/:traceId/replay returns persisted summary, linked incidents, and journal evidence", async () => {
    const cycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const incidentRepository = new InMemoryIncidentRepository();
    const incidentRecorder = new RepositoryIncidentRecorder(incidentRepository);
    const runtime = createDryRunRuntime(
      { ...config, executionMode: "paper", dryRun: false },
      {
        loopIntervalMs: 60_000,
        paperMarketAdapters: [{ id: "dexpaprika", fetch: async () => ({
          schema_version: "market.v1",
          traceId: "market-trace",
          timestamp: "2026-03-18T00:00:00.000Z",
          source: "dexpaprika",
          poolId: "paper-pool",
          baseToken: "SOL",
          quoteToken: "USD",
          priceUsd: 100,
          volume24h: 1000,
          liquidity: 10000,
          freshnessMs: 0,
          status: "ok",
        }) }],
        fetchPaperWalletSnapshot: async () => ({
          traceId: "wallet-trace",
          timestamp: "2026-03-18T00:00:00.000Z",
          source: "moralis",
          walletAddress: config.walletAddress,
          balances: [],
          totalUsd: 0,
        }),
        cycleSummaryWriter,
        incidentRecorder,
      }
    );
    runtimes.push(runtime);
    await runtime.start();

    const summary = (await cycleSummaryWriter.list(5))[0];
    const server = await createServer({
      port: 3352,
      host: "127.0.0.1",
      runtime,
      getRuntimeSnapshot: () => runtime.getSnapshot(),
      operatorReadAuthToken: OPERATOR_READ_TOKEN,
    });
    servers.push(server);

    const res = await fetch(`http://127.0.0.1:3352/runtime/cycles/${summary.traceId}/replay`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.replay.summary).toEqual(summary);
    expect(body.replay.summary.outcome).toBe("success");
    expect(body.replay.summary.execution).toMatchObject({
      success: true,
      mode: "paper",
      paperExecution: true,
    });
    expect(body.replay.journal.some((entry: { stage: string }) => entry.stage === "execution_result")).toBe(true);
    expect(body.replay.journal.some((entry: { stage: string }) => entry.stage === "verification_result")).toBe(true);
    expect(body.replay.incidents).toEqual([]);
  });

  it("repeated paper cycles keep health, KPI, operator, and persistence surfaces aligned through degradation and recovery", async () => {
    const cycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const incidentRepository = new InMemoryIncidentRepository();
    let adapterCalls = 0;

    const runtime = createDryRunRuntime(
      { ...config, executionMode: "paper", dryRun: false },
      {
        loopIntervalMs: 50,
        paperMarketAdapters: [
          {
            id: "dexpaprika",
            fetch: async () => {
              adapterCalls += 1;
              return createMarketSnapshot(
                `operator-cycle-${adapterCalls}`,
                adapterCalls === 2 ? 45_000 : 0
              );
            },
          },
        ],
        fetchPaperWalletSnapshot: async () => ({
          traceId: "operator-wallet-trace",
          timestamp: new Date().toISOString(),
          source: "moralis",
          walletAddress: config.walletAddress,
          balances: [],
          totalUsd: 0,
        }),
        cycleSummaryWriter,
        incidentRecorder: new RepositoryIncidentRecorder(incidentRepository),
      }
    );
    runtimes.push(runtime);
    await runtime.start();
    await waitForCondition(async () => {
      const degradedState = runtime.getSnapshot().degradedState;
      const persistedCycles = await cycleSummaryWriter.list(10);
      return (
        persistedCycles.length >= 3 &&
        degradedState?.active === false &&
        degradedState?.recoveryCount === 1
      );
    });
    await runtime.pause("operator_parity_pause");

    const server = await createServer({
      port: 3354,
      host: "127.0.0.1",
      runtime,
      getRuntimeSnapshot: () => runtime.getSnapshot(),
      operatorReadAuthToken: OPERATOR_READ_TOKEN,
      getBotStatus: () => {
        const status = runtime.getStatus();
        return status === "running" ? "running" : status === "paused" ? "paused" : "stopped";
      },
    });
    servers.push(server);

    const [healthRes, kpiRes, statusRes, cyclesRes, incidentsRes] = await Promise.all([
      fetch("http://127.0.0.1:3354/health"),
      fetch("http://127.0.0.1:3354/kpi/summary"),
      fetch("http://127.0.0.1:3354/runtime/status", { headers: authHeaders() }),
      fetch("http://127.0.0.1:3354/runtime/cycles?limit=10", { headers: authHeaders() }),
      fetch("http://127.0.0.1:3354/incidents?limit=10", { headers: authHeaders() }),
    ]);

    const healthBody = await healthRes.json();
    const kpiBody = await kpiRes.json();
    const statusBody = await statusRes.json();
    const cyclesBody = await cyclesRes.json();
    const incidentsBody = await incidentsRes.json();
    const snapshot = runtime.getSnapshot();
    const persistedCycles = await cycleSummaryWriter.list(10);
    const persistedIncidents = await incidentRepository.list(10);

    expect(healthRes.status).toBe(200);
    expect(kpiRes.status).toBe(200);
    expect(statusRes.status).toBe(200);
    expect(cyclesRes.status).toBe(200);
    expect(incidentsRes.status).toBe(200);

    expect(statusBody.success).toBe(true);
    expect(statusBody.runtime).toEqual(snapshot);
    expect(snapshot.status).toBe("paused");
    expect(snapshot.degradedState).toMatchObject({
      active: false,
      consecutiveCycles: 0,
      recoveryCount: 1,
    });
    expect(snapshot.degradedState?.lastRecoveredAt).toBeDefined();
    expect(snapshot.degradedState?.lastReason).toContain("stale");
    expect(snapshot.adapterHealth).toMatchObject({
      degraded: false,
      degradedAdapterIds: [],
      unhealthyAdapterIds: [],
    });

    expect(healthBody.botStatus).toBe("paused");
    expect(healthBody.runtime).toMatchObject({
      status: "paused",
      lastIntakeOutcome: snapshot.lastCycleSummary?.intakeOutcome,
      degraded: {
        active: false,
        recoveryCount: 1,
      },
      adapterHealth: {
        degraded: false,
        degradedAdapterIds: [],
      },
    });

    expect(kpiBody.botStatus).toBe("paused");
    expect(kpiBody.runtime).toMatchObject({
      status: "paused",
      cycleCount: snapshot.counters.cycleCount,
      blockedCount: snapshot.counters.blockedCount,
      degraded: {
        active: false,
        recoveryCount: 1,
      },
      adapterHealth: {
        degraded: false,
        degradedAdapterIds: [],
      },
    });

    expect(cyclesBody.success).toBe(true);
    expect(cyclesBody.cycles).toEqual(persistedCycles);
    expect(cyclesBody.cycles.length).toBeGreaterThanOrEqual(3);
    expect(cyclesBody.cycles[1]).toMatchObject({
      outcome: "blocked",
      intakeOutcome: "stale",
      degradedState: {
        active: true,
        recoveryCount: 0,
        recoveredThisCycle: false,
      },
      adapterHealth: {
        degraded: true,
        degradedAdapterIds: ["dexpaprika"],
        unhealthyAdapterIds: [],
      },
    });
    expect(cyclesBody.cycles[2]).toMatchObject({
      outcome: "success",
      degradedState: {
        active: false,
        recoveryCount: 1,
        recoveredThisCycle: true,
      },
      adapterHealth: {
        degraded: false,
        degradedAdapterIds: [],
      },
    });

    expect(incidentsBody.success).toBe(true);
    expect(incidentsBody.incidents).toEqual(persistedIncidents);
    expect(incidentsBody.incidents.some((incident: IncidentRecord) => incident.type === "paper_ingest_blocked")).toBe(true);
  });

  it("GET /incidents respects bounded limits", async () => {
    const incidentRepository = new InMemoryIncidentRepository();
    const incidentRecorder = new RepositoryIncidentRecorder(incidentRepository);
    const runtime = createDryRunRuntime(config, {
      cycleSummaryWriter: new InMemoryRuntimeCycleSummaryWriter(),
      incidentRecorder,
    });
    runtimes.push(runtime);
    const seededIncidents: IncidentRecord[] = [
      {
        id: "incident-1",
        at: "2026-03-18T00:00:00.000Z",
        severity: "warning",
        type: "runtime_paused",
        message: "Paused 1",
      },
      {
        id: "incident-2",
        at: "2026-03-18T00:01:00.000Z",
        severity: "critical",
        type: "journal_failure",
        message: "Journal failure 2",
      },
      {
        id: "incident-3",
        at: "2026-03-18T00:02:00.000Z",
        severity: "critical",
        type: "runtime_cycle_error",
        message: "Cycle error 3",
      },
    ];
    for (const incident of seededIncidents) {
      await incidentRepository.append(incident);
    }

    const server = await createServer({
      port: 3348,
      host: "127.0.0.1",
      runtime,
      getRuntimeSnapshot: () => runtime.getSnapshot(),
      operatorReadAuthToken: OPERATOR_READ_TOKEN,
    });
    servers.push(server);

    const res = await fetch("http://127.0.0.1:3348/incidents?limit=2", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.incidents).toEqual(seededIncidents.slice(-2));
  });

  it("GET /runtime/status returns actual runtime status and stays aligned with /health and /kpi/summary", async () => {
    const runtime = createDryRunRuntime(config, {
      cycleSummaryWriter: new InMemoryRuntimeCycleSummaryWriter(),
      incidentRecorder: new RepositoryIncidentRecorder(new InMemoryIncidentRepository()),
    });
    runtimes.push(runtime);
    await runtime.start();
    await runtime.pause("operator_read_surface_test");

    const server = await createServer({
      port: 3349,
      host: "127.0.0.1",
      runtime,
      getRuntimeSnapshot: () => runtime.getSnapshot(),
      operatorReadAuthToken: OPERATOR_READ_TOKEN,
      getBotStatus: () => {
        const status = runtime.getStatus();
        return status === "running" ? "running" : status === "paused" ? "paused" : "stopped";
      },
    });
    servers.push(server);

    const [statusRes, healthRes, kpiRes] = await Promise.all([
      fetch("http://127.0.0.1:3349/runtime/status", { headers: authHeaders() }),
      fetch("http://127.0.0.1:3349/health"),
      fetch("http://127.0.0.1:3349/kpi/summary"),
    ]);

    expect(statusRes.status).toBe(200);
    const statusBody = await statusRes.json();
    const healthBody = await healthRes.json();
    const kpiBody = await kpiRes.json();

    expect(statusBody.success).toBe(true);
    expect(statusBody.runtime.status).toBe("paused");
    expect(statusBody.runtime.status).toBe(runtime.getSnapshot().status);
    expect(healthBody.botStatus).toBe("paused");
    expect(healthBody.runtime.status).toBe(statusBody.runtime.status);
    expect(kpiBody.botStatus).toBe("paused");
    expect(kpiBody.runtime.status).toBe(statusBody.runtime.status);
  });

  it("operator read surfaces fail explicitly when runtime wiring is unavailable", async () => {
    const server = await createServer({
      port: 3350,
      host: "127.0.0.1",
      operatorReadAuthToken: OPERATOR_READ_TOKEN,
    });
    servers.push(server);

    const [cyclesRes, replayRes, incidentsRes, statusRes] = await Promise.all([
      fetch("http://127.0.0.1:3350/runtime/cycles", { headers: authHeaders() }),
      fetch("http://127.0.0.1:3350/runtime/cycles/missing/replay", { headers: authHeaders() }),
      fetch("http://127.0.0.1:3350/incidents", { headers: authHeaders() }),
      fetch("http://127.0.0.1:3350/runtime/status", { headers: authHeaders() }),
    ]);

    expect(cyclesRes.status).toBe(501);
    await expect(cyclesRes.json()).resolves.toMatchObject({
      success: false,
      code: "runtime_unavailable",
    });

    expect(incidentsRes.status).toBe(501);
    await expect(incidentsRes.json()).resolves.toMatchObject({
      success: false,
      code: "runtime_unavailable",
    });

    expect(replayRes.status).toBe(501);
    await expect(replayRes.json()).resolves.toMatchObject({
      success: false,
      code: "runtime_unavailable",
    });

    expect(statusRes.status).toBe(501);
    await expect(statusRes.json()).resolves.toMatchObject({
      success: false,
      code: "runtime_unavailable",
    });
  });

  it("operator read surfaces reject invalid limits explicitly", async () => {
    const runtime = createDryRunRuntime(config, {
      cycleSummaryWriter: new InMemoryRuntimeCycleSummaryWriter(),
      incidentRecorder: new RepositoryIncidentRecorder(new InMemoryIncidentRepository()),
    });
    runtimes.push(runtime);

    const server = await createServer({
      port: 3351,
      host: "127.0.0.1",
      runtime,
      getRuntimeSnapshot: () => runtime.getSnapshot(),
      operatorReadAuthToken: OPERATOR_READ_TOKEN,
    });
    servers.push(server);

    const [nonNumericCycles, oversizedIncidents] = await Promise.all([
      fetch("http://127.0.0.1:3351/runtime/cycles?limit=abc", { headers: authHeaders() }),
      fetch("http://127.0.0.1:3351/incidents?limit=201", { headers: authHeaders() }),
    ]);

    expect(nonNumericCycles.status).toBe(400);
    await expect(nonNumericCycles.json()).resolves.toMatchObject({
      success: false,
      code: "invalid_limit",
    });

    expect(oversizedIncidents.status).toBe(400);
    await expect(oversizedIncidents.json()).resolves.toMatchObject({
      success: false,
      code: "invalid_limit",
    });
  });

  it("GET /runtime/cycles/:traceId/replay returns explicit 404 for missing persisted cycle evidence", async () => {
    const runtime = createDryRunRuntime(config, {
      cycleSummaryWriter: new InMemoryRuntimeCycleSummaryWriter(),
      incidentRecorder: new RepositoryIncidentRecorder(new InMemoryIncidentRepository()),
    });
    runtimes.push(runtime);

    const server = await createServer({
      port: 3353,
      host: "127.0.0.1",
      runtime,
      getRuntimeSnapshot: () => runtime.getSnapshot(),
      operatorReadAuthToken: OPERATOR_READ_TOKEN,
    });
    servers.push(server);

    const res = await fetch("http://127.0.0.1:3353/runtime/cycles/missing-trace/replay", { headers: authHeaders() });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      code: "cycle_not_found",
    });
  });

  it("operator read routes reject missing/invalid auth and fail closed when token is unconfigured", async () => {
    const runtime = createDryRunRuntime(config, {
      cycleSummaryWriter: new InMemoryRuntimeCycleSummaryWriter(),
      incidentRecorder: new RepositoryIncidentRecorder(new InMemoryIncidentRepository()),
    });
    runtimes.push(runtime);

    const securedServer = await createServer({
      port: 3355,
      host: "127.0.0.1",
      runtime,
      getRuntimeSnapshot: () => runtime.getSnapshot(),
      operatorReadAuthToken: OPERATOR_READ_TOKEN,
    });
    servers.push(securedServer);

    const [missing, invalid] = await Promise.all([
      fetch("http://127.0.0.1:3355/runtime/status"),
      fetch("http://127.0.0.1:3355/runtime/status", { headers: authHeaders("wrong-token") }),
    ]);

    expect(missing.status).toBe(403);
    await expect(missing.json()).resolves.toMatchObject({
      success: false,
      code: "operator_auth_invalid",
    });
    expect(invalid.status).toBe(403);
    await expect(invalid.json()).resolves.toMatchObject({
      success: false,
      code: "operator_auth_invalid",
    });

    const unconfiguredServer = await createServer({
      port: 3356,
      host: "127.0.0.1",
      runtime,
      getRuntimeSnapshot: () => runtime.getSnapshot(),
    });
    servers.push(unconfiguredServer);

    const unconfigured = await fetch("http://127.0.0.1:3356/runtime/status", {
      headers: authHeaders(),
    });
    expect(unconfigured.status).toBe(403);
    await expect(unconfigured.json()).resolves.toMatchObject({
      success: false,
      code: "operator_auth_unconfigured",
    });
  });
});
