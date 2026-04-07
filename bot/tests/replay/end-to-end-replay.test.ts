import { describe, expect, it } from "vitest";
import { InMemoryJournalWriter } from "../../src/journal-writer/writer.js";
import {
  appendWorkerEventGateJournal,
} from "../../src/runtime/worker-event-gate/journal.js";
import {
  createWorkerEventGateEvaluationState,
  evaluateWorkerEventGate,
  type WorkerEventGateEvaluationResult,
} from "../../src/runtime/worker-event-gate/engine.js";
import type { WorkerEventEnvelope } from "../../src/runtime/worker-event-gate/contracts.js";
import {
  appendWorkerStateTransitionJournal,
  createLowCapHunterState,
  createShadowIntelligenceState,
  transitionLowCapHunterState,
  transitionShadowIntelligenceState,
} from "../../src/runtime/worker-state-machines.js";
import { appendStqCadenceJournal, evaluateStqCadencePolicy } from "../../src/runtime/stq-cadence.js";
import {
  appendCanonicalCaseJournal,
  buildCanonicalCaseRecord,
} from "../../src/casebook/casebook-builder.js";
import { buildDerivedKnowledgeView } from "../../src/derived-views/derived-views-builder.js";
import { buildMachineSafePrior } from "../../src/learning/priors-builder.js";
import { EntryPlaybookSchema, type PlaybookRevision } from "../../src/core/contracts/playbooks.js";
import type { CanonicalCaseRecord, CaseSubjectRef } from "../../src/core/contracts/casebook.js";
import type { JournalEntry } from "../../src/core/contracts/journal.js";
import {
  buildDecisionEnvelopeFixtureSet,
  decisionEnvelopeSemantics,
} from "../fixtures/decision-envelope.fixtures.js";
import {
  reconstructEndToEndReplayProof,
  type EndToEndReplayProof,
} from "../../src/replay/end-to-end-replay.js";

function makeSubjectRef(subject_kind: CaseSubjectRef["subject_kind"], subject_id: string): CaseSubjectRef {
  return {
    subject_kind,
    subject_id,
    subject_label: `${subject_kind}:${subject_id}`,
  };
}

function makeTradeCaseSubjects(traceId: string): CaseSubjectRef[] {
  return [
    makeSubjectRef("token", `token-${traceId}`),
    makeSubjectRef("trade", `trade-${traceId}`),
    makeSubjectRef("setup_type", "setup-alpha"),
    makeSubjectRef("market_regime", "regime-bull"),
    makeSubjectRef("meta", "meta-a"),
    makeSubjectRef("account_or_kol", "kol-alpha"),
    makeSubjectRef("signal_cluster", "cluster-a"),
    makeSubjectRef("failure_mode", "slippage"),
    makeSubjectRef("review_period", "2026-03"),
  ];
}

function buildLowcapEvent(input: {
  traceId: string;
  eventId: string;
  observedAt: string;
  entityId: string;
  entityKey: string;
  confidence: number;
  featureSnapshot: Partial<WorkerEventEnvelope["featureSnapshot"]>;
}): WorkerEventEnvelope {
  return {
    schemaVersion: "worker.event.gate.v1",
    eventId: input.eventId,
    traceId: input.traceId,
    family: "lowcap",
    eventType: "lowcap.signal",
    eventVersion: "1",
    producer: "discovery",
    entityType: "token",
    entityId: input.entityId,
    entityKey: input.entityKey,
    observedAt: input.observedAt,
    windowStart: "2026-03-17T11:58:00.000Z",
    windowEnd: "2026-03-17T12:05:00.000Z",
    severity: "high",
    confidence: input.confidence,
    knowledgeMode: "observed",
    evidenceRefs: [`market:${input.entityId}`, `wallet:${input.entityId}`],
    sourceScope: "mixed",
    promotionCandidate: true,
    suppressionCandidate: false,
    featureSnapshot: {
      tokenName: `Token ${input.entityId}`,
      ticker: `T${input.entityId.slice(-1)}`,
      contractAddress: `${input.entityId}-contract`,
      venue: "pump.fun",
      launchAgeSeconds: 900,
      marketCap: 25_000,
      volume: 50_000,
      bondingState: "bonding",
      walletQualityState: "clean",
      structureState: "early",
      liquidityState: "healthy",
      metaCluster: "cluster-a",
      attentionType: "resurgence",
      trustedSignalCount: 2,
      convergenceScore: 0.85,
      integrityScore: 0.9,
      freshnessScore: 0.92,
      noiseScore: 0.05,
      batchGroupHint: null,
      ...input.featureSnapshot,
    },
  };
}

