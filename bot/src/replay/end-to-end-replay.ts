import { canonicalize } from "../core/determinism/canonicalize.js";
import { hashResult } from "../core/determinism/hash.js";
import type { JournalEntry } from "../core/contracts/journal.js";
import type { CanonicalCaseRecord } from "../core/contracts/casebook.js";
import type { DerivedKnowledgeView } from "../core/contracts/derived-views.js";
import type { MachineSafePriorRecord } from "../core/contracts/priors.js";
import type { PlaybookRevision } from "../core/contracts/playbooks.js";
import { buildDerivedKnowledgeView } from "../derived-views/derived-views-builder.js";
import {
  reconstructCanonicalCaseReplay,
  type CanonicalCaseReplayTrace,
} from "../casebook/casebook-builder.js";
import {
  reconstructWorkerEventGateReplay,
  type WorkerEventGateReplayTrace,
} from "../runtime/worker-event-gate/journal.js";
import {
  reconstructLowCapHunterTransitionReplay,
  reconstructShadowIntelligenceTransitionReplay,
  type WorkerStateTransitionReplayTrace,
  type WorkerState,
} from "../runtime/worker-state-machines.js";
import {
  reconstructStqCadenceReplay,
  type STQCadenceReplayTrace,
} from "../runtime/stq-cadence.js";
import { MachineSafePriorRecordSchema } from "../core/contracts/priors.js";
import { assertPlaybookRevision } from "../core/contracts/playbooks.js";

export const END_TO_END_REPLAY_PROOF_SCHEMA_VERSION = "replay.proof.v1" as const;

type ReplayWorkerKind = "lowcap_hunter" | "shadow_intelligence";

export interface EndToEndReplayTraceProof {
  traceId: string;
  journalEntries: JournalEntry[];
  eventGate: WorkerEventGateReplayTrace;
  transition: WorkerStateTransitionReplayTrace<WorkerState> | null;
  cadence: STQCadenceReplayTrace | null;
  caseReplay: CanonicalCaseReplayTrace | null;
  traceProofHash: string;
}

export interface EndToEndReplayProof {
  schemaVersion: typeof END_TO_END_REPLAY_PROOF_SCHEMA_VERSION;
  authorityClass: "non_authoritative";
  canonicalDecisionTruth: "decisionEnvelope";
  traceProofs: EndToEndReplayTraceProof[];
  cases: CanonicalCaseRecord[];
  derivedViews: DerivedKnowledgeView[];
  priors: MachineSafePriorRecord[];
  playbooks: PlaybookRevision[];
  proofHash: string;
}

export interface EndToEndReplayProofInput {
  journalEntries: ReadonlyArray<JournalEntry>;
  priors?: ReadonlyArray<MachineSafePriorRecord>;
  playbooks?: ReadonlyArray<PlaybookRevision>;
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareOptionalText(left: string | undefined, right: string | undefined): number {
  return compareText(left ?? "", right ?? "");
}

function compareJournalEntries(left: JournalEntry, right: JournalEntry): number {
  return (
    compareText(left.traceId, right.traceId) ||
    compareText(left.timestamp, right.timestamp) ||
    compareText(left.stage, right.stage) ||
    compareOptionalText(left.eventHash, right.eventHash) ||
    compareOptionalText(left.decisionHash, right.decisionHash) ||
    compareOptionalText(left.resultHash, right.resultHash)
  );
}

function normalizeJournalEntries(entries: ReadonlyArray<JournalEntry>): JournalEntry[] {
  return [...entries].sort(compareJournalEntries).map((entry) => structuredClone(entry));
}

function groupEntriesByTrace(entries: ReadonlyArray<JournalEntry>): Map<string, JournalEntry[]> {
  const grouped = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const bucket = grouped.get(entry.traceId) ?? [];
    bucket.push(entry);
    grouped.set(entry.traceId, bucket);
  }

  for (const [traceId, bucket] of grouped.entries()) {
    grouped.set(traceId, bucket.sort(compareJournalEntries));
  }

  return grouped;
}

function detectTransitionWorkerKind(entries: ReadonlyArray<JournalEntry>): ReplayWorkerKind | null {
  for (const entry of entries) {
    if (entry.stage === "worker.transition.lowcap_hunter") {
      return "lowcap_hunter";
    }
    if (entry.stage === "worker.transition.shadow_intelligence") {
      return "shadow_intelligence";
    }
  }

  return null;
}

