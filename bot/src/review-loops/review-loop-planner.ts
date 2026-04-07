import { hashResult } from "../core/determinism/hash.js";
import {
  assertReviewLoopInput,
  assertReviewLoopPlan,
  DailyReviewLoopInputSchema,
  MonthlyReviewLoopInputSchema,
  PerTradeReviewLoopInputSchema,
  type DailyReviewLoopInput,
  type MonthlyReviewLoopInput,
  type PerTradeReviewLoopInput,
  type ReviewLoopAction,
  type ReviewLoopAnomalyReviewCandidate,
  type ReviewLoopAuditLinkage,
  type ReviewLoopCaseCreateOrUpdateCandidate,
  type ReviewLoopCaseRef,
  type ReviewLoopDerivedRefreshCandidate,
  type ReviewLoopDerivedViewRef,
  type ReviewLoopInput,
  type ReviewLoopJournalWriteFollowUpCandidate,
  type ReviewLoopPlan,
  type ReviewLoopPlaybookRef,
  type ReviewLoopPlaybookSupportCandidate,
  type ReviewLoopPostMortemGenerationCandidate,
  type ReviewLoopPriorCandidateProposal,
  type ReviewLoopPriorRef,
  type ReviewLoopTaxonomyCleanupCandidate,
  type ReviewLoopTaxonomyRef,
  type WeeklyReviewLoopInput,
  WeeklyReviewLoopInputSchema,
} from "../core/contracts/review-loops.js";

type ReviewLoopProposalCandidate =
  | ReviewLoopJournalWriteFollowUpCandidate
  | ReviewLoopCaseCreateOrUpdateCandidate
  | ReviewLoopPostMortemGenerationCandidate
  | ReviewLoopDerivedRefreshCandidate
  | ReviewLoopPriorCandidateProposal
  | ReviewLoopPlaybookSupportCandidate
  | ReviewLoopAnomalyReviewCandidate
  | ReviewLoopTaxonomyCleanupCandidate;

