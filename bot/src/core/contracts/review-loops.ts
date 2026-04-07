import { z } from "zod";
import {
  CaseJournalRecordRefSchema,
  CaseSubjectRefSchema,
  CanonicalCaseTypeSchema,
} from "./casebook.js";
import {
  DerivedKnowledgeViewKindSchema,
  DerivedKnowledgeViewStatusSchema,
} from "./derived-views.js";
import {
  MachineSafePriorTypeSchema,
  MachineSafePriorValidationStateSchema,
} from "./priors.js";
import { PlaybookKindSchema, PlaybookReviewStateSchema } from "./playbooks.js";

export const REVIEW_LOOP_LAYER = "ops" as const;
export const REVIEW_LOOP_INPUT_SCHEMA_VERSION = "review.loop.input.v1" as const;
export const REVIEW_LOOP_PLAN_SCHEMA_VERSION = "review.loop.plan.v1" as const;

export const ReviewLoopKinds = [
  "per_trade_loop",
  "daily_review_loop",
  "weekly_review_loop",
  "monthly_review_loop",
] as const;
export type ReviewLoopKind = (typeof ReviewLoopKinds)[number];
export const ReviewLoopKindSchema = z.enum(ReviewLoopKinds);

export const ReviewLoopProposalStates = ["proposed"] as const;
export type ReviewLoopProposalState = (typeof ReviewLoopProposalStates)[number];
export const ReviewLoopProposalStateSchema = z.enum(ReviewLoopProposalStates);

export const ReviewLoopActionKinds = [
  "journal_write_follow_up",
  "case_create_or_update",
  "post_mortem_generation",
  "derived_refresh_proposal",
  "prior_candidate_proposal",
  "playbook_proposal_support",
  "anomaly_review",
  "taxonomy_cleanup",
] as const;
export type ReviewLoopActionKind = (typeof ReviewLoopActionKinds)[number];
export const ReviewLoopActionKindSchema = z.enum(ReviewLoopActionKinds);