function buildShadowEvent(input: {
  traceId: string;
  eventId: string;
  observedAt: string;
  entityId: string;
  entityKey: string;
  confidence: number;
  featureSnapshot: Partial<WorkerEventEnvelope["featureSnapshot"]>;
}): WorkerEventEnvelope {
  return {
    schemaVersion: "worker.event.gate.v1",
    eventId: input.eventId,
    traceId: input.traceId,
    family: "shadow",
    eventType: "shadow.transition",
    eventVersion: "1",
    producer: "monitor",
    entityType: "signal",
    entityId: input.entityId,
    entityKey: input.entityKey,
    observedAt: input.observedAt,
    windowStart: "2026-03-17T11:58:00.000Z",
    windowEnd: "2026-03-17T12:05:00.000Z",
    severity: "high",
    confidence: input.confidence,
    knowledgeMode: "operational",
    evidenceRefs: [`market:${input.entityId}`, `trend:${input.entityId}`],
    sourceScope: "external",
    promotionCandidate: true,
    suppressionCandidate: false,
    featureSnapshot: {
      tokenName: `Shadow ${input.entityId}`,
      ticker: `S${input.entityId.slice(-1)}`,
      contractAddress: `${input.entityId}-contract`,
      currentState: "notable_change",
      baselineState: "watching",
      transitionType: "trend_reversal",
      structureShift: "expanding",
      flowShift: "accelerating",
      attentionShift: "resurgent",
      walletQualityState: "mixed",
      distributionState: "concentrated",
      liquidityState: "healthy",
      transitionConfidence: 0.88,
      severityScore: 0.9,
      convergenceScore: 0.74,
      integrityScore: 0.91,
      freshnessScore: 0.93,
      batchGroupHint: null,
      thesisConflict: false,
      riskSpike: false,
      ...input.featureSnapshot,
    },
  };
}

async function buildTraceBundle(input: {
  traceId: string;
  event: WorkerEventEnvelope;
  stateBefore:
    | ReturnType<typeof createLowCapHunterState>
    | ReturnType<typeof createShadowIntelligenceState>;
  caseType: "trade_case";
  gateEvaluation?: WorkerEventGateEvaluationResult;
}): Promise<{ journalEntries: ReturnType<InMemoryJournalWriter["list"]>; caseRecord: CanonicalCaseRecord }> {
  const writer = new InMemoryJournalWriter();
  const gateEvaluation =
    input.gateEvaluation ??
    evaluateWorkerEventGate({
      event: input.event,
      state: createWorkerEventGateEvaluationState(),
    });
  await appendWorkerEventGateJournal(writer, gateEvaluation);

  const transition =
    input.event.family === "lowcap"
      ? transitionLowCapHunterState({
          currentState: input.stateBefore as ReturnType<typeof createLowCapHunterState>,
          evaluation: gateEvaluation,
        })
      : transitionShadowIntelligenceState({
          currentState: input.stateBefore as ReturnType<typeof createShadowIntelligenceState>,
          evaluation: gateEvaluation,
        });
  await appendWorkerStateTransitionJournal(writer, transition);

  const cadence = evaluateStqCadencePolicy({
    gateEvaluation,
    workerState: input.event.family === "lowcap" ? createLowCapHunterState() : createShadowIntelligenceState(),
  });
  await appendStqCadenceJournal(writer, cadence);

  const traceEntriesBeforeCase = writer.list();
  const caseRecord = buildCanonicalCaseRecord({
    case_type: input.caseType,
    trace_id: input.traceId,
    subject_refs: makeTradeCaseSubjects(input.traceId),
    decision_time_journal_entries: traceEntriesBeforeCase.filter(
      (entry) =>
        entry.stage === "worker.event" ||
        entry.stage.startsWith("worker.gate.") ||
        entry.stage === "worker.suppression" ||
        entry.stage === "worker.routing" ||
        entry.stage === "worker.cadence.policy"
    ),
    outcome_time_journal_entries: traceEntriesBeforeCase.filter(
      (entry) => entry.stage.startsWith("worker.transition.") || entry.stage === "worker.write_effect"
    ),
    review_time_journal_entries: traceEntriesBeforeCase.filter((entry) => entry.stage === "worker.model_result"),
    compressed_case_summary: `summary:${input.traceId}`,
    compressed_case_facts: [`performance:${input.event.family}`],
    compressed_case_inferences: [`trace:${input.traceId}`],
    compressed_case_lessons: [`lesson:${input.traceId}`],
    compression_version: "replay-proof.v1",
  });

  await appendCanonicalCaseJournal(writer, caseRecord);
  return {
    journalEntries: writer.list(),
    caseRecord,
  };
}

