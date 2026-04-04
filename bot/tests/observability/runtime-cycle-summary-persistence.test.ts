import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileSystemRuntimeCycleSummaryWriter } from "../../src/persistence/runtime-cycle-summary-repository.js";
import { buildDecisionEnvelopeFixtureSet } from "../fixtures/decision-envelope.fixtures.js";

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
    const fixtures = await buildDecisionEnvelopeFixtureSet();

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
      decisionEnvelope: fixtures.denyEnvelope,
      decisionHistoryRole: "canonical",
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
      decisionEnvelope: fixtures.allowEnvelope,
      decisionOccurred: true,
      signalOccurred: true,
      riskOccurred: true,
      chaosOccurred: true,
      executionOccurred: true,
      verificationOccurred: true,
      paperExecutionProduced: true,
      verificationMode: "paper-simulated",
      errorOccurred: false,
      decisionHistoryRole: "canonical",
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
      authorityArtifactChain: {
        artifactMode: "authority",
        derivedOnly: false,
        nonAuthoritative: false,
        authorityInfluence: true,
        canonicalDecisionHistory: false,
        chainVersion: "authority_artifact_chain.v1",
        status: "built",
        inputRefs: ["runtime_trace:trace-1", "runtime_mode:paper"],
        evidenceRefs: ["discovery:evidence:trace-1"],
        decision: {
          blocked: false,
          direction: "buy",
          confidence: 0.77,
          tradeIntentId: "trace-1-intent",
        },
        artifacts: {
          sourceObservationCount: 2,
          sourceObservationRefs: ["market:m1", "wallet:w1"],
          discoveryEvidenceRef: "discovery:evidence:trace-1",
          discoveryEvidenceHash: "discovery-hash-trace-1",
          dataQualityStatus: "pass",
          dataQualityReasonCodes: [],
          dataQualityMissingCriticalFields: [],
          dataQualityStaleSources: [],
          dataQualityCrossSourceConfidence: 0.89,
          cqdHash: "cqd-hash-trace-1",
          cqdAnomalyFlags: [],
          constructedSignalSetPayloadHash: "constructed-hash-trace-1",
          constructedSignalSetBuildStatus: "built",
          scoreCardPayloadHash: "score-hash-trace-1",
          scoreCardBuildStatus: "built",
          scoreComposite: 0.74,
          scoreConfidence: 0.7,
        },
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
    expect(summaries[1].decisionEnvelope?.schemaVersion).toBe("decision.envelope.v3");
    expect(summaries[1].decisionHistoryRole).toBe("canonical");
    expect(summaries[1].shadowArtifactChain?.artifactMode).toBe("shadow");
    expect(summaries[1].shadowArtifactChain?.derivedOnly).toBe(true);
    expect(summaries[1].shadowArtifactChain?.parity.oldAuthority.tradeIntentId).toBe("trace-1-intent");
    expect(summaries[1].shadowArtifactChain?.artifacts.discoveryEvidenceHash).toBe(
      "discovery-hash-trace-1"
    );
    expect(summaries[1].shadowArtifactChain?.artifacts.cqdHash).toBe("cqd-hash-trace-1");
    expect(summaries[1].authorityArtifactChain?.artifactMode).toBe("authority");
    expect(summaries[1].authorityArtifactChain?.derivedOnly).toBe(false);
    expect(summaries[1].authorityArtifactChain?.authorityInfluence).toBe(true);
    expect(summaries[1].authorityArtifactChain?.canonicalDecisionHistory).toBe(false);
    expect(summaries[1].authorityArtifactChain?.decision.blocked).toBe(false);
    await expect(writer.getByTraceId("trace-1")).resolves.toEqual(summaries[1]);
  });
});
