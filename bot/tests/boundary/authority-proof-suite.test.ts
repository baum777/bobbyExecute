import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { JournalEntry } from "../../src/core/contracts/journal.js";
import { EntryPlaybookSchema } from "../../src/core/contracts/playbooks.js";
import type { CaseSubjectRef } from "../../src/core/contracts/casebook.js";
import { appendCanonicalCaseJournal, buildCanonicalCaseRecord } from "../../src/casebook/casebook-builder.js";
import { buildDerivedKnowledgeView } from "../../src/derived-views/derived-views-builder.js";
import { buildMachineSafePrior } from "../../src/learning/priors-builder.js";
import { appendStqCadenceJournal, evaluateStqCadencePolicy } from "../../src/runtime/stq-cadence.js";
import type { WorkerEventEnvelope } from "../../src/runtime/worker-event-gate/contracts.js";
import { createWorkerEventGateEvaluationState, evaluateWorkerEventGate } from "../../src/runtime/worker-event-gate/engine.js";
import { appendWorkerEventGateJournal } from "../../src/runtime/worker-event-gate/journal.js";
import {
  appendWorkerStateTransitionJournal,
  createLowCapHunterState,
  transitionLowCapHunterState,
} from "../../src/runtime/worker-state-machines.js";
import { InMemoryJournalWriter } from "../../src/journal-writer/writer.js";
import { reconstructEndToEndReplayProof } from "../../src/replay/end-to-end-replay.js";

const SRC_ROOT = resolve(process.cwd(), "src");
const DECISION_ENVELOPE_PATH = resolve(SRC_ROOT, "core/contracts/decision-envelope.ts");

function makeSubjectRef(subject_kind: CaseSubjectRef["subject_kind"], subject_id: string): CaseSubjectRef {
  return {
    subject_kind,
    subject_id,
    subject_label: `${subject_kind}:${subject_id}`,
  };
}

function walkTsTargets(target: string): string[] {
  const files: string[] = [];
  const stat = statSync(target);

  if (stat.isFile()) {
    if (target.endsWith(".ts")) {
      files.push(target);
    }
    return files;
  }

  for (const entry of readdirSync(target)) {
    const full = resolve(target, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkTsTargets(full));
      continue;
    }
    if (full.endsWith(".ts")) {
      files.push(full);
    }
  }

  return files;
}

function parseImports(text: string): string[] {
  const imports: string[] = [];
  const pattern = /from\s+["']([^"']+)["']/g;
  let match = pattern.exec(text);

  while (match) {
    imports.push(match[1]);
    match = pattern.exec(text);
  }

  return imports;
}

function selectJournalEntries(
  entries: ReadonlyArray<JournalEntry>,
  predicate: (entry: JournalEntry) => boolean
): JournalEntry[] {
  return entries.filter(predicate);
}

function buildLowcapEvent(input: {
  traceId: string;
  eventId: string;
  observedAt: string;
  entityId: string;
  confidence: number;
  freshnessScore: number;
  entityKey?: string;
  suppressionCandidate?: boolean;
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
    entityKey: input.entityKey ?? `${input.entityId}:key`,
    observedAt: input.observedAt,
    windowStart: "2026-03-17T11:58:00.000Z",
    windowEnd: "2026-03-17T12:05:00.000Z",
    severity: "high",
    confidence: input.confidence,
    knowledgeMode: "observed",
    evidenceRefs: [`market:${input.entityId}`, `wallet:${input.entityId}`],
    sourceScope: "mixed",
    promotionCandidate: true,
    suppressionCandidate: input.suppressionCandidate ?? false,
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
      convergenceScore: 0.9,
      integrityScore: 0.92,
      freshnessScore: input.freshnessScore,
      noiseScore: 0.05,
      batchGroupHint: null,
    },
  };
}