function reconstructTransitionReplay(
  entries: ReadonlyArray<JournalEntry>
): WorkerStateTransitionReplayTrace<WorkerState> | null {
  const workerKind = detectTransitionWorkerKind(entries);
  if (!workerKind) {
    return null;
  }

  const replay =
    workerKind === "lowcap_hunter"
      ? reconstructLowCapHunterTransitionReplay(entries)
      : reconstructShadowIntelligenceTransitionReplay(entries);

  return replay as WorkerStateTransitionReplayTrace<WorkerState>;
}

function buildTraceProof(traceId: string, entries: ReadonlyArray<JournalEntry>): EndToEndReplayTraceProof {
  const traceEntries = normalizeJournalEntries(entries);
  const gateEntries = traceEntries.filter((entry) => {
    return (
      entry.stage === "worker.event" ||
      entry.stage.startsWith("worker.gate.") ||
      entry.stage === "worker.suppression" ||
      entry.stage === "worker.routing" ||
      entry.stage === "worker.model_result" ||
      entry.stage === "worker.write_effect"
    );
  });
  const cadenceEntries = traceEntries.filter((entry) => entry.stage === "worker.cadence.policy");
  const caseEntries = traceEntries.filter((entry) => entry.stage === "casebook.canonical_case");

  if (gateEntries.length === 0) {
    throw new Error(`REPLAY_PROOF_FAILED:missing_gate_entries:${traceId}`);
  }

  const eventGate = reconstructWorkerEventGateReplay(gateEntries);
  const transition = reconstructTransitionReplay(traceEntries);
  const cadence = cadenceEntries.length > 0 ? reconstructStqCadenceReplay(cadenceEntries) : null;
  const caseReplay = caseEntries.length > 0 ? reconstructCanonicalCaseReplay(caseEntries) : null;
  const traceProofHash = hashResult(
    canonicalize({
      traceId,
      gate: {
        blocked: eventGate.blocked,
        blockingStage: eventGate.blockingStage,
        terminalStage: eventGate.terminalStage,
        routing: eventGate.routing?.routeClass,
        writeEffect: eventGate.writeEffect?.effect,
      },
      transition: transition
        ? {
            workerKind: transition.workerKind,
            stateBefore: transition.stateBefore,
            stateAfter: transition.stateAfter,
            blocked: transition.blocked,
            invalid: transition.invalid,
            noTransition: transition.noTransition,
          }
        : null,
      cadence: cadence?.result
        ? {
            cadencePolicyId: cadence.result.cadencePolicyId,
            dayType: cadence.result.dayType,
            timeWindow: cadence.result.timeWindow,
            pollingIntervalLabel: cadence.result.pollingIntervalLabel,
          }
        : null,
      caseId: caseReplay?.caseRecord?.case_id ?? null,
      entryCount: traceEntries.length,
    })
  );

  return {
    traceId,
    journalEntries: traceEntries,
    eventGate,
    transition,
    cadence,
    caseReplay,
    traceProofHash,
  };
}

function buildDerivedViewsFromCases(cases: ReadonlyArray<CanonicalCaseRecord>): DerivedKnowledgeView[] {
  return [
    buildDerivedKnowledgeView({ sourceCases: cases, viewType: "setup_performance_view" }),
    buildDerivedKnowledgeView({ sourceCases: cases, viewType: "regime_meta_performance_view" }),
    buildDerivedKnowledgeView({ sourceCases: cases, viewType: "kol_account_ranking_view" }),
    buildDerivedKnowledgeView({ sourceCases: cases, viewType: "failure_mode_view" }),
    buildDerivedKnowledgeView({ sourceCases: cases, viewType: "signal_pattern_view" }),
  ];
}

function normalizePriors(
  priors: ReadonlyArray<MachineSafePriorRecord> | undefined,
  cases: ReadonlyArray<CanonicalCaseRecord>,
  derivedViews: ReadonlyArray<DerivedKnowledgeView>
): MachineSafePriorRecord[] {
  if (!priors || priors.length === 0) {
    return [];
  }

  const caseIds = new Set(cases.map((item) => item.case_id));
  const viewIds = new Set(derivedViews.map((item) => item.view_id));
  return priors
    .map((prior, index) => {
      const parsed = MachineSafePriorRecordSchema.safeParse(prior);
      if (!parsed.success) {
        throw new Error(`REPLAY_PROOF_FAILED:invalid_prior:${index}`);
      }

      if (!viewIds.has(parsed.data.evidence_lineage.source_view_ref.view_id)) {
        throw new Error(`REPLAY_PROOF_FAILED:prior_view_lineage_mismatch:${parsed.data.prior_id}`);
      }

      for (const sourceCaseRef of parsed.data.evidence_lineage.source_case_refs) {
        if (!caseIds.has(sourceCaseRef.case_id)) {
          throw new Error(`REPLAY_PROOF_FAILED:prior_case_lineage_mismatch:${parsed.data.prior_id}:${sourceCaseRef.case_id}`);
        }
      }

      return structuredClone(parsed.data);
    })
    .sort((left, right) => compareText(left.prior_id, right.prior_id));
}

