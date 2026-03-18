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
    });
    servers.push(server);

    const res = await fetch("http://127.0.0.1:3345/runtime/cycles?limit=5");
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
        mode: "dry",
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
        traceId: "cycle-1",
      },
      {
        cycleTimestamp: "2026-03-18T00:01:00.000Z",
        mode: "dry",
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
        traceId: "cycle-2",
      },
      {
        cycleTimestamp: "2026-03-18T00:02:00.000Z",
        mode: "dry",
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
        traceId: "cycle-3",
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
    });
    servers.push(server);

    const res = await fetch("http://127.0.0.1:3346/runtime/cycles?limit=2");
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
    });
    servers.push(server);

    const res = await fetch("http://127.0.0.1:3347/incidents?limit=10");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.incidents).toEqual(persistedIncidents);
    expect(body.incidents.some((incident: IncidentRecord) => incident.type === "journal_failure")).toBe(true);
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
    });
    servers.push(server);

    const res = await fetch("http://127.0.0.1:3348/incidents?limit=2");
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
      getBotStatus: () => {
        const status = runtime.getStatus();
        return status === "running" ? "running" : status === "paused" ? "paused" : "stopped";
      },
    });
    servers.push(server);

    const [statusRes, healthRes, kpiRes] = await Promise.all([
      fetch("http://127.0.0.1:3349/runtime/status"),
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
    });
    servers.push(server);

    const [cyclesRes, incidentsRes, statusRes] = await Promise.all([
      fetch("http://127.0.0.1:3350/runtime/cycles"),
      fetch("http://127.0.0.1:3350/incidents"),
      fetch("http://127.0.0.1:3350/runtime/status"),
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
    });
    servers.push(server);

    const [nonNumericCycles, oversizedIncidents] = await Promise.all([
      fetch("http://127.0.0.1:3351/runtime/cycles?limit=abc"),
      fetch("http://127.0.0.1:3351/incidents?limit=201"),
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
});
