import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrap } from "../../src/bootstrap.js";
import { resetConfigCache } from "../../src/config/load-config.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";
import type { MarketSnapshot } from "../../src/core/contracts/market.js";
import type { WalletSnapshot } from "../../src/core/contracts/wallet.js";
import {
  FileSystemRuntimeCycleSummaryWriter,
  type RuntimeCycleSummary,
} from "../../src/persistence/runtime-cycle-summary-repository.js";
import { FileSystemIncidentRepository } from "../../src/persistence/incident-repository.js";
import { RepositoryIncidentRecorder } from "../../src/observability/incidents.js";

type BootstrappedApp = Awaited<ReturnType<typeof bootstrap>>;

const ORIG_ENV = process.env;
const PORT = 3361;
const OPERATOR_READ_TOKEN = "phase10-operator-read-parity-token";

async function waitFor<T>(producer: () => Promise<T> | T, predicate: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 2_000;

  for (;;) {
    const value = await producer();
    if (predicate(value)) {
      return value;
    }
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for expected runtime state");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("paper bootstrap integration parity (phase-6)", () => {
  let tempDir: string;
  let app: BootstrappedApp | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "paper-bootstrap-phase6-"));
    resetConfigCache();
    resetKillSwitch();
    process.env = {
      ...ORIG_ENV,
      NODE_ENV: "test",
      DRY_RUN: "false",
      WALLET_ADDRESS: "11111111111111111111111111111111",
      OPERATOR_READ_TOKEN,
      JOURNAL_PATH: join(tempDir, "paper-runtime-journal.jsonl"),
    };
    delete process.env.LIVE_TRADING;
    delete process.env.RPC_MODE;
  });

  afterEach(async () => {
    if (app) {
      await app.runtime.stop();
      await app.server.close();
      app = undefined;
    }
    resetKillSwitch();
    resetConfigCache();
    process.env = ORIG_ENV;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("proves parity across runtime, API, operator surfaces, and persistence for a bootstrapped paper cycle", async () => {
    const cycleSummaryPath = join(tempDir, "paper-runtime-cycles.jsonl");
    const incidentPath = join(tempDir, "paper-runtime-incidents.jsonl");
    const cycleSummaryWriter = new FileSystemRuntimeCycleSummaryWriter(cycleSummaryPath);
    const incidentRepository = new FileSystemIncidentRepository(incidentPath);

    const marketSnapshot: MarketSnapshot = {
      schema_version: "market.v1",
      traceId: "phase6-market-trace",
      timestamp: "2026-03-18T00:00:00.000Z",
      source: "dexpaprika",
      poolId: "phase6-paper-pool",
      baseToken: "SOL",
      quoteToken: "USD",
      priceUsd: 132.45,
      volume24h: 245000,
      liquidity: 980000,
      freshnessMs: 0,
      status: "ok",
    };
    const walletSnapshot: WalletSnapshot = {
      traceId: "phase6-wallet-trace",
      timestamp: "2026-03-18T00:00:00.000Z",
      source: "moralis",
      walletAddress: process.env.WALLET_ADDRESS!,
      balances: [
        {
          mint: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          amount: "2.5",
          decimals: 9,
          amountUsd: 331.125,
        },
      ],
      totalUsd: 331.125,
    };

    app = await bootstrap({
      host: "127.0.0.1",
      port: PORT,
      runtimeDeps: {
        loopIntervalMs: 60_000,
        paperMarketAdapters: [{ id: "dexpaprika", fetch: async () => marketSnapshot }],
        fetchPaperWalletSnapshot: async () => walletSnapshot,
        cycleSummaryWriter,
        incidentRecorder: new RepositoryIncidentRecorder(incidentRepository),
      },
    });

    const runtimeSnapshot = await waitFor(
      () => app!.runtime.getSnapshot(),
      (snapshot) => snapshot.counters.executionCount === 1 && snapshot.lastCycleSummary?.verificationMode === "paper-simulated"
    );

    expect(runtimeSnapshot.mode).toBe("paper");
    expect(runtimeSnapshot.status).toBe("running");
    expect(runtimeSnapshot.paperModeActive).toBe(true);
    expect(runtimeSnapshot.counters.cycleCount).toBe(1);
    expect(runtimeSnapshot.counters.decisionCount).toBe(1);
    expect(runtimeSnapshot.counters.executionCount).toBe(1);
    expect(runtimeSnapshot.counters.blockedCount).toBe(0);
    expect(runtimeSnapshot.counters.errorCount).toBe(0);
    expect(runtimeSnapshot.lastState?.stage).toBe("monitor");
    expect(runtimeSnapshot.lastState?.market).toEqual(marketSnapshot);
    expect(runtimeSnapshot.lastState?.wallet).toEqual(walletSnapshot);
    expect(runtimeSnapshot.lastState?.executionReport).toMatchObject({
      success: true,
      executionMode: "paper",
      paperExecution: true,
      actualAmountOut: "0.95",
    });
    expect(runtimeSnapshot.lastState?.rpcVerification).toMatchObject({
      passed: true,
      verificationMode: "paper-simulated",
      reason: "PAPER_MODE_SIMULATED_VERIFICATION",
    });
    expect(runtimeSnapshot.lastCycleSummary).toMatchObject({
      traceId: runtimeSnapshot.lastState?.traceId,
      mode: "paper",
      outcome: "success",
      intakeOutcome: "ok",
      advanced: true,
      stage: "monitor",
      blocked: false,
      executionOccurred: true,
      verificationOccurred: true,
      paperExecutionProduced: true,
      verificationMode: "paper-simulated",
      errorOccurred: false,
      tradeIntentId: runtimeSnapshot.lastState?.tradeIntent?.idempotencyKey,
      execution: {
        success: true,
        mode: "paper",
        paperExecution: true,
        actualAmountOut: "0.95",
      },
      verification: {
        passed: true,
        mode: "paper-simulated",
        reason: "PAPER_MODE_SIMULATED_VERIFICATION",
      },
      incidentIds: [],
    });

    const [healthRes, kpiRes, statusRes, cyclesRes, replayRes, incidentsRes] = await Promise.all([
      fetch(`http://127.0.0.1:${PORT}/health`),
      fetch(`http://127.0.0.1:${PORT}/kpi/summary`),
      fetch(`http://127.0.0.1:${PORT}/runtime/status`, { headers: { "x-operator-token": OPERATOR_READ_TOKEN } }),
      fetch(`http://127.0.0.1:${PORT}/runtime/cycles?limit=5`, { headers: { "x-operator-token": OPERATOR_READ_TOKEN } }),
      fetch(`http://127.0.0.1:${PORT}/runtime/cycles/${runtimeSnapshot.lastState!.traceId}/replay`, { headers: { "x-operator-token": OPERATOR_READ_TOKEN } }),
      fetch(`http://127.0.0.1:${PORT}/incidents?limit=5`, { headers: { "x-operator-token": OPERATOR_READ_TOKEN } }),
    ]);

    expect(healthRes.status).toBe(200);
    expect(kpiRes.status).toBe(200);
    expect(statusRes.status).toBe(200);
    expect(cyclesRes.status).toBe(200);
    expect(replayRes.status).toBe(200);
    expect(incidentsRes.status).toBe(200);

    const healthBody = await healthRes.json();
    const kpiBody = await kpiRes.json();
    const statusBody = await statusRes.json();
    const cyclesBody = await cyclesRes.json();
    const replayBody = await replayRes.json();
    const incidentsBody = await incidentsRes.json();

    expect(healthBody.botStatus).toBe("running");
    expect(healthBody.runtime).toMatchObject({
      status: runtimeSnapshot.status,
      mode: runtimeSnapshot.mode,
      paperModeActive: true,
      cycleInFlight: false,
      counters: runtimeSnapshot.counters,
      lastCycleAt: runtimeSnapshot.lastCycleAt,
      lastDecisionAt: runtimeSnapshot.lastDecisionAt,
      lastEngineStage: "monitor",
      lastIntakeOutcome: "ok",
    });
    expect(healthBody.runtime.lastBlockedReason).toBeUndefined();

    expect(kpiBody.botStatus).toBe("running");
    expect(kpiBody.runtime).toMatchObject({
      mode: runtimeSnapshot.mode,
      paperModeActive: true,
      status: runtimeSnapshot.status,
      cycleCount: runtimeSnapshot.counters.cycleCount,
      decisionCount: runtimeSnapshot.counters.decisionCount,
      executionCount: runtimeSnapshot.counters.executionCount,
      blockedCount: runtimeSnapshot.counters.blockedCount,
      errorCount: runtimeSnapshot.counters.errorCount,
      lastDecisionAt: runtimeSnapshot.lastDecisionAt,
      lastIntakeOutcome: "ok",
    });

    expect(statusBody.success).toBe(true);
    expect(statusBody.runtime).toEqual(runtimeSnapshot);

    const persistedCycles = (await cycleSummaryWriter.list(5)) as RuntimeCycleSummary[];
    expect(cyclesBody.success).toBe(true);
    expect(cyclesBody.cycles).toEqual(persistedCycles);
    expect(cyclesBody.cycles).toHaveLength(1);
    expect(cyclesBody.cycles[0]).toEqual(runtimeSnapshot.lastCycleSummary);
    expect(replayBody.success).toBe(true);
    expect(replayBody.replay.summary).toEqual(runtimeSnapshot.lastCycleSummary);
    expect(replayBody.replay.journal.some((entry: { stage: string }) => entry.stage === "execution_result")).toBe(true);
    expect(replayBody.replay.journal.some((entry: { stage: string }) => entry.stage === "verification_result")).toBe(true);
    expect(replayBody.replay.incidents).toEqual([]);

    const persistedIncidents = await incidentRepository.list(5);
    expect(incidentsBody.success).toBe(true);
    expect(incidentsBody.incidents).toEqual(persistedIncidents);
    expect(incidentsBody.incidents).toEqual([]);

    const cycleSummaryLines = (await readFile(cycleSummaryPath, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RuntimeCycleSummary);
    expect(cycleSummaryLines).toEqual(persistedCycles);
    expect(cycleSummaryLines[0]).toMatchObject({
      mode: "paper",
      paperExecutionProduced: true,
      verificationMode: "paper-simulated",
    });

    const journalEntries = (await readFile(process.env.JOURNAL_PATH!, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { stage: string; output: Record<string, unknown> });
    const executionEntry = journalEntries.find((entry) => entry.stage === "execution_result");
    const verificationEntry = journalEntries.find((entry) => entry.stage === "verification_result");
    const completeEntry = journalEntries.find((entry) => entry.stage === "complete");

    expect(journalEntries.length).toBeGreaterThanOrEqual(5);
    expect(executionEntry?.output).toMatchObject({
      execReport: {
        success: true,
        executionMode: "paper",
        paperExecution: true,
      },
    });
    expect(verificationEntry?.output).toMatchObject({
      rpcVerify: {
        passed: true,
        verificationMode: "paper-simulated",
        reason: "PAPER_MODE_SIMULATED_VERIFICATION",
      },
    });
    expect(completeEntry?.output).toMatchObject({
      execReport: {
        executionMode: "paper",
        paperExecution: true,
      },
      rpcVerify: {
        verificationMode: "paper-simulated",
      },
    });
  }, 15_000);
});