function buildPlaybookRevision(input: {
  playbookId: string;
  versionId: string;
  priorVersionId: string | null;
  prior: ReturnType<typeof buildMachineSafePrior>;
  caseRecord: CanonicalCaseRecord;
}): PlaybookRevision {
  return EntryPlaybookSchema.parse({
    schema_version: "playbook.revision.v1",
    layer: "playbook_or_optimization_memory",
    authority_class: "non_authoritative",
    playbook_id: input.playbookId,
    playbook_kind: "entry_playbook",
    title: `entry:${input.playbookId}`,
    summary: `replay-proof:${input.playbookId}`,
    source_layers: ["canonical_case_record", "derived_knowledge_view", "machine_safe_prior"],
    scope_refs: [
      makeSubjectRef("setup_type", "setup-alpha"),
      makeSubjectRef("market_regime", "regime-bull"),
    ],
    guidance: {
      objectives: ["objective:replay-proof"],
      rules: ["rule:replay-proof"],
      cautions: ["caution:non-authoritative"],
    },
    version_trace: {
      version_id: input.versionId,
      prior_version_id: input.priorVersionId,
      audit_log_entry_refs: [`journal:${input.playbookId}:${input.versionId}`],
      evidence_lineage_refs: [
        ...input.prior.evidence_lineage.evidence_lineage_refs.slice(0, 2),
        input.caseRecord.evidence.evidence_lineage_refs[0],
      ],
    },
    review_metadata: {
      review_state: "reviewed",
      reviewed_by: "reviewer-replay-proof",
      reviewed_at: "2026-04-06T08:30:00.000Z",
    },
  });
}

function journalEntriesForProof(proofs: readonly { journalEntries: JournalEntry[] }[]): JournalEntry[] {
  return proofs.flatMap((proof) => proof.journalEntries);
}