function buildCaseRecord(
  traceId: string,
  journalEntries: ReadonlyArray<JournalEntry>
): ReturnType<typeof buildCanonicalCaseRecord> {
  const decisionTimeEntries = selectJournalEntries(journalEntries, (entry) => {
    return (
      entry.stage === "worker.event" ||
      entry.stage.startsWith("worker.gate.") ||
      entry.stage === "worker.suppression" ||
      entry.stage === "worker.routing" ||
      entry.stage === "worker.cadence.policy"
    );
  });
  const outcomeTimeEntries = selectJournalEntries(journalEntries, (entry) => {
    return entry.stage.startsWith("worker.transition.") || entry.stage === "worker.write_effect";
  });
  const reviewTimeEntries = [...journalEntries];

  return buildCanonicalCaseRecord({
    case_type: "trade_case",
    trace_id: traceId,
    subject_refs: [
      makeSubjectRef("token", `token-${traceId}`),
      makeSubjectRef("trade", `trade-${traceId}`),
      makeSubjectRef("setup_type", "setup-alpha"),
      makeSubjectRef("market_regime", "regime-bull"),
      makeSubjectRef("meta", "meta-a"),
      makeSubjectRef("account_or_kol", "kol-alpha"),
      makeSubjectRef("signal_cluster", "cluster-a"),
      makeSubjectRef("failure_mode", "slippage"),
      makeSubjectRef("review_period", "2026-03"),
    ],
    decision_time_journal_entries: decisionTimeEntries,
    outcome_time_journal_entries: outcomeTimeEntries,
    review_time_journal_entries: reviewTimeEntries,
    compressed_case_summary: `summary:${traceId}`,
    compressed_case_facts: ["performance:positive"],
    compressed_case_inferences: ["performance:positive"],
    compressed_case_lessons: ["lesson:boundary"],
    compression_version: "authority-proof.v1",
  });
}

async function buildReplayBundle(
  traceId: string,
  overrides?: { confidence?: number; freshnessScore?: number; suppressionCandidate?: boolean }
): Promise<{
  event: WorkerEventEnvelope;
  evaluation: ReturnType<typeof evaluateWorkerEventGate>;
  transition: ReturnType<typeof transitionLowCapHunterState>;
  cadence: ReturnType<typeof evaluateStqCadencePolicy>;
  caseRecord: ReturnType<typeof buildCanonicalCaseRecord>;
  replayProof: ReturnType<typeof reconstructEndToEndReplayProof>;
  journalEntries: JournalEntry[];
}> {
  const writer = new InMemoryJournalWriter();
  const event = buildLowcapEvent({
    traceId,
    eventId: `${traceId}-event`,
    observedAt: "2026-03-17T12:00:00.000Z",
    entityId: `token-${traceId}`,
    confidence: overrides?.confidence ?? 0.96,
    freshnessScore: overrides?.freshnessScore ?? 0.95,
    suppressionCandidate: overrides?.suppressionCandidate ?? false,
  });
  const evaluation = evaluateWorkerEventGate({
    event,
    state: createWorkerEventGateEvaluationState(),
  });
  const transition = transitionLowCapHunterState({
    currentState: createLowCapHunterState("observed"),
    evaluation,
  });
  const cadence = evaluateStqCadencePolicy({
    gateEvaluation: evaluation,
    workerState: createLowCapHunterState("observed"),
  });

  await appendWorkerEventGateJournal(writer, evaluation);
  await appendWorkerStateTransitionJournal(writer, transition);
  await appendStqCadenceJournal(writer, cadence);
  const caseRecord = buildCaseRecord(traceId, writer.list());
  await appendCanonicalCaseJournal(writer, caseRecord);

  const journalEntries = writer.list();
  return {
    event,
    evaluation,
    transition,
    cadence,
    caseRecord,
    replayProof: reconstructEndToEndReplayProof({ journalEntries }),
    journalEntries,
  };
}