export const ReviewLoopCaseRefSchema = z
  .object({
    case_id: z.string().min(1),
    case_type: CanonicalCaseTypeSchema,
    trace_id: z.string().min(1),
    source_journal_record_refs: z.array(CaseJournalRecordRefSchema).min(1),
    trace_refs: z.array(z.string().min(1)).min(1),
    evidence_lineage_refs: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type ReviewLoopCaseRef = z.infer<typeof ReviewLoopCaseRefSchema>;

export const ReviewLoopDerivedViewRefSchema = z
  .object({
    view_id: z.string().min(1),
    view_type: DerivedKnowledgeViewKindSchema,
    view_status: DerivedKnowledgeViewStatusSchema,
    trace_refs: z.array(z.string().min(1)).min(1),
    evidence_lineage_refs: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type ReviewLoopDerivedViewRef = z.infer<typeof ReviewLoopDerivedViewRefSchema>;

export const ReviewLoopPriorRefSchema = z
  .object({
    prior_id: z.string().min(1),
    prior_type: MachineSafePriorTypeSchema,
    subject_key: z.string().min(1),
    validation_state: MachineSafePriorValidationStateSchema,
    trace_refs: z.array(z.string().min(1)).min(1),
    evidence_lineage_refs: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type ReviewLoopPriorRef = z.infer<typeof ReviewLoopPriorRefSchema>;

export const ReviewLoopPlaybookRefSchema = z
  .object({
    playbook_id: z.string().min(1),
    playbook_kind: PlaybookKindSchema,
    version_id: z.string().min(1),
    review_state: PlaybookReviewStateSchema,
    trace_refs: z.array(z.string().min(1)).min(1),
    evidence_lineage_refs: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type ReviewLoopPlaybookRef = z.infer<typeof ReviewLoopPlaybookRefSchema>;

export const ReviewLoopAnomalyRefSchema = z
  .object({
    anomaly_id: z.string().min(1),
    anomaly_kind: z.string().min(1),
    severity: z.enum(["low", "medium", "high"]),
    trace_refs: z.array(z.string().min(1)).min(1),
    evidence_lineage_refs: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type ReviewLoopAnomalyRef = z.infer<typeof ReviewLoopAnomalyRefSchema>;

export const ReviewLoopTaxonomyRefSchema = z
  .object({
    taxonomy_kind: z.string().min(1),
    subject_id: z.string().min(1),
    subject_label: z.string().min(1).optional(),
    trace_refs: z.array(z.string().min(1)).min(1),
    evidence_lineage_refs: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type ReviewLoopTaxonomyRef = z.infer<typeof ReviewLoopTaxonomyRefSchema>;

const ReviewLoopInputBaseSchema = z
  .object({
    schema_version: z.literal(REVIEW_LOOP_INPUT_SCHEMA_VERSION),
    layer: z.literal(REVIEW_LOOP_LAYER),
    authority_class: z.literal("non_authoritative"),
    trace_id: z.string().min(1),
    observed_at: z.string().datetime(),
    source_journal_record_refs: z.array(CaseJournalRecordRefSchema).min(1),
    source_case_refs: z.array(ReviewLoopCaseRefSchema).default([]),
    source_derived_view_refs: z.array(ReviewLoopDerivedViewRefSchema).default([]),
    source_prior_refs: z.array(ReviewLoopPriorRefSchema).default([]),
    source_playbook_refs: z.array(ReviewLoopPlaybookRefSchema).default([]),
    trace_refs: z.array(z.string().min(1)).min(1),
    audit_log_entry_refs: z.array(z.string().min(1)).min(1),
    evidence_lineage_refs: z.array(z.string().min(1)).min(1),
  })
  .strict();

const ReviewLoopProposalBaseSchema = z
  .object({
    authority_class: z.literal("non_authoritative"),
    proposal_state: ReviewLoopProposalStateSchema,
    trace_refs: z.array(z.string().min(1)).min(1),
    audit_log_entry_refs: z.array(z.string().min(1)).min(1),
    evidence_lineage_refs: z.array(z.string().min(1)).min(1),
    source_journal_record_refs: z.array(CaseJournalRecordRefSchema).min(1),
    source_case_refs: z.array(ReviewLoopCaseRefSchema).default([]),
    source_derived_view_refs: z.array(ReviewLoopDerivedViewRefSchema).default([]),
    source_prior_refs: z.array(ReviewLoopPriorRefSchema).default([]),
    source_playbook_refs: z.array(ReviewLoopPlaybookRefSchema).default([]),
  })
  .strict();

export const ReviewLoopJournalWriteFollowUpCandidateSchema = ReviewLoopProposalBaseSchema.extend({
  action_kind: z.literal("journal_write_follow_up"),
  follow_up_target: z.string().min(1),
  follow_up_reason: z.string().min(1),
  follow_up_priority: z.enum(["low", "medium", "high"]),
});
export type ReviewLoopJournalWriteFollowUpCandidate = z.infer<
  typeof ReviewLoopJournalWriteFollowUpCandidateSchema
>;

export const ReviewLoopCaseCreateOrUpdateCandidateSchema = ReviewLoopProposalBaseSchema.extend({
  action_kind: z.literal("case_create_or_update"),
  case_operation: z.enum(["create", "update"]),
  case_type: CanonicalCaseTypeSchema,
  case_id: z.string().min(1),
  subject_refs: z.array(CaseSubjectRefSchema).min(1),
});
export type ReviewLoopCaseCreateOrUpdateCandidate = z.infer<
  typeof ReviewLoopCaseCreateOrUpdateCandidateSchema
>;

export const ReviewLoopPostMortemGenerationCandidateSchema = ReviewLoopProposalBaseSchema.extend({
  action_kind: z.literal("post_mortem_generation"),
  trade_case_ref: ReviewLoopCaseRefSchema,
  case_id: z.string().min(1),
  subject_refs: z.array(CaseSubjectRefSchema).min(1),
  follow_up_reason: z.string().min(1),
});
export type ReviewLoopPostMortemGenerationCandidate = z.infer<
  typeof ReviewLoopPostMortemGenerationCandidateSchema
>;

export const ReviewLoopDerivedRefreshCandidateSchema = ReviewLoopProposalBaseSchema.extend({
  action_kind: z.literal("derived_refresh_proposal"),
  view_id: z.string().min(1),
  view_type: DerivedKnowledgeViewKindSchema,
  refresh_scope: z.enum(["incremental", "full"]),
  follow_up_reason: z.string().min(1),
});
export type ReviewLoopDerivedRefreshCandidate = z.infer<
  typeof ReviewLoopDerivedRefreshCandidateSchema
>;

export const ReviewLoopPriorCandidateProposalSchema = ReviewLoopProposalBaseSchema.extend({
  action_kind: z.literal("prior_candidate_proposal"),
  prior_type: MachineSafePriorTypeSchema,
  subject_key: z.string().min(1),
  minimum_sample_count: z.number().int().positive(),
  minimum_evidence_count: z.number().int().positive(),
  source_view_id: z.string().min(1),
  follow_up_reason: z.string().min(1),
});
export type ReviewLoopPriorCandidateProposal = z.infer<
  typeof ReviewLoopPriorCandidateProposalSchema
>;

export const ReviewLoopPlaybookSupportCandidateSchema = ReviewLoopProposalBaseSchema.extend({
  action_kind: z.literal("playbook_proposal_support"),
  playbook_kind: PlaybookKindSchema,
  playbook_id: z.string().min(1),
  support_summary: z.string().min(1),
});
export type ReviewLoopPlaybookSupportCandidate = z.infer<
  typeof ReviewLoopPlaybookSupportCandidateSchema
>;

export const ReviewLoopAnomalyReviewCandidateSchema = ReviewLoopProposalBaseSchema.extend({
  action_kind: z.literal("anomaly_review"),
  anomaly_id: z.string().min(1),
  anomaly_kind: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]),
  review_summary: z.string().min(1),
});
export type ReviewLoopAnomalyReviewCandidate = z.infer<
  typeof ReviewLoopAnomalyReviewCandidateSchema
>;

export const ReviewLoopTaxonomyCleanupCandidateSchema = ReviewLoopProposalBaseSchema.extend({
  action_kind: z.literal("taxonomy_cleanup"),
  taxonomy_kind: z.string().min(1),
  cleanup_operation: z.enum(["merge", "retire", "rename", "split"]),
  candidate_labels: z.array(z.string().min(1)).min(1),
  cleanup_summary: z.string().min(1),
});
export type ReviewLoopTaxonomyCleanupCandidate = z.infer<
  typeof ReviewLoopTaxonomyCleanupCandidateSchema
>;

export const PerTradeReviewLoopInputSchema = ReviewLoopInputBaseSchema.extend({
  loop_kind: z.literal("per_trade_loop"),
  trade_case_ref: ReviewLoopCaseRefSchema,
  journal_write_follow_up_candidates: z.array(ReviewLoopJournalWriteFollowUpCandidateSchema).min(1),
  case_create_or_update_candidates: z.array(ReviewLoopCaseCreateOrUpdateCandidateSchema).min(1),
  post_mortem_generation_candidates: z.array(ReviewLoopPostMortemGenerationCandidateSchema).min(1),
  anomaly_review_candidates: z.array(ReviewLoopAnomalyReviewCandidateSchema).default([]),
});
export type PerTradeReviewLoopInput = z.infer<typeof PerTradeReviewLoopInputSchema>;

export const DailyReviewLoopInputSchema = ReviewLoopInputBaseSchema.extend({
  loop_kind: z.literal("daily_review_loop"),
  review_date: z.string().min(1),
  journal_write_follow_up_candidates: z.array(ReviewLoopJournalWriteFollowUpCandidateSchema).min(1),
  case_create_or_update_candidates: z.array(ReviewLoopCaseCreateOrUpdateCandidateSchema).min(1),
  anomaly_review_candidates: z.array(ReviewLoopAnomalyReviewCandidateSchema).min(1),
  post_mortem_generation_candidates: z.array(ReviewLoopPostMortemGenerationCandidateSchema).default([]),
  derived_refresh_candidates: z.array(ReviewLoopDerivedRefreshCandidateSchema).default([]),
  prior_candidate_proposals: z.array(ReviewLoopPriorCandidateProposalSchema).default([]),
  playbook_support_candidates: z.array(ReviewLoopPlaybookSupportCandidateSchema).default([]),
  taxonomy_cleanup_candidates: z.array(ReviewLoopTaxonomyCleanupCandidateSchema).default([]),
});
export type DailyReviewLoopInput = z.infer<typeof DailyReviewLoopInputSchema>;

export const WeeklyReviewLoopInputSchema = ReviewLoopInputBaseSchema.extend({
  loop_kind: z.literal("weekly_review_loop"),
  week_start: z.string().datetime(),
  week_end: z.string().datetime(),
  derived_refresh_candidates: z.array(ReviewLoopDerivedRefreshCandidateSchema).min(1),
  prior_candidate_proposals: z.array(ReviewLoopPriorCandidateProposalSchema).min(1),
  playbook_support_candidates: z.array(ReviewLoopPlaybookSupportCandidateSchema).min(1),
  journal_write_follow_up_candidates: z.array(ReviewLoopJournalWriteFollowUpCandidateSchema).default([]),
  case_create_or_update_candidates: z.array(ReviewLoopCaseCreateOrUpdateCandidateSchema).default([]),
  post_mortem_generation_candidates: z.array(ReviewLoopPostMortemGenerationCandidateSchema).default([]),
  anomaly_review_candidates: z.array(ReviewLoopAnomalyReviewCandidateSchema).default([]),
  taxonomy_cleanup_candidates: z.array(ReviewLoopTaxonomyCleanupCandidateSchema).default([]),
});
export type WeeklyReviewLoopInput = z.infer<typeof WeeklyReviewLoopInputSchema>;

export const MonthlyReviewLoopInputSchema = ReviewLoopInputBaseSchema.extend({
  loop_kind: z.literal("monthly_review_loop"),
  review_month: z.string().min(1),
  playbook_support_candidates: z.array(ReviewLoopPlaybookSupportCandidateSchema).min(1),
  anomaly_review_candidates: z.array(ReviewLoopAnomalyReviewCandidateSchema).min(1),
  taxonomy_cleanup_candidates: z.array(ReviewLoopTaxonomyCleanupCandidateSchema).min(1),
  journal_write_follow_up_candidates: z.array(ReviewLoopJournalWriteFollowUpCandidateSchema).default([]),
  case_create_or_update_candidates: z.array(ReviewLoopCaseCreateOrUpdateCandidateSchema).default([]),
  post_mortem_generation_candidates: z.array(ReviewLoopPostMortemGenerationCandidateSchema).default([]),
  derived_refresh_candidates: z.array(ReviewLoopDerivedRefreshCandidateSchema).default([]),
  prior_candidate_proposals: z.array(ReviewLoopPriorCandidateProposalSchema).default([]),
});
export type MonthlyReviewLoopInput = z.infer<typeof MonthlyReviewLoopInputSchema>;

export const ReviewLoopInputSchema = z.union([
  PerTradeReviewLoopInputSchema,
  DailyReviewLoopInputSchema,
  WeeklyReviewLoopInputSchema,
  MonthlyReviewLoopInputSchema,
]);
export type ReviewLoopInput = z.infer<typeof ReviewLoopInputSchema>;

export const ReviewLoopJournalWriteFollowUpActionSchema = ReviewLoopJournalWriteFollowUpCandidateSchema.extend({
  action_id: z.string().min(1),
  loop_run_id: z.string().min(1),
});
export type ReviewLoopJournalWriteFollowUpAction = z.infer<
  typeof ReviewLoopJournalWriteFollowUpActionSchema
>;

export const ReviewLoopCaseCreateOrUpdateActionSchema = ReviewLoopCaseCreateOrUpdateCandidateSchema.extend({
  action_id: z.string().min(1),
  loop_run_id: z.string().min(1),
});
export type ReviewLoopCaseCreateOrUpdateAction = z.infer<
  typeof ReviewLoopCaseCreateOrUpdateActionSchema
>;

export const ReviewLoopPostMortemGenerationActionSchema = ReviewLoopPostMortemGenerationCandidateSchema.extend({
  action_id: z.string().min(1),
  loop_run_id: z.string().min(1),
});
export type ReviewLoopPostMortemGenerationAction = z.infer<
  typeof ReviewLoopPostMortemGenerationActionSchema
>;

export const ReviewLoopDerivedRefreshActionSchema = ReviewLoopDerivedRefreshCandidateSchema.extend({
  action_id: z.string().min(1),
  loop_run_id: z.string().min(1),
});
export type ReviewLoopDerivedRefreshAction = z.infer<typeof ReviewLoopDerivedRefreshActionSchema>;

export const ReviewLoopPriorCandidateActionSchema = ReviewLoopPriorCandidateProposalSchema.extend({
  action_id: z.string().min(1),
  loop_run_id: z.string().min(1),
});
export type ReviewLoopPriorCandidateAction = z.infer<typeof ReviewLoopPriorCandidateActionSchema>;

export const ReviewLoopPlaybookSupportActionSchema = ReviewLoopPlaybookSupportCandidateSchema.extend({
  action_id: z.string().min(1),
  loop_run_id: z.string().min(1),
});
export type ReviewLoopPlaybookSupportAction = z.infer<typeof ReviewLoopPlaybookSupportActionSchema>;

export const ReviewLoopAnomalyReviewActionSchema = ReviewLoopAnomalyReviewCandidateSchema.extend({
  action_id: z.string().min(1),
  loop_run_id: z.string().min(1),
});
export type ReviewLoopAnomalyReviewAction = z.infer<typeof ReviewLoopAnomalyReviewActionSchema>;

export const ReviewLoopTaxonomyCleanupActionSchema = ReviewLoopTaxonomyCleanupCandidateSchema.extend({
  action_id: z.string().min(1),
  loop_run_id: z.string().min(1),
});
export type ReviewLoopTaxonomyCleanupAction = z.infer<typeof ReviewLoopTaxonomyCleanupActionSchema>;

export const ReviewLoopActionSchema = z.union([
  ReviewLoopJournalWriteFollowUpActionSchema,
  ReviewLoopCaseCreateOrUpdateActionSchema,
  ReviewLoopPostMortemGenerationActionSchema,
  ReviewLoopDerivedRefreshActionSchema,
  ReviewLoopPriorCandidateActionSchema,
  ReviewLoopPlaybookSupportActionSchema,
  ReviewLoopAnomalyReviewActionSchema,
  ReviewLoopTaxonomyCleanupActionSchema,
]);
export type ReviewLoopAction = z.infer<typeof ReviewLoopActionSchema>;

export const ReviewLoopAuditLinkageSchema = z
  .object({
    source_journal_record_refs: z.array(CaseJournalRecordRefSchema).min(1),
    source_case_refs: z.array(ReviewLoopCaseRefSchema).default([]),
    source_derived_view_refs: z.array(ReviewLoopDerivedViewRefSchema).default([]),
    source_prior_refs: z.array(ReviewLoopPriorRefSchema).default([]),
    source_playbook_refs: z.array(ReviewLoopPlaybookRefSchema).default([]),
    trace_refs: z.array(z.string().min(1)).min(1),
    audit_log_entry_refs: z.array(z.string().min(1)).min(1),
    evidence_lineage_refs: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type ReviewLoopAuditLinkage = z.infer<typeof ReviewLoopAuditLinkageSchema>;

const ReviewLoopPlanBaseSchema = z
  .object({
    schema_version: z.literal(REVIEW_LOOP_PLAN_SCHEMA_VERSION),
    layer: z.literal(REVIEW_LOOP_LAYER),
    authority_class: z.literal("non_authoritative"),
    loop_kind: ReviewLoopKindSchema,
    loop_run_id: z.string().min(1),
    trace_id: z.string().min(1),
    observed_at: z.string().datetime(),
    proposal_state: ReviewLoopProposalStateSchema,
    input_hash: z.string().min(1),
    output_hash: z.string().min(1),
    audit: ReviewLoopAuditLinkageSchema,
    next_actions: z.array(ReviewLoopActionSchema),
  })
  .strict();

export const PerTradeReviewLoopPlanSchema = ReviewLoopPlanBaseSchema.extend({
  loop_kind: z.literal("per_trade_loop"),
  next_actions: z.array(
    z.union([
      ReviewLoopJournalWriteFollowUpActionSchema,
      ReviewLoopCaseCreateOrUpdateActionSchema,
      ReviewLoopPostMortemGenerationActionSchema,
      ReviewLoopAnomalyReviewActionSchema,
    ])
  ),
});
export type PerTradeReviewLoopPlan = z.infer<typeof PerTradeReviewLoopPlanSchema>;

export const DailyReviewLoopPlanSchema = ReviewLoopPlanBaseSchema.extend({
  loop_kind: z.literal("daily_review_loop"),
  next_actions: z.array(
    z.union([
      ReviewLoopJournalWriteFollowUpActionSchema,
      ReviewLoopCaseCreateOrUpdateActionSchema,
      ReviewLoopAnomalyReviewActionSchema,
    ])
  ),
});
export type DailyReviewLoopPlan = z.infer<typeof DailyReviewLoopPlanSchema>;

export const WeeklyReviewLoopPlanSchema = ReviewLoopPlanBaseSchema.extend({
  loop_kind: z.literal("weekly_review_loop"),
  next_actions: z.array(
    z.union([
      ReviewLoopDerivedRefreshActionSchema,
      ReviewLoopPriorCandidateActionSchema,
      ReviewLoopPlaybookSupportActionSchema,
    ])
  ),
});
export type WeeklyReviewLoopPlan = z.infer<typeof WeeklyReviewLoopPlanSchema>;

export const MonthlyReviewLoopPlanSchema = ReviewLoopPlanBaseSchema.extend({
  loop_kind: z.literal("monthly_review_loop"),
  next_actions: z.array(
    z.union([
      ReviewLoopPlaybookSupportActionSchema,
      ReviewLoopAnomalyReviewActionSchema,
      ReviewLoopTaxonomyCleanupActionSchema,
    ])
  ),
});
export type MonthlyReviewLoopPlan = z.infer<typeof MonthlyReviewLoopPlanSchema>;

export const ReviewLoopPlanSchema = z.union([
  PerTradeReviewLoopPlanSchema,
  DailyReviewLoopPlanSchema,
  WeeklyReviewLoopPlanSchema,
  MonthlyReviewLoopPlanSchema,
]);
export type ReviewLoopPlan = z.infer<typeof ReviewLoopPlanSchema>;

export function assertReviewLoopInput(value: unknown, source = "unknown"): ReviewLoopInput {
  const result = ReviewLoopInputSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const reason = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}:${issue.message}`;
    })
    .join(";");

  throw new Error(`INVALID_REVIEW_LOOP_INPUT:${source}:${reason}`);
}

export function assertReviewLoopPlan(value: unknown, source = "unknown"): ReviewLoopPlan {
  const result = ReviewLoopPlanSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const reason = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}:${issue.message}`;
    })
    .join(";");

  throw new Error(`INVALID_REVIEW_LOOP_PLAN:${source}:${reason}`);
}
