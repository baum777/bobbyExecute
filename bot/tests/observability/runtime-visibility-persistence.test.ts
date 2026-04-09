import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  FileSystemRuntimeVisibilityRepository,
  InMemoryRuntimeVisibilityRepository,
  createRuntimeVisibilityRepository,
  type RuntimeVisibilitySnapshot,
} from "../../src/persistence/runtime-visibility-repository.js";
import { loadVisibleRuntimeState } from "../../src/server/runtime-visibility.js";
import type { RuntimeSnapshot } from "../../src/runtime/dry-run-runtime.js";

function buildRuntimeSnapshot(): RuntimeSnapshot {
  return {
    status: "running",
    mode: "paper",
    paperModeActive: true,
    cycleInFlight: false,
    counters: {
      cycleCount: 1,
      decisionCount: 1,
      executionCount: 1,
      blockedCount: 0,
      errorCount: 0,
    },
    lastCycleAt: "2026-03-21T12:00:00.000Z",
    lastDecisionAt: "2026-03-21T12:00:00.000Z",
    lastState: {
      stage: "monitor",
      traceId: "trace-visibility",
      timestamp: "2026-03-21T12:00:00.000Z",
      blocked: false,
    },
    lastCycleSummary: {
      cycleTimestamp: "2026-03-21T12:00:00.000Z",
      traceId: "trace-visibility",
      mode: "paper",
      producer: {
        name: "dry-run-runtime",
        kind: "runtime_cycle_summary",
        canonicalDecisionTruth: false,
      },
      outcome: "success",
      intakeOutcome: "ok",
      advanced: true,
      stage: "monitor",
      blocked: false,
      decisionOccurred: true,
      signalOccurred: true,
      riskOccurred: true,
      chaosOccurred: true,
      executionOccurred: true,
      verificationOccurred: true,
      paperExecutionProduced: true,
      verificationMode: "paper-simulated",
      errorOccurred: false,
      tradeIntentId: "trade-visibility",
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
      incidentIds: ["incident-visibility"],
    },
    recentHistory: {
      recentCycleCount: 1,
      cycleOutcomes: { success: 1, blocked: 0, error: 0 },
      attemptsByMode: { dry: 0, paper: 1, live: 0 },
      refusalCounts: {},
      failureStageCounts: {},
      verificationHealth: { passed: 1, failed: 0, failureReasons: {} },
      incidentCounts: {},
      controlActions: [],
      stateTransitions: [],
      recentCycles: [
        {
          traceId: "trace-visibility",
          cycleTimestamp: "2026-03-21T12:00:00.000Z",
          mode: "paper",
          producer: {
            name: "dry-run-runtime",
            kind: "runtime_cycle_summary",
            canonicalDecisionTruth: false,
          },
          outcome: "success",
          stage: "monitor",
          blocked: false,
          intakeOutcome: "ok",
          executionOccurred: true,
          verificationOccurred: true,
          decisionOccurred: true,
          errorOccurred: false,
          decisionEnvelope: {
            schemaVersion: "decision.envelope.v3",
            entrypoint: "engine",
            flow: "trade",
            executionMode: "paper",
            traceId: "trace-visibility",
            stage: "monitor",
            blocked: false,
            reasonClass: "SUCCESS",
            sources: ["market:dexpaprika"],
            freshness: {
              marketAgeMs: 0,
              walletAgeMs: 0,
              maxAgeMs: 60_000,
              observedAt: "2026-03-21T12:00:00.000Z",
            },
            evidenceRef: {},
            decisionHash: "a".repeat(64),
            resultHash: "b".repeat(64),
          },
          decision: {
            allowed: true,
            direction: "buy",
            confidence: 0.9,
            riskAllowed: true,
            chaosAllowed: true,
            tradeIntentId: "trade-visibility",
          },
        },
      ],
      recentIncidents: [
        {
          id: "incident-visibility",
          at: "2026-03-21T12:00:00.000Z",
          severity: "info",
          type: "runtime_resumed",
          message: "Runtime resumed by control plane",
        },
      ],
    },
  };
}

