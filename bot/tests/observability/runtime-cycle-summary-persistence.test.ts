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
      producer: {
        name: "dry-run-runtime",
        kind: "runtime_cycle_summary",
        canonicalDecisionTruth: false,
      },
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
      provenance: {
        reasonClass: "DATA_STALE",
        sources: ["market:dexpaprika", "wallet:rpc"],
        freshness: {
          marketAgeMs: 65_000,
          walletAgeMs: 65_000,
          maxAgeMs: 60_000,
          observedAt: "2026-03-17T00:00:00.000Z",
        },
        evidenceRef: {
          marketRawHash: "market-hash-blocked",
          walletRawHash: "wallet-hash-blocked",
        },
        evidenceRefs: ["marketRawHash:market-hash-blocked", "walletRawHash:wallet-hash-blocked"],
        reasonBasis: {
          stage: "ingest",
          outcome: "blocked",
          blockedReason: "PAPER_INGEST_BLOCKED:stale",
          failureStage: "ingest",
        },
      },
      incidentIds: ["incident-blocked"],
    });

    await writer.append({
      cycleTimestamp: "2026-03-17T00:01:00.000Z",
      traceId: "trace-1",
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
      provenance: {
        reasonClass: "SUCCESS",
        sources: ["market:dexpaprika", "wallet:rpc", "execute:engine"],
        freshness: {
          marketAgeMs: 0,
          walletAgeMs: 0,
          maxAgeMs: 60_000,
          observedAt: "2026-03-17T00:01:00.000Z",
        },
        evidenceRef: {
          signalPackHash: "signal-pack-hash-trace-1",
        },
        evidenceRefs: ["signalPackHash:signal-pack-hash-trace-1"],
        reasonBasis: {
          stage: "monitor",
          outcome: "success",
        },
      },
      shadowArtifactChain: {
        artifactMode: "shadow",
        derivedOnly: true,
        nonAuthoritative: true,
        authorityInfluence: false,
        canonicalDecisionHistory: false,
        chainVersion: "shadow_artifact_chain.v1",
        status: "built",
        inputRefs: ["runtime_trace:trace-1", "market:m1", "wallet:w1"],
        evidenceRefs: ["discovery:evidence:trace-1"],
        parity: {
          oldAuthority: {
            blocked: false,
            signalDirection: "buy",
            signalConfidence: 0.77,
            tradeIntentId: "trace-1-intent",
          },
          shadowDerived: {
            blocked: false,
            qualityStatus: "pass",
            scoreComposite: 0.74,
            scoreConfidence: 0.7,
            cqdHash: "cqd-hash-trace-1",
          },
          deltas: {
            blockedMismatch: false,
            confidenceDelta: -0.07,
          },
        },
        artifacts: {
          sourceObservationCount: 2,
          sourceObservationRefs: ["market:m1", "wallet:w1"],
          staleSources: [],
          discoveryEvidenceRef: "discovery:evidence:trace-1",
          discoveryEvidenceHash: "discovery-hash-trace-1",
          qualityStatus: "pass",
          qualityReasonCodes: [],
          qualityMissingCriticalFields: [],
          qualityStaleSources: [],
          qualityCrossSourceConfidence: 0.89,
          cqdHash: "cqd-hash-trace-1",
          cqdAnomalyFlags: [],
          constructedSignalSetPayloadHash: "constructed-hash-trace-1",
          constructedSignalSetBuildStatus: "built",
          scoreCardPayloadHash: "score-hash-trace-1",
          scoreCardBuildStatus: "built",
        },
      },
      incidentIds: [],
    });

    const summaries = await writer.list();
    expect(summaries).toHaveLength(2);
    expect(summaries[0].blocked).toBe(true);
    expect(summaries[0].producer).toMatchObject({
      name: "dry-run-runtime",
      kind: "runtime_cycle_summary",
      canonicalDecisionTruth: false,
    });
    expect(summaries[0].incidentIds).toEqual(["incident-blocked"]);
    expect(summaries[0].provenance?.reasonClass).toBe("DATA_STALE");
    expect(summaries[0].provenance?.evidenceRefs).toContain("marketRawHash:market-hash-blocked");
    expect(summaries[1].paperExecutionProduced).toBe(true);
    expect(summaries[1].producer).toMatchObject({
      name: "dry-run-runtime",
      kind: "runtime_cycle_summary",
      canonicalDecisionTruth: false,
    });
    expect(summaries[1].verificationMode).toBe("paper-simulated");
    expect(summaries[1].execution?.mode).toBe("paper");
    expect(summaries[1].provenance?.reasonClass).toBe("SUCCESS");
    expect(summaries[1].provenance?.sources).toContain("execute:engine");
    expect(summaries[1].shadowArtifactChain?.artifactMode).toBe("shadow");
    expect(summaries[1].shadowArtifactChain?.derivedOnly).toBe(true);
    expect(summaries[1].shadowArtifactChain?.parity.oldAuthority.tradeIntentId).toBe("trace-1-intent");
    expect(summaries[1].shadowArtifactChain?.artifacts.discoveryEvidenceHash).toBe(
      "discovery-hash-trace-1"
    );
    expect(summaries[1].shadowArtifactChain?.artifacts.cqdHash).toBe("cqd-hash-trace-1");
    await expect(writer.getByTraceId("trace-1")).resolves.toEqual(summaries[1]);
  });
});
