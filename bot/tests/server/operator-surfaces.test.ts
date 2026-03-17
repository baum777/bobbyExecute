import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/index.js";
import { createDryRunRuntime } from "../../src/runtime/dry-run-runtime.js";
import { resetKillSwitch, triggerKillSwitch } from "../../src/governance/kill-switch.js";
import { InMemoryRuntimeCycleSummaryWriter } from "../../src/persistence/runtime-cycle-summary-repository.js";
import { InMemoryIncidentRepository } from "../../src/persistence/incident-repository.js";
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
    const runtime = createDryRunRuntime(config, {
      cycleSummaryWriter: new InMemoryRuntimeCycleSummaryWriter(),
      incidentRecorder: new RepositoryIncidentRecorder(new InMemoryIncidentRepository()),
    });
    runtimes.push(runtime);
    await runtime.start();

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
    expect(Array.isArray(body.cycles)).toBe(true);
    expect(body.cycles.length).toBeGreaterThanOrEqual(1);
    expect(body.cycles[0]).toHaveProperty("cycleTimestamp");
  });

  it("GET /incidents returns recorded critical events", async () => {
    const runtime = createDryRunRuntime(config, {
      cycleSummaryWriter: new InMemoryRuntimeCycleSummaryWriter(),
      incidentRecorder: new RepositoryIncidentRecorder(new InMemoryIncidentRepository()),
    });
    runtimes.push(runtime);
    triggerKillSwitch("test-kill");
    await runtime.start();

    const server = await createServer({
      port: 3346,
      host: "127.0.0.1",
      runtime,
      getRuntimeSnapshot: () => runtime.getSnapshot(),
    });
    servers.push(server);

    const res = await fetch("http://127.0.0.1:3346/incidents?limit=10");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.incidents.length).toBeGreaterThanOrEqual(1);
    expect(body.incidents.some((i: { type: string }) => i.type === "runtime_paused")).toBe(true);
  });
});
