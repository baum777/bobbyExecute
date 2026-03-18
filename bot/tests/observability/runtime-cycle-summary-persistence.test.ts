import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileSystemRuntimeCycleSummaryWriter } from "../../src/persistence/runtime-cycle-summary-repository.js";

describe("Runtime cycle summary persistence", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "runtime-cycle-summary-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes blocked and successful cycle summaries durably", async () => {
    const writer = new FileSystemRuntimeCycleSummaryWriter(join(tempDir, "runtime-cycles.jsonl"));

    await writer.append({
      cycleTimestamp: "2026-03-17T00:00:00.000Z",
      traceId: "trace-blocked",
      mode: "paper",
      outcome: "blocked",
      intakeOutcome: "stale",
      advanced: false,
      stage: "ingest",
      blocked: true,
      blockedReason: "PAPER_INGEST_BLOCKED:stale",
      decisionOccurred: false,
      signalOccurred: false,
      riskOccurred: false,
      chaosOccurred: false,
      executionOccurred: false,
      verificationOccurred: false,
      paperExecutionProduced: false,
      errorOccurred: false,
      incidentIds: ["incident-blocked"],
    });

    await writer.append({
      cycleTimestamp: "2026-03-17T00:01:00.000Z",
      traceId: "trace-1",
      mode: "paper",
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
      tradeIntentId: "trace-1-intent",
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

    const summaries = await writer.list();
    expect(summaries).toHaveLength(2);
    expect(summaries[0].blocked).toBe(true);
    expect(summaries[0].incidentIds).toEqual(["incident-blocked"]);
    expect(summaries[1].paperExecutionProduced).toBe(true);
    expect(summaries[1].verificationMode).toBe("paper-simulated");
    expect(summaries[1].execution?.mode).toBe("paper");
    await expect(writer.getByTraceId("trace-1")).resolves.toEqual(summaries[1]);
  });
});