describe("authority proof suite", () => {
  it("proves lower-authority outputs remain non-authoritative and never expose decisionEnvelope", async () => {
    const bundleA = await buildReplayBundle("authority-alpha-a");
    const bundleB = await buildReplayBundle("authority-alpha-b");
    const bundleC = await buildReplayBundle("authority-alpha-c");
    const { event, evaluation, transition, caseRecord, replayProof } = bundleA;
    const derivedView = buildDerivedKnowledgeView({
      sourceCases: [bundleA.caseRecord, bundleB.caseRecord, bundleC.caseRecord],
      viewType: "setup_performance_view",
    });
    const prior = buildMachineSafePrior({
      prior_type: "setup_performance_prior",
      subject_key: "setup-alpha",
      source_class: "derived_knowledge_view",
      source_view: derivedView,
      minimum_sample_count: 1,
      minimum_evidence_count: 1,
      review_metadata: {
        review_state: "reviewed",
        reviewed_by: "reviewer-authority-proof",
        reviewed_at: "2026-04-06T10:00:00.000Z",
        review_journal_record_refs: [caseRecord.evidence.source_journal_record_refs[0]],
      },
      effective_until: "2026-05-06T10:00:00.000Z",
    });
    const playbook = EntryPlaybookSchema.parse({
      schema_version: "playbook.revision.v1",
      layer: "playbook_or_optimization_memory",
      authority_class: "non_authoritative",
      playbook_id: "entry:authority-proof",
      playbook_kind: "entry_playbook",
      title: "entry:authority-proof",
      summary: "boundary guidance",
      source_layers: ["canonical_case_record", "derived_knowledge_view", "machine_safe_prior"],
      scope_refs: [makeSubjectRef("setup_type", "setup-alpha")],
      guidance: {
        objectives: ["objective:boundary"],
        rules: ["rule:boundary"],
        cautions: [],
      },
      version_trace: {
        version_id: "entry:authority-proof:v1",
        prior_version_id: null,
        audit_log_entry_refs: ["journal:authority-proof:v1"],
        evidence_lineage_refs: ["casebook:authority-proof:evidence"],
      },
      review_metadata: {
        review_state: "reviewed",
        reviewed_by: "reviewer-authority-proof",
        reviewed_at: "2026-04-06T10:00:00.000Z",
      },
    });

    expect(event.producer).toBe("discovery");
    expect(evaluation.routing.advisoryOnly).toBe(true);
    expect(evaluation.modelResult.called).toBe(false);
    expect(evaluation.writeEffect.advisoryOnly).toBe(true);
    expect((evaluation as unknown as { decisionEnvelope?: unknown }).decisionEnvelope).toBeUndefined();

    expect(transition.kind).toBe("transition_applied");
    expect((transition as unknown as { decisionEnvelope?: unknown }).decisionEnvelope).toBeUndefined();

    expect(caseRecord.authority_class).toBe("non_authoritative");
    expect(caseRecord.source_layer).toBe("raw_journal_truth");
    expect((caseRecord as unknown as { decisionEnvelope?: unknown }).decisionEnvelope).toBeUndefined();
    expect(caseRecord.evidence.source_journal_record_refs.some((ref) => ref.stage === "worker.event")).toBe(true);
    expect(caseRecord.evidence.source_journal_record_refs.some((ref) => ref.stage.startsWith("worker.gate."))).toBe(true);
    expect(caseRecord.evidence.source_journal_record_refs.some((ref) => ref.stage === "worker.routing")).toBe(true);
    expect(caseRecord.evidence.source_journal_record_refs.some((ref) => ref.stage === "worker.cadence.policy")).toBe(true);
    expect(caseRecord.evidence.source_journal_record_refs.some((ref) => ref.stage.startsWith("worker.transition."))).toBe(true);
    expect(caseRecord.evidence.source_journal_record_refs.some((ref) => ref.stage === "worker.write_effect")).toBe(true);

    expect(derivedView.authority_class).toBe("non_authoritative");
    expect(derivedView.source_layer).toBe("canonical_case_record");
    expect((derivedView as unknown as { decisionEnvelope?: unknown }).decisionEnvelope).toBeUndefined();

    expect(prior.authority_class).toBe("non_authoritative");
    expect(prior.source_layer).toBe("derived_knowledge_view");
    expect((prior as unknown as { decisionEnvelope?: unknown }).decisionEnvelope).toBeUndefined();

    expect(playbook.authority_class).toBe("non_authoritative");
    expect(playbook.source_layers).toContain("machine_safe_prior");
    expect((playbook as unknown as { decisionEnvelope?: unknown }).decisionEnvelope).toBeUndefined();

    expect(replayProof.authorityClass).toBe("non_authoritative");
    expect(replayProof.canonicalDecisionTruth).toBe("decisionEnvelope");
    expect((replayProof as unknown as { decisionEnvelope?: unknown }).decisionEnvelope).toBeUndefined();
    expect(replayProof.traceProofs).toHaveLength(1);
    expect(replayProof.cases).toHaveLength(1);
    expect(replayProof.traceProofs[0].caseReplay?.caseRecord?.case_id).toBe(caseRecord.case_id);
  });

  it("reconstructs blocked and suppressed paths without inventing hidden state", async () => {
    const { evaluation, transition, replayProof } = await buildReplayBundle("suppressed-alpha", {
      confidence: 0.1,
      freshnessScore: 0.2,
      suppressionCandidate: true,
    });

    expect(evaluation.blocked).toBe(true);
    expect(evaluation.blockingStage).toBe("convergence_relevance");
    expect(evaluation.suppression?.kind).toBe("stale");

    expect(transition.kind).toBe("transition_applied");
    expect(transition.reasonClass).toBe("STATE_REJECTED");
    expect(transition.stateAfter.status).toBe("rejected");

    expect(replayProof.traceProofs[0].eventGate.blocked).toBe(true);
    expect(replayProof.traceProofs[0].eventGate.blockingStage).toBe("convergence_relevance");
    expect(replayProof.traceProofs[0].eventGate.suppression?.kind).toBe("stale");
    expect(replayProof.traceProofs[0].transition?.stateAfter.status).toBe("rejected");
    expect(replayProof.traceProofs[0].transition?.history.at(-1)?.reasonClass).toBe("STATE_REJECTED");
  });

  it("produces the same replay proof for the same source records", async () => {
    const first = await buildReplayBundle("deterministic-alpha");
    const second = await buildReplayBundle("deterministic-alpha");

    expect(first.replayProof.proofHash).toBe(second.replayProof.proofHash);
    expect(first.replayProof.traceProofs[0].traceProofHash).toBe(second.replayProof.traceProofs[0].traceProofHash);
    expect(first.replayProof.cases[0].case_id).toBe(second.replayProof.cases[0].case_id);
  });

  it("fails if lower-authority source roots import runtime authority or MCP surfaces", () => {
    const watchedRoots = [
      "advisory",
      "advisory-llm",
      "casebook",
      "derived-views",
      "learning",
      "observability",
      "replay",
      "review-loops",
      "runtime/worker-event-gate",
      "runtime/stq-cadence.ts",
      "runtime/worker-state-machines.ts",
      "server/routes/kpi-advisory.ts",
    ];
    const forbiddenSpecifierPatterns = [
      /(?:^|\/)core\/engine\.js$/,
      /(?:^|\/)core\/orchestrator\.js$/,
      /(?:^|\/)runtime\/live-runtime\.js$/,
      /(?:^|\/)runtime\/runtime-config-manager\.js$/,
      /(?:^|\/)governance\/kill-switch\.js$/,
      /(?:^|\/)control\/control-governance\.js$/,
      /(?:^|\/)persistence\/execution-repository\.js$/,
      /(?:^|\/)server\/routes\/control\.js$/,
      /(?:^|^)(mcp|plugin:\/\/|app:\/\/)/,
    ];

    const files = watchedRoots.flatMap((relRoot) => walkTsTargets(resolve(SRC_ROOT, relRoot)));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const imports = parseImports(text);

      for (const specifier of imports) {
        for (const forbidden of forbiddenSpecifierPatterns) {
          expect(specifier, `${file} must not import authority surfaces`).not.toMatch(forbidden);
        }
      }
    }
  });

  it("keeps decisionEnvelope uniquely canonical and free of lower-authority contract shadowing", () => {
    const text = readFileSync(DECISION_ENVELOPE_PATH, "utf8");

    expect(text).toContain('schemaVersion: z.literal("decision.envelope.v1")');
    expect(text).toContain('schemaVersion: z.literal("decision.envelope.v2")');
    expect(text).toContain('schemaVersion: z.literal("decision.envelope.v3")');
    expect(text).not.toContain("playbook.revision.v1");
    expect(text).not.toContain("derived.knowledge_view.v1");
    expect(text).not.toContain("priors.machine_safe_prior.v1");
    expect(text).not.toContain("replay.proof.v1");
    expect(text).not.toContain("legacy_projection");
  });
});