describe("end-to-end replay proof", () => {
  it("reconstructs gate, transition, cadence, case, derived view, prior, and playbook lineage from journaled source records", async () => {
    const successTrace = await buildTraceBundle({
      traceId: "replay-alpha",
      event: buildLowcapEvent({
        traceId: "replay-alpha",
        eventId: "replay-alpha-event",
        observedAt: "2026-03-17T12:00:00.000Z",
        entityId: "token-alpha",
        entityKey: "token-alpha:key",
        confidence: 0.96,
        featureSnapshot: {
          convergenceScore: 0.91,
          integrityScore: 0.94,
          freshnessScore: 0.95,
        },
      }),
      stateBefore: createLowCapHunterState("observed"),
      caseType: "trade_case",
    });
    const blockedSeedEvaluation = evaluateWorkerEventGate({
      event: buildLowcapEvent({
        traceId: "replay-beta",
        eventId: "replay-beta-seed",
        observedAt: "2026-03-17T12:01:00.000Z",
        entityId: "token-beta",
        entityKey: "token-beta:key",
        confidence: 0.9,
        featureSnapshot: {
          convergenceScore: 0.9,
          integrityScore: 0.92,
          freshnessScore: 0.93,
        },
      }),
      state: createWorkerEventGateEvaluationState(),
    });
    const blockedGateEvaluation = evaluateWorkerEventGate({
      event: buildLowcapEvent({
        traceId: "replay-beta",
        eventId: "replay-beta-duplicate",
        observedAt: "2026-03-17T12:01:00.000Z",
        entityId: "token-beta",
        entityKey: "token-beta:key",
        confidence: 0.9,
        featureSnapshot: {
          convergenceScore: 0.9,
          integrityScore: 0.92,
          freshnessScore: 0.93,
        },
      }),
      state: blockedSeedEvaluation.stateAfter,
    });
    const blockedTrace = await buildTraceBundle({
      traceId: "replay-beta",
      event: buildLowcapEvent({
        traceId: "replay-beta",
        eventId: "replay-beta-duplicate",
        observedAt: "2026-03-17T12:01:00.000Z",
        entityId: "token-beta",
        entityKey: "token-beta:key",
        confidence: 0.9,
        featureSnapshot: {
          convergenceScore: 0.9,
          integrityScore: 0.92,
          freshnessScore: 0.93,
        },
      }),
      stateBefore: createLowCapHunterState("screened"),
      caseType: "trade_case",
      gateEvaluation: blockedGateEvaluation,
    });
    const shadowTrace = await buildTraceBundle({
      traceId: "replay-shadow",
      event: buildShadowEvent({
        traceId: "replay-shadow",
        eventId: "replay-shadow-event",
        observedAt: "2026-03-17T12:02:00.000Z",
        entityId: "shadow-gamma",
        entityKey: "shadow-gamma:key",
        confidence: 0.88,
        featureSnapshot: {
          transitionConfidence: 0.91,
          severityScore: 0.94,
          convergenceScore: 0.83,
          integrityScore: 0.95,
          freshnessScore: 0.96,
        },
      }),
      stateBefore: createShadowIntelligenceState("watching"),
      caseType: "trade_case",
    });

    const journalEntries = journalEntriesForProof([successTrace, blockedTrace, shadowTrace]);
    const baseProof = reconstructEndToEndReplayProof({ journalEntries });

    expect(baseProof.schemaVersion).toBe("replay.proof.v1");
    expect(baseProof.authorityClass).toBe("non_authoritative");
    expect(baseProof.canonicalDecisionTruth).toBe("decisionEnvelope");
    expect(baseProof.traceProofs.map((trace) => trace.traceId)).toEqual([
      "replay-alpha",
      "replay-beta",
      "replay-shadow",
    ]);

    const [alphaTrace, betaTrace, shadowReplayTrace] = baseProof.traceProofs;

    expect(alphaTrace.eventGate.blocked).toBe(false);
    expect(alphaTrace.eventGate.routing?.routeClass).toBe("eligible_deep_adjudication");
    expect(alphaTrace.eventGate.writeEffect?.effect).toBe("review_queue_insert");
    expect(alphaTrace.transition?.blocked).toBe(false);
    expect(alphaTrace.caseReplay?.caseRecord.case_type).toBe("trade_case");

    expect(betaTrace.eventGate.blocked).toBe(true);
    expect(betaTrace.eventGate.suppression?.kind).toBe("dedupe");
    expect(betaTrace.transition?.blocked).toBe(true);
    expect(betaTrace.transition?.history[0].kind).toBe("transition_blocked");
    expect(betaTrace.cadence?.result?.noPromotionGuard.reason).toBe("gate_suppressed");
    expect(betaTrace.caseReplay?.caseRecord.case_type).toBe("trade_case");

    expect(shadowReplayTrace.eventGate.blocked).toBe(false);
    expect(shadowReplayTrace.eventGate.routing?.routeClass).toBe("eligible_deep_adjudication");
    expect(shadowReplayTrace.transition?.workerKind).toBe("shadow_intelligence");
    expect(shadowReplayTrace.caseReplay?.caseRecord.case_type).toBe("trade_case");

    expect(baseProof.cases).toHaveLength(3);
    expect(baseProof.derivedViews).toHaveLength(5);
    expect(baseProof.derivedViews[0].authority_class).toBe("non_authoritative");
    expect(baseProof.derivedViews[0].source_case_refs).toHaveLength(3);
    expect(baseProof.derivedViews[0].view_status).toBe("ready");
    expect(baseProof.derivedViews[0].trace_refs).toEqual([
      "replay-alpha",
      "replay-beta",
      "replay-shadow",
    ]);
    expect(baseProof.priors).toHaveLength(0);
    expect(baseProof.playbooks).toHaveLength(0);
    expect(baseProof.proofHash).toMatch(/^.{16,}$/);
    expect((baseProof as unknown as { decisionEnvelope?: unknown }).decisionEnvelope).toBeUndefined();

    const setupView = buildDerivedKnowledgeView({
      sourceCases: baseProof.cases,
      viewType: "setup_performance_view",
    });
    const prior = buildMachineSafePrior({
      prior_type: "setup_performance_prior",
      subject_key: "setup-alpha",
      source_class: "derived_knowledge_view",
      source_view: setupView,
      minimum_sample_count: 3,
      minimum_evidence_count: 3,
      review_metadata: {
        review_state: "reviewed",
        reviewed_by: "reviewer-replay-proof",
        reviewed_at: "2026-04-06T08:30:00.000Z",
        review_journal_record_refs: [baseProof.cases[0].evidence.source_journal_record_refs[0]],
      },
      effective_until: "2026-05-06T08:30:00.000Z",
    });
    const playbook = buildPlaybookRevision({
      playbookId: "entry:replay-proof",
      versionId: "entry:replay-proof:v1",
      priorVersionId: null,
      prior,
      caseRecord: baseProof.cases[0],
    });

    const proof = reconstructEndToEndReplayProof({
      journalEntries,
      priors: [prior],
      playbooks: [playbook],
    });

    expect(proof.traceProofs).toHaveLength(3);
    expect(proof.cases).toHaveLength(3);
    expect(proof.derivedViews.find((view) => view.view_type === "setup_performance_view")?.view_status).toBe(
      "ready"
    );
    expect(proof.priors).toHaveLength(1);
    expect(proof.priors[0].evidence_lineage.source_view_ref.view_id).toBe(setupView.view_id);
    expect(proof.priors[0].evidence_lineage.source_case_refs.map((ref) => ref.case_id)).toEqual(
      baseProof.cases.map((item) => item.case_id)
    );
    expect(proof.playbooks).toHaveLength(1);
    expect(proof.playbooks[0].version_trace.evidence_lineage_refs.length).toBeGreaterThan(0);
    expect(proof.playbooks[0].source_layers).toContain("machine_safe_prior");
    expect(proof.playbooks[0].review_metadata.review_state).toBe("reviewed");
  });

  it("is deterministic for the same source records regardless of input ordering", async () => {
    const trace = await buildTraceBundle({
      traceId: "replay-order",
      event: buildLowcapEvent({
        traceId: "replay-order",
        eventId: "replay-order-event",
        observedAt: "2026-03-17T12:03:00.000Z",
        entityId: "token-order",
        entityKey: "token-order:key",
        confidence: 0.94,
        featureSnapshot: {
          convergenceScore: 0.9,
          integrityScore: 0.93,
          freshnessScore: 0.94,
        },
      }),
      stateBefore: createLowCapHunterState("observed"),
      caseType: "trade_case",
    });

    const journalEntries = trace.journalEntries;
    const first = reconstructEndToEndReplayProof({ journalEntries });
    const second = reconstructEndToEndReplayProof({
      journalEntries: [...journalEntries].reverse(),
    });
    const third = reconstructEndToEndReplayProof({
      journalEntries: structuredClone(journalEntries),
    });

    expect(second).toStrictEqual(first);
    expect(third).toStrictEqual(first);
    expect(first.proofHash).toBe(second.proofHash);
    expect(first.proofHash).toBe(third.proofHash);

    const fixtures = await buildDecisionEnvelopeFixtureSet();
    const before = decisionEnvelopeSemantics(fixtures.allowEnvelope);
    expect(decisionEnvelopeSemantics(fixtures.allowEnvelope)).toStrictEqual(before);
    expect((first as unknown as { decisionEnvelope?: unknown }).decisionEnvelope).toBeUndefined();
  });
});