describe("Runtime visibility persistence", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "runtime-visibility-"));
  });

  afterEach(async () => {
    delete process.env.RUNTIME_VISIBILITY_PATH;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("preserves producer labels and returns them through the visible runtime surface", async () => {
    const repository = new InMemoryRuntimeVisibilityRepository();
    const snapshot: RuntimeVisibilitySnapshot = {
      producer: {
        name: "runtime-worker",
        kind: "runtime_visibility_snapshot",
        canonicalDecisionTruth: false,
      },
      environment: "test",
      worker: {
        workerId: "worker-visibility",
        producer: {
          name: "runtime-worker",
          kind: "runtime_visibility_snapshot",
          canonicalDecisionTruth: false,
        },
        lastHeartbeatAt: "2026-03-21T12:00:00.000Z",
        lastCycleAt: "2026-03-21T12:00:00.000Z",
        lastSeenReloadNonce: 9,
        lastAppliedVersionId: "version-applied",
        lastValidVersionId: "version-valid",
        degraded: false,
        observedAt: "2026-03-21T12:00:00.000Z",
      },
      runtime: buildRuntimeSnapshot(),
      metrics: {
        cycleCount: 1,
        decisionCount: 1,
        executionCount: 1,
        blockedCount: 0,
        errorCount: 0,
        lastCycleAtEpochMs: Date.parse("2026-03-21T12:00:00.000Z"),
        lastDecisionAtEpochMs: Date.parse("2026-03-21T12:00:00.000Z"),
      },
    };

    await repository.save(snapshot);
    const loaded = await repository.load("test");

    expect(loaded).not.toBeNull();
    expect(loaded?.snapshot.producer).toMatchObject({
      name: "runtime-worker",
      kind: "runtime_visibility_snapshot",
      canonicalDecisionTruth: false,
    });
    expect(loaded?.snapshot.worker.producer).toMatchObject({
      name: "runtime-worker",
      kind: "runtime_visibility_snapshot",
      canonicalDecisionTruth: false,
    });
    expect(loaded?.snapshot.runtime.lastCycleSummary?.producer).toMatchObject({
      name: "dry-run-runtime",
      kind: "runtime_cycle_summary",
      canonicalDecisionTruth: false,
    });

    const visible = await loadVisibleRuntimeState(repository, "test");
    expect(visible.worker?.producer).toMatchObject({
      name: "runtime-worker",
      kind: "runtime_visibility_snapshot",
      canonicalDecisionTruth: false,
    });
    expect(visible.runtime?.lastCycleSummary?.producer).toMatchObject({
      name: "dry-run-runtime",
      kind: "runtime_cycle_summary",
      canonicalDecisionTruth: false,
    });
  });

  it("uses a shared file-backed repository when DATABASE_URL is unset", async () => {
    const runtimeVisibilityPath = join(tempDir, "runtime-visibility.json");
    process.env.RUNTIME_VISIBILITY_PATH = runtimeVisibilityPath;

    const writer = await createRuntimeVisibilityRepository();
    expect(writer.kind).toBe("file");
    expect(writer).toBeInstanceOf(FileSystemRuntimeVisibilityRepository);

    const snapshot: RuntimeVisibilitySnapshot = {
      producer: {
        name: "runtime-worker",
        kind: "runtime_visibility_snapshot",
        canonicalDecisionTruth: false,
      },
      environment: "test",
      worker: {
        workerId: "worker-shared-file",
        producer: {
          name: "runtime-worker",
          kind: "runtime_visibility_snapshot",
          canonicalDecisionTruth: false,
        },
        lastHeartbeatAt: "2026-03-21T12:00:00.000Z",
        lastCycleAt: "2026-03-21T12:00:00.000Z",
        degraded: false,
        observedAt: "2026-03-21T12:00:00.000Z",
      },
      runtime: buildRuntimeSnapshot(),
      metrics: {
        cycleCount: 1,
        decisionCount: 1,
        executionCount: 1,
        blockedCount: 0,
        errorCount: 0,
        lastCycleAtEpochMs: Date.parse("2026-03-21T12:00:00.000Z"),
        lastDecisionAtEpochMs: Date.parse("2026-03-21T12:00:00.000Z"),
      },
    };

    await writer.save(snapshot);

    const reader = await createRuntimeVisibilityRepository();
    expect(reader.kind).toBe("file");

    const loaded = await reader.load("test");
    expect(loaded).not.toBeNull();
    expect(loaded?.snapshot.worker.workerId).toBe("worker-shared-file");
    expect(loaded?.snapshot.runtime.mode).toBe("paper");
    expect(loaded?.snapshot.runtime.paperModeActive).toBe(true);
  });
});