function fail(details: string): never {
  throw new Error(`REVIEW_LOOP_BUILD_FAILED:${details}`);
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

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function compareCaseRefs(left: ReviewLoopCaseRef, right: ReviewLoopCaseRef): number {
  return (
    compareText(left.case_id, right.case_id) ||
    compareText(left.case_type, right.case_type) ||
    compareText(left.trace_id, right.trace_id)
  );
}

function compareDerivedViewRefs(left: ReviewLoopDerivedViewRef, right: ReviewLoopDerivedViewRef): number {
  return (
    compareText(left.view_id, right.view_id) ||
    compareText(left.view_type, right.view_type) ||
    compareText(left.view_status, right.view_status)
  );
}

function comparePriorRefs(left: ReviewLoopPriorRef, right: ReviewLoopPriorRef): number {
  return (
    compareText(left.prior_id, right.prior_id) ||
    compareText(left.prior_type, right.prior_type) ||
    compareText(left.subject_key, right.subject_key)
  );
}

function comparePlaybookRefs(left: ReviewLoopPlaybookRef, right: ReviewLoopPlaybookRef): number {
  return (
    compareText(left.playbook_id, right.playbook_id) ||
    compareText(left.playbook_kind, right.playbook_kind) ||
    compareText(left.version_id, right.version_id)
  );
}

function compareTaxonomyRefs(left: ReviewLoopTaxonomyRef, right: ReviewLoopTaxonomyRef): number {
  return (
    compareText(left.taxonomy_kind, right.taxonomy_kind) ||
    compareText(left.subject_id, right.subject_id) ||
    compareText(left.subject_label ?? "", right.subject_label ?? "")
  );
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sortStringRefs(values: readonly string[]): string[] {
  return uniqueSorted(values);
}

function sortCaseRefs(values: readonly ReviewLoopCaseRef[]): ReviewLoopCaseRef[] {
  return [...values].sort(compareCaseRefs);
}

function sortDerivedViewRefs(values: readonly ReviewLoopDerivedViewRef[]): ReviewLoopDerivedViewRef[] {
  return [...values].sort(compareDerivedViewRefs);
}

function sortPriorRefs(values: readonly ReviewLoopPriorRef[]): ReviewLoopPriorRef[] {
  return [...values].sort(comparePriorRefs);
}

function sortPlaybookRefs(values: readonly ReviewLoopPlaybookRef[]): ReviewLoopPlaybookRef[] {
  return [...values].sort(comparePlaybookRefs);
}

function sortTaxonomyRefs(values: readonly ReviewLoopTaxonomyRef[]): ReviewLoopTaxonomyRef[] {
  return [...values].sort(compareTaxonomyRefs);
}

function sortJournalRefs<T extends { trace_id: string; timestamp: string; stage: string; event_hash: string }>(
  values: readonly T[]
): T[] {
  return [...values].sort((left, right) =>
    compareText(left.trace_id, right.trace_id) ||
    compareText(left.timestamp, right.timestamp) ||
    compareText(left.stage, right.stage) ||
    compareText(left.event_hash, right.event_hash)
  );
}

function normalizeSourceRefs<T extends {
  source_journal_record_refs: readonly { trace_id: string; timestamp: string; stage: string; event_hash: string }[];
  source_case_refs: readonly ReviewLoopCaseRef[];
  source_derived_view_refs: readonly ReviewLoopDerivedViewRef[];
  source_prior_refs: readonly ReviewLoopPriorRef[];
  source_playbook_refs: readonly ReviewLoopPlaybookRef[];
  trace_refs: readonly string[];
  audit_log_entry_refs: readonly string[];
  evidence_lineage_refs: readonly string[];
}>(value: T): T {
  return {
    ...clone(value),
    source_journal_record_refs: sortJournalRefs(value.source_journal_record_refs),
    source_case_refs: sortCaseRefs(value.source_case_refs),
    source_derived_view_refs: sortDerivedViewRefs(value.source_derived_view_refs),
    source_prior_refs: sortPriorRefs(value.source_prior_refs),
    source_playbook_refs: sortPlaybookRefs(value.source_playbook_refs),
    trace_refs: sortStringRefs(value.trace_refs),
    audit_log_entry_refs: sortStringRefs(value.audit_log_entry_refs),
    evidence_lineage_refs: sortStringRefs(value.evidence_lineage_refs),
  };
}

function normalizeJournalWriteFollowUpCandidate(
  candidate: ReviewLoopJournalWriteFollowUpCandidate
): ReviewLoopJournalWriteFollowUpCandidate {
  return normalizeSourceRefs(candidate);
}

function normalizeCaseCreateOrUpdateCandidate(
  candidate: ReviewLoopCaseCreateOrUpdateCandidate
): ReviewLoopCaseCreateOrUpdateCandidate {
  return {
    ...normalizeSourceRefs(candidate),
    subject_refs: [...candidate.subject_refs].sort((left, right) =>
      compareText(left.subject_kind, right.subject_kind) ||
      compareText(left.subject_id, right.subject_id) ||
      compareText(left.subject_label ?? "", right.subject_label ?? "")
    ),
  };
}

function normalizePostMortemCandidate(
  candidate: ReviewLoopPostMortemGenerationCandidate
): ReviewLoopPostMortemGenerationCandidate {
  return {
    ...normalizeSourceRefs(candidate),
    subject_refs: [...candidate.subject_refs].sort((left, right) =>
      compareText(left.subject_kind, right.subject_kind) ||
      compareText(left.subject_id, right.subject_id) ||
      compareText(left.subject_label ?? "", right.subject_label ?? "")
    ),
    trade_case_ref: {
      ...candidate.trade_case_ref,
      source_journal_record_refs: sortJournalRefs(candidate.trade_case_ref.source_journal_record_refs),
      trace_refs: sortStringRefs(candidate.trade_case_ref.trace_refs),
      evidence_lineage_refs: sortStringRefs(candidate.trade_case_ref.evidence_lineage_refs),
    },
  };
}

function normalizeDerivedRefreshCandidate(
  candidate: ReviewLoopDerivedRefreshCandidate
): ReviewLoopDerivedRefreshCandidate {
  return normalizeSourceRefs(candidate);
}

function normalizePriorCandidate(
  candidate: ReviewLoopPriorCandidateProposal
): ReviewLoopPriorCandidateProposal {
  return normalizeSourceRefs(candidate);
}

function normalizePlaybookSupportCandidate(
  candidate: ReviewLoopPlaybookSupportCandidate
): ReviewLoopPlaybookSupportCandidate {
  return normalizeSourceRefs(candidate);
}

function normalizeAnomalyReviewCandidate(
  candidate: ReviewLoopAnomalyReviewCandidate
): ReviewLoopAnomalyReviewCandidate {
  return normalizeSourceRefs(candidate);
}

function normalizeTaxonomyCleanupCandidate(
  candidate: ReviewLoopTaxonomyCleanupCandidate
): ReviewLoopTaxonomyCleanupCandidate {
  return {
    ...normalizeSourceRefs(candidate),
    candidate_labels: sortStringRefs(candidate.candidate_labels),
  };
}

function candidateHash(candidate: unknown): string {
  return hashResult(candidate);
}

function buildActionId(loopKind: string, actionKind: string, candidate: unknown): string {
  return `review-loop:${loopKind}:${actionKind}:${candidateHash(candidate)}`;
}

function normalizePerTradeInput(input: PerTradeReviewLoopInput): PerTradeReviewLoopInput {
  return {
    ...normalizeSourceRefs(input),
    trade_case_ref: {
      ...input.trade_case_ref,
      source_journal_record_refs: sortJournalRefs(input.trade_case_ref.source_journal_record_refs),
      trace_refs: sortStringRefs(input.trade_case_ref.trace_refs),
      evidence_lineage_refs: sortStringRefs(input.trade_case_ref.evidence_lineage_refs),
    },
    journal_write_follow_up_candidates: clone(input.journal_write_follow_up_candidates)
      .map(normalizeJournalWriteFollowUpCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    case_create_or_update_candidates: clone(input.case_create_or_update_candidates)
      .map(normalizeCaseCreateOrUpdateCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    post_mortem_generation_candidates: clone(input.post_mortem_generation_candidates)
      .map(normalizePostMortemCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    anomaly_review_candidates: clone(input.anomaly_review_candidates)
      .map(normalizeAnomalyReviewCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
  };
}

function normalizeDailyInput(input: DailyReviewLoopInput): DailyReviewLoopInput {
  return {
    ...normalizeSourceRefs(input),
    journal_write_follow_up_candidates: clone(input.journal_write_follow_up_candidates)
      .map(normalizeJournalWriteFollowUpCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    case_create_or_update_candidates: clone(input.case_create_or_update_candidates)
      .map(normalizeCaseCreateOrUpdateCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    anomaly_review_candidates: clone(input.anomaly_review_candidates)
      .map(normalizeAnomalyReviewCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    post_mortem_generation_candidates: clone(input.post_mortem_generation_candidates)
      .map(normalizePostMortemCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    derived_refresh_candidates: clone(input.derived_refresh_candidates)
      .map(normalizeDerivedRefreshCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    prior_candidate_proposals: clone(input.prior_candidate_proposals)
      .map(normalizePriorCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    playbook_support_candidates: clone(input.playbook_support_candidates)
      .map(normalizePlaybookSupportCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    taxonomy_cleanup_candidates: clone(input.taxonomy_cleanup_candidates)
      .map(normalizeTaxonomyCleanupCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
  };
}

function normalizeWeeklyInput(input: WeeklyReviewLoopInput): WeeklyReviewLoopInput {
  return {
    ...normalizeSourceRefs(input),
    derived_refresh_candidates: clone(input.derived_refresh_candidates)
      .map(normalizeDerivedRefreshCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    prior_candidate_proposals: clone(input.prior_candidate_proposals)
      .map(normalizePriorCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    playbook_support_candidates: clone(input.playbook_support_candidates)
      .map(normalizePlaybookSupportCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    journal_write_follow_up_candidates: clone(input.journal_write_follow_up_candidates)
      .map(normalizeJournalWriteFollowUpCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    case_create_or_update_candidates: clone(input.case_create_or_update_candidates)
      .map(normalizeCaseCreateOrUpdateCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    post_mortem_generation_candidates: clone(input.post_mortem_generation_candidates)
      .map(normalizePostMortemCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    anomaly_review_candidates: clone(input.anomaly_review_candidates)
      .map(normalizeAnomalyReviewCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    taxonomy_cleanup_candidates: clone(input.taxonomy_cleanup_candidates)
      .map(normalizeTaxonomyCleanupCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
  };
}

function normalizeMonthlyInput(input: MonthlyReviewLoopInput): MonthlyReviewLoopInput {
  return {
    ...normalizeSourceRefs(input),
    playbook_support_candidates: clone(input.playbook_support_candidates)
      .map(normalizePlaybookSupportCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    anomaly_review_candidates: clone(input.anomaly_review_candidates)
      .map(normalizeAnomalyReviewCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    taxonomy_cleanup_candidates: clone(input.taxonomy_cleanup_candidates)
      .map(normalizeTaxonomyCleanupCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    journal_write_follow_up_candidates: clone(input.journal_write_follow_up_candidates)
      .map(normalizeJournalWriteFollowUpCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    case_create_or_update_candidates: clone(input.case_create_or_update_candidates)
      .map(normalizeCaseCreateOrUpdateCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    post_mortem_generation_candidates: clone(input.post_mortem_generation_candidates)
      .map(normalizePostMortemCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    derived_refresh_candidates: clone(input.derived_refresh_candidates)
      .map(normalizeDerivedRefreshCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
    prior_candidate_proposals: clone(input.prior_candidate_proposals)
      .map(normalizePriorCandidate)
      .sort((left, right) => compareText(buildActionId(input.loop_kind, left.action_kind, left), buildActionId(input.loop_kind, right.action_kind, right))),
  };
}

function buildNormalizedAuditLinkage(input: {
  source_journal_record_refs: readonly { trace_id: string; timestamp: string; stage: string; event_hash: string }[];
  source_case_refs: readonly ReviewLoopCaseRef[];
  source_derived_view_refs: readonly ReviewLoopDerivedViewRef[];
  source_prior_refs: readonly ReviewLoopPriorRef[];
  source_playbook_refs: readonly ReviewLoopPlaybookRef[];
  trace_refs: readonly string[];
  audit_log_entry_refs: readonly string[];
  evidence_lineage_refs: readonly string[];
  actions: readonly ReviewLoopAction[];
}): ReviewLoopAuditLinkage {
  const actionJournalRefs = input.actions.flatMap((action) => action.source_journal_record_refs);
  const actionCaseRefs = input.actions.flatMap((action) => action.source_case_refs);
  const actionDerivedViewRefs = input.actions.flatMap((action) => action.source_derived_view_refs);
  const actionPriorRefs = input.actions.flatMap((action) => action.source_prior_refs);
  const actionPlaybookRefs = input.actions.flatMap((action) => action.source_playbook_refs);

  return {
    source_journal_record_refs: sortJournalRefs([...input.source_journal_record_refs, ...actionJournalRefs]),
    source_case_refs: sortCaseRefs([...input.source_case_refs, ...actionCaseRefs]),
    source_derived_view_refs: sortDerivedViewRefs([...input.source_derived_view_refs, ...actionDerivedViewRefs]),
    source_prior_refs: sortPriorRefs([...input.source_prior_refs, ...actionPriorRefs]),
    source_playbook_refs: sortPlaybookRefs([...input.source_playbook_refs, ...actionPlaybookRefs]),
    trace_refs: sortStringRefs([...input.trace_refs, ...input.actions.flatMap((action) => action.trace_refs)]),
    audit_log_entry_refs: sortStringRefs([
      ...input.audit_log_entry_refs,
      ...input.actions.flatMap((action) => action.audit_log_entry_refs),
    ]),
    evidence_lineage_refs: sortStringRefs([
      ...input.evidence_lineage_refs,
      ...input.actions.flatMap((action) => action.evidence_lineage_refs),
    ]),
  };
}

function ensureNoDuplicateActionIds(actions: readonly ReviewLoopAction[], loopKind: string): void {
  const seen = new Set<string>();
  for (const action of actions) {
    if (seen.has(action.action_id)) {
      fail(`duplicate_action_id:${loopKind}:${action.action_id}`);
    }
    seen.add(action.action_id);
  }
}

function buildPlan(
  input: ReviewLoopInput,
  normalizedInput: ReviewLoopInput,
  inputHash: string,
  loopRunId: string,
  nextActions: ReviewLoopAction[]
): ReviewLoopPlan {
  ensureNoDuplicateActionIds(nextActions, input.loop_kind);

  const audit = buildNormalizedAuditLinkage({
    source_journal_record_refs: normalizedInput.source_journal_record_refs,
    source_case_refs: normalizedInput.source_case_refs,
    source_derived_view_refs: normalizedInput.source_derived_view_refs,
    source_prior_refs: normalizedInput.source_prior_refs,
    source_playbook_refs: normalizedInput.source_playbook_refs,
    trace_refs: [normalizedInput.trace_id, ...normalizedInput.trace_refs],
    audit_log_entry_refs: normalizedInput.audit_log_entry_refs,
    evidence_lineage_refs: normalizedInput.evidence_lineage_refs,
    actions: nextActions,
  });

  const outputWithoutHash = {
    schema_version: "review.loop.plan.v1" as const,
    layer: "ops" as const,
    authority_class: "non_authoritative" as const,
    loop_kind: input.loop_kind,
    loop_run_id: loopRunId,
    trace_id: normalizedInput.trace_id,
    observed_at: normalizedInput.observed_at,
    proposal_state: "proposed" as const,
    input_hash: inputHash,
    audit,
    next_actions: nextActions,
  };
  const outputHash = hashResult(outputWithoutHash);

  return assertReviewLoopPlan(
    {
      ...outputWithoutHash,
      output_hash: outputHash,
    } as ReviewLoopPlan,
    "review-loop-planner.buildPlan"
  );
}

function buildActionsFromCandidates(
  loopKind: ReviewLoopInput["loop_kind"],
  loopRunId: string,
  candidates: readonly ReviewLoopProposalCandidate[]
): ReviewLoopAction[] {
  const actions = candidates.map((candidate) => ({
    ...candidate,
    action_id: buildActionId(loopKind, candidate.action_kind, candidate),
    loop_run_id: loopRunId,
  }));

  actions.sort((left, right) => compareText(left.action_id, right.action_id));
  return actions;
}

function buildPerTradeActions(input: PerTradeReviewLoopInput, loopRunId: string): ReviewLoopAction[] {
  return buildActionsFromCandidates(input.loop_kind, loopRunId, [
    ...input.journal_write_follow_up_candidates,
    ...input.case_create_or_update_candidates,
    ...input.post_mortem_generation_candidates,
    ...input.anomaly_review_candidates,
  ]);
}

function buildDailyActions(input: DailyReviewLoopInput, loopRunId: string): ReviewLoopAction[] {
  return buildActionsFromCandidates(input.loop_kind, loopRunId, [
    ...input.journal_write_follow_up_candidates,
    ...input.case_create_or_update_candidates,
    ...input.anomaly_review_candidates,
  ]);
}

function buildWeeklyActions(input: WeeklyReviewLoopInput, loopRunId: string): ReviewLoopAction[] {
  return buildActionsFromCandidates(input.loop_kind, loopRunId, [
    ...input.derived_refresh_candidates,
    ...input.prior_candidate_proposals,
    ...input.playbook_support_candidates,
  ]);
}

function buildMonthlyActions(input: MonthlyReviewLoopInput, loopRunId: string): ReviewLoopAction[] {
  return buildActionsFromCandidates(input.loop_kind, loopRunId, [
    ...input.playbook_support_candidates,
    ...input.anomaly_review_candidates,
    ...input.taxonomy_cleanup_candidates,
  ]);
}

export function buildPerTradeReviewLoopPlan(input: PerTradeReviewLoopInput): ReviewLoopPlan {
  const parsed = PerTradeReviewLoopInputSchema.parse(assertReviewLoopInput(input, "per_trade_loop"));
  const normalized = normalizePerTradeInput(parsed);
  const inputHash = hashResult(normalized);
  const loopRunId = `review-loop:${parsed.loop_kind}:${inputHash}`;
  const actions = buildPerTradeActions(normalized, loopRunId);
  return buildPlan(parsed, normalized, inputHash, loopRunId, actions);
}

export function buildDailyReviewLoopPlan(input: DailyReviewLoopInput): ReviewLoopPlan {
  const parsed = DailyReviewLoopInputSchema.parse(assertReviewLoopInput(input, "daily_review_loop"));
  const normalized = normalizeDailyInput(parsed);
  const inputHash = hashResult(normalized);
  const loopRunId = `review-loop:${parsed.loop_kind}:${inputHash}`;
  const actions = buildDailyActions(normalized, loopRunId);
  return buildPlan(parsed, normalized, inputHash, loopRunId, actions);
}

export function buildWeeklyReviewLoopPlan(input: WeeklyReviewLoopInput): ReviewLoopPlan {
  const parsed = WeeklyReviewLoopInputSchema.parse(assertReviewLoopInput(input, "weekly_review_loop"));
  const normalized = normalizeWeeklyInput(parsed);
  const inputHash = hashResult(normalized);
  const loopRunId = `review-loop:${parsed.loop_kind}:${inputHash}`;
  const actions = buildWeeklyActions(normalized, loopRunId);
  return buildPlan(parsed, normalized, inputHash, loopRunId, actions);
}

export function buildMonthlyReviewLoopPlan(input: MonthlyReviewLoopInput): ReviewLoopPlan {
  const parsed = MonthlyReviewLoopInputSchema.parse(assertReviewLoopInput(input, "monthly_review_loop"));
  const normalized = normalizeMonthlyInput(parsed);
  const inputHash = hashResult(normalized);
  const loopRunId = `review-loop:${parsed.loop_kind}:${inputHash}`;
  const actions = buildMonthlyActions(normalized, loopRunId);
  return buildPlan(parsed, normalized, inputHash, loopRunId, actions);
}