function normalizePlaybooks(playbooks: ReadonlyArray<PlaybookRevision> | undefined): PlaybookRevision[] {
  if (!playbooks || playbooks.length === 0) {
    return [];
  }

  return playbooks
    .map((playbook, index) => {
      const parsed = assertPlaybookRevision(playbook, `replay-proof.playbook:${index}`);
      return structuredClone(parsed);
    })
    .sort(
      (left, right) =>
        compareText(left.playbook_id, right.playbook_id) ||
        compareText(left.version_trace.version_id, right.version_trace.version_id)
    );
}

function buildProofHash(input: {
  traceProofs: ReadonlyArray<EndToEndReplayTraceProof>;
  cases: ReadonlyArray<CanonicalCaseRecord>;
  derivedViews: ReadonlyArray<DerivedKnowledgeView>;
  priors: ReadonlyArray<MachineSafePriorRecord>;
  playbooks: ReadonlyArray<PlaybookRevision>;
}): string {
  return hashResult(
    canonicalize({
      traceProofs: input.traceProofs.map((trace) => ({
        traceId: trace.traceId,
        traceProofHash: trace.traceProofHash,
        gate: {
          blocked: trace.eventGate.blocked,
          blockingStage: trace.eventGate.blockingStage,
          terminalStage: trace.eventGate.terminalStage,
          routing: trace.eventGate.routing?.routeClass,
          writeEffect: trace.eventGate.writeEffect?.effect,
        },
        cadencePolicyId: trace.cadence?.result?.cadencePolicyId ?? null,
        caseId: trace.caseReplay?.caseRecord?.case_id ?? null,
      })),
      cases: input.cases.map((item) => ({
        caseId: item.case_id,
        traceId: item.trace_id,
        caseType: item.case_type,
        evidenceLineageRefs: item.evidence.evidence_lineage_refs,
      })),
      derivedViews: input.derivedViews.map((view) => ({
        viewId: view.view_id,
        viewType: view.view_type,
        sourceCaseIds: view.source_case_refs.map((ref) => ref.case_id),
        traceRefs: view.trace_refs,
      })),
      priors: input.priors.map((prior) => ({
        priorId: prior.prior_id,
        priorType: prior.prior_type,
        sourceViewId: prior.evidence_lineage.source_view_ref.view_id,
        sourceCaseIds: prior.evidence_lineage.source_case_refs.map((ref) => ref.case_id),
      })),
      playbooks: input.playbooks.map((playbook) => ({
        playbookId: playbook.playbook_id,
        versionId: playbook.version_trace.version_id,
        sourceLayers: playbook.source_layers,
        reviewState: playbook.review_metadata.review_state,
      })),
    })
  );
}

export function reconstructEndToEndReplayProof(
  input: EndToEndReplayProofInput
): EndToEndReplayProof {
  const normalizedJournalEntries = normalizeJournalEntries(input.journalEntries);
  const groupedEntries = groupEntriesByTrace(normalizedJournalEntries);
  const traceProofs = [...groupedEntries.entries()]
    .sort((left, right) => compareText(left[0], right[0]))
    .map(([traceId, entries]) => buildTraceProof(traceId, entries));

  const cases = traceProofs
    .map((trace) => trace.caseReplay?.caseRecord ?? null)
    .filter((caseRecord): caseRecord is CanonicalCaseRecord => caseRecord != null)
    .sort((left, right) => compareText(left.case_id, right.case_id));

  const derivedViews = buildDerivedViewsFromCases(cases);
  const priors = normalizePriors(input.priors, cases, derivedViews);
  const playbooks = normalizePlaybooks(input.playbooks);
  const proofHash = buildProofHash({
    traceProofs,
    cases,
    derivedViews,
    priors,
    playbooks,
  });

  return {
    schemaVersion: END_TO_END_REPLAY_PROOF_SCHEMA_VERSION,
    authorityClass: "non_authoritative",
    canonicalDecisionTruth: "decisionEnvelope",
    traceProofs,
    cases,
    derivedViews,
    priors,
    playbooks,
    proofHash,
  };
}
