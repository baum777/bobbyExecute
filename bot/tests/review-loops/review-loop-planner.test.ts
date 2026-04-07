import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDailyReviewLoopPlan,
  buildMonthlyReviewLoopPlan,
  buildPerTradeReviewLoopPlan,
  buildWeeklyReviewLoopPlan,
} from "../../src/review-loops/index.js";
import {
  DailyReviewLoopInputSchema,
  MonthlyReviewLoopInputSchema,
  PerTradeReviewLoopInputSchema,
  ReviewLoopPlanSchema,
  WeeklyReviewLoopInputSchema,
  REVIEW_LOOP_INPUT_SCHEMA_VERSION,
  REVIEW_LOOP_LAYER,
} from "../../src/core/contracts/review-loops.js";

const NOW = "2026-04-06T11:00:00.000Z";

function makeJournalRef(traceId: string, stage: string, timestamp = NOW) {
  return {
    trace_id: traceId,
    timestamp,
    stage,
    event_hash: `event:${traceId}:${stage}:${timestamp}`,
    decision_hash: `decision:${traceId}:${stage}:${timestamp}`,
    result_hash: `result:${traceId}:${stage}:${timestamp}`,
  };
}

function makeCaseRef(caseId: string, caseType: "trade_case" | "trade_post_mortem_case" = "trade_case") {
  return {
    case_id: caseId,
    case_type: caseType,
    trace_id: `trace:${caseId}`,
    source_journal_record_refs: [makeJournalRef(`trace:${caseId}`, "case.event")],
    trace_refs: [`trace:${caseId}`],
    evidence_lineage_refs: [`lineage:${caseId}`],
  };
}

function makeDerivedViewRef(viewId: string, viewType: "setup_performance_view" | "signal_pattern_view") {
  return {
    view_id: viewId,
    view_type: viewType,
    view_status: "ready" as const,
    trace_refs: [`trace:${viewId}`],
    evidence_lineage_refs: [`lineage:${viewId}`],
  };
}

function makePriorRef(priorId: string, priorType: "setup_performance_prior" | "signal_pattern_prior") {
  return {
    prior_id: priorId,
    prior_type: priorType,
    subject_key: `subject:${priorId}`,
    validation_state: "validated" as const,
    trace_refs: [`trace:${priorId}`],
    evidence_lineage_refs: [`lineage:${priorId}`],
  };
}

function makePlaybookRef(playbookId: string, playbookKind: "entry_playbook" | "regime_playbook") {
  return {
    playbook_id: playbookId,
    playbook_kind: playbookKind,
    version_id: `${playbookId}:v1`,
    review_state: "approved" as const,
    trace_refs: [`trace:${playbookId}`],
    evidence_lineage_refs: [`lineage:${playbookId}`],
  };
}

function makeJournalActionBase(traceId: string, caseId: string) {
  return {
    authority_class: "non_authoritative" as const,
    proposal_state: "proposed" as const,
    trace_refs: [traceId],
    audit_log_entry_refs: [`journal:${traceId}`],
    evidence_lineage_refs: [`lineage:${traceId}`],
    source_journal_record_refs: [makeJournalRef(traceId, "journal.write")],
    source_case_refs: [makeCaseRef(caseId)],
    source_derived_view_refs: [],
    source_prior_refs: [],
    source_playbook_refs: [],
  };
}

function makePerTradeInput() {
  const traceId = "review-loop-per-trade";
  const caseRef = makeCaseRef("case-trade-per-trade");

  return PerTradeReviewLoopInputSchema.parse({
    schema_version: REVIEW_LOOP_INPUT_SCHEMA_VERSION,
    layer: REVIEW_LOOP_LAYER,
    authority_class: "non_authoritative",
    loop_kind: "per_trade_loop",
    trace_id: traceId,
    observed_at: NOW,
    source_journal_record_refs: [makeJournalRef(traceId, "journal.write")],
    source_case_refs: [caseRef],
    source_derived_view_refs: [],
    source_prior_refs: [],
    source_playbook_refs: [],
    trace_refs: [traceId],
    audit_log_entry_refs: [`journal:${traceId}`],
    evidence_lineage_refs: [`lineage:${traceId}`],
    trade_case_ref: caseRef,
    journal_write_follow_up_candidates: [
      {
        ...makeJournalActionBase(traceId, caseRef.case_id),
        action_kind: "journal_write_follow_up",
        follow_up_target: `journal:${caseRef.case_id}`,
        follow_up_reason: "follow up the trade journal",
        follow_up_priority: "high",
      },
    ],
    case_create_or_update_candidates: [
      {
        ...makeJournalActionBase(traceId, caseRef.case_id),
        action_kind: "case_create_or_update",
        case_operation: "update",
        case_type: "trade_case",
        case_id: caseRef.case_id,
        subject_refs: [
          {
            subject_kind: "trade",
            subject_id: "trade-per-trade",
            subject_label: "trade:trade-per-trade",
          },
        ],
      },
    ],
    post_mortem_generation_candidates: [
      {
        ...makeJournalActionBase(traceId, caseRef.case_id),
        action_kind: "post_mortem_generation",
        trade_case_ref: caseRef,
        case_id: "post-mortem:case-trade-per-trade",
        subject_refs: [
          {
            subject_kind: "trade",
            subject_id: "trade-per-trade",
            subject_label: "trade:trade-per-trade",
          },
          {
            subject_kind: "failure_mode",
            subject_id: "slippage",
            subject_label: "failure_mode:slippage",
          },
          {
            subject_kind: "review_period",
            subject_id: "2026-04",
            subject_label: "review_period:2026-04",
          },
        ],
        follow_up_reason: "capture the post-mortem while evidence is fresh",
      },
    ],
    anomaly_review_candidates: [
      {
        ...makeJournalActionBase(traceId, caseRef.case_id),
        action_kind: "anomaly_review",
        anomaly_id: "anomaly-per-trade",
        anomaly_kind: "slippage_spike",
        severity: "medium",
        review_summary: "review the slippage spike",
      },
    ],
  });
}

function makeDailyInput() {
  const traceId = "review-loop-daily";
  const caseRef = makeCaseRef("case-daily");

  return DailyReviewLoopInputSchema.parse({
    schema_version: REVIEW_LOOP_INPUT_SCHEMA_VERSION,
    layer: REVIEW_LOOP_LAYER,
    authority_class: "non_authoritative",
    loop_kind: "daily_review_loop",
    trace_id: traceId,
    observed_at: NOW,
    review_date: "2026-04-06",
    source_journal_record_refs: [makeJournalRef(traceId, "journal.daily")],
    source_case_refs: [caseRef],
    source_derived_view_refs: [],
    source_prior_refs: [],
    source_playbook_refs: [],
    trace_refs: [traceId],
    audit_log_entry_refs: [`journal:${traceId}`],
    evidence_lineage_refs: [`lineage:${traceId}`],
    journal_write_follow_up_candidates: [
      {
        ...makeJournalActionBase(traceId, caseRef.case_id),
        action_kind: "journal_write_follow_up",
        follow_up_target: `journal:${caseRef.case_id}`,
        follow_up_reason: "close the daily journal backlog",
        follow_up_priority: "medium",
      },
    ],
    case_create_or_update_candidates: [
      {
        ...makeJournalActionBase(traceId, caseRef.case_id),
        action_kind: "case_create_or_update",
        case_operation: "update",
        case_type: "trade_case",
        case_id: caseRef.case_id,
        subject_refs: [
          {
            subject_kind: "trade",
            subject_id: "trade-daily",
            subject_label: "trade:trade-daily",
          },
        ],
      },
    ],
    anomaly_review_candidates: [
      {
        ...makeJournalActionBase(traceId, caseRef.case_id),
        action_kind: "anomaly_review",
        anomaly_id: "anomaly-daily",
        anomaly_kind: "taxon_drift",
        severity: "low",
        review_summary: "review the anomaly classification drift",
      },
    ],
  });
}

function makeWeeklyInput() {
  const traceId = "review-loop-weekly";

  return WeeklyReviewLoopInputSchema.parse({
    schema_version: REVIEW_LOOP_INPUT_SCHEMA_VERSION,
    layer: REVIEW_LOOP_LAYER,
    authority_class: "non_authoritative",
    loop_kind: "weekly_review_loop",
    trace_id: traceId,
    observed_at: NOW,
    week_start: "2026-03-30T00:00:00.000Z",
    week_end: "2026-04-06T00:00:00.000Z",
    source_journal_record_refs: [makeJournalRef(traceId, "journal.weekly")],
    source_case_refs: [],
    source_derived_view_refs: [makeDerivedViewRef("view-weekly", "setup_performance_view")],
    source_prior_refs: [makePriorRef("prior-weekly", "setup_performance_prior")],
    source_playbook_refs: [makePlaybookRef("playbook-weekly", "entry_playbook")],
    trace_refs: [traceId],
    audit_log_entry_refs: [`journal:${traceId}`],
    evidence_lineage_refs: [`lineage:${traceId}`],
    derived_refresh_candidates: [
      {
        ...makeJournalActionBase(traceId, "case-weekly"),
        action_kind: "derived_refresh_proposal",
        view_id: "view-weekly",
        view_type: "setup_performance_view",
        refresh_scope: "incremental",
        follow_up_reason: "refresh the weekly derived view",
      },
    ],
    prior_candidate_proposals: [
      {
        ...makeJournalActionBase(traceId, "case-weekly"),
        action_kind: "prior_candidate_proposal",
        prior_type: "setup_performance_prior",
        subject_key: "subject:prior-weekly",
        minimum_sample_count: 3,
        minimum_evidence_count: 2,
        source_view_id: "view-weekly",
        follow_up_reason: "propose a reviewed prior candidate",
      },
    ],
    playbook_support_candidates: [
      {
        ...makeJournalActionBase(traceId, "case-weekly"),
        action_kind: "playbook_proposal_support",
        playbook_kind: "entry_playbook",
        playbook_id: "playbook-weekly",
        support_summary: "support a playbook refresh discussion",
      },
    ],
  });
}

function makeMonthlyInput() {
  const traceId = "review-loop-monthly";

  return MonthlyReviewLoopInputSchema.parse({
    schema_version: REVIEW_LOOP_INPUT_SCHEMA_VERSION,
    layer: REVIEW_LOOP_LAYER,
    authority_class: "non_authoritative",
    loop_kind: "monthly_review_loop",
    trace_id: traceId,
    observed_at: NOW,
    review_month: "2026-04",
    source_journal_record_refs: [makeJournalRef(traceId, "journal.monthly")],
    source_case_refs: [],
    source_derived_view_refs: [],
    source_prior_refs: [],
    source_playbook_refs: [makePlaybookRef("playbook-monthly", "regime_playbook")],
    trace_refs: [traceId],
    audit_log_entry_refs: [`journal:${traceId}`],
    evidence_lineage_refs: [`lineage:${traceId}`],
    playbook_support_candidates: [
      {
        ...makeJournalActionBase(traceId, "case-monthly"),
        action_kind: "playbook_proposal_support",
        playbook_kind: "regime_playbook",
        playbook_id: "playbook-monthly",
        support_summary: "support the monthly playbook review",
      },
    ],
    anomaly_review_candidates: [
      {
        ...makeJournalActionBase(traceId, "case-monthly"),
        action_kind: "anomaly_review",
        anomaly_id: "anomaly-monthly",
        anomaly_kind: "taxonomy_drift",
        severity: "high",
        review_summary: "review the monthly anomaly set",
      },
    ],
    taxonomy_cleanup_candidates: [
      {
        ...makeJournalActionBase(traceId, "case-monthly"),
        action_kind: "taxonomy_cleanup",
        taxonomy_kind: "failure_mode",
        cleanup_operation: "rename",
        candidate_labels: ["old-label", "legacy-label"],
        cleanup_summary: "clean up the failure-mode taxonomy",
      },
    ],
  });
}

describe("review loop planner", () => {
  it("builds deterministic non-authoritative plans for all four review cadences", () => {
    const cases = [
      {
        label: "per_trade_loop",
        input: makePerTradeInput(),
        build: buildPerTradeReviewLoopPlan,
        expectedKinds: [
          "journal_write_follow_up",
          "case_create_or_update",
          "post_mortem_generation",
          "anomaly_review",
        ],
      },
      {
        label: "daily_review_loop",
        input: makeDailyInput(),
        build: buildDailyReviewLoopPlan,
        expectedKinds: [
          "journal_write_follow_up",
          "case_create_or_update",
          "anomaly_review",
        ],
      },
      {
        label: "weekly_review_loop",
        input: makeWeeklyInput(),
        build: buildWeeklyReviewLoopPlan,
        expectedKinds: [
          "derived_refresh_proposal",
          "prior_candidate_proposal",
          "playbook_proposal_support",
        ],
      },
      {
        label: "monthly_review_loop",
        input: makeMonthlyInput(),
        build: buildMonthlyReviewLoopPlan,
        expectedKinds: [
          "playbook_proposal_support",
          "anomaly_review",
          "taxonomy_cleanup",
        ],
      },
    ] as const;

    for (const item of cases) {
      const first = item.build(structuredClone(item.input));
      const second = item.build(structuredClone(item.input));

      expect(first).toStrictEqual(second);
      expect(first.loop_kind).toBe(item.label);
      expect(first.authority_class).toBe("non_authoritative");
      expect(first.proposal_state).toBe("proposed");
      expect(first.loop_run_id).toContain(item.label);
      expect(first.audit.trace_refs).toContain(item.input.trace_id);
      expect(first.audit.audit_log_entry_refs).toContain(`journal:${item.input.trace_id}`);
      expect(first.audit.evidence_lineage_refs).toContain(`lineage:${item.input.trace_id}`);
      expect(first.next_actions.map((action) => action.action_kind).sort()).toEqual([...item.expectedKinds].sort());
      expect(first.next_actions.every((action) => action.authority_class === "non_authoritative")).toBe(true);
      expect(first.next_actions.every((action) => action.proposal_state === "proposed")).toBe(true);
      expect(first.next_actions.every((action) => action.loop_run_id === first.loop_run_id)).toBe(true);
      expect(ReviewLoopPlanSchema.parse(first)).toStrictEqual(first);
      expect(first).not.toHaveProperty("decisionEnvelope");
      expect(first).not.toHaveProperty("execution_authority");
    }
  });

  it("keeps the planner source free of silent self-optimization paths", () => {
    const plannerPath = resolve(process.cwd(), "src/review-loops/review-loop-planner.ts");
    const plannerText = readFileSync(plannerPath, "utf8");

    expect(plannerText).not.toMatch(/self[_-]?optimi[sz]e/i);
    expect(plannerText).not.toMatch(/auto[_-]?apply/i);
    expect(plannerText).not.toMatch(/silent[_-]?mutat/i);
    expect(plannerText).not.toContain("decisionEnvelope");
  });

  it("leaves the canonical decision envelope file untouched by review-loop wiring", () => {
    const decisionEnvelopePath = resolve(process.cwd(), "src/core/contracts/decision-envelope.ts");
    const decisionEnvelopeText = readFileSync(decisionEnvelopePath, "utf8");

    expect(decisionEnvelopeText).toContain('schemaVersion: z.literal("decision.envelope.v1")');
    expect(decisionEnvelopeText).toContain('schemaVersion: z.literal("decision.envelope.v2")');
    expect(decisionEnvelopeText).toContain('schemaVersion: z.literal("decision.envelope.v3")');
    expect(decisionEnvelopeText).not.toContain("review.loop");
    expect(decisionEnvelopeText).not.toContain("per_trade_loop");
    expect(decisionEnvelopeText).not.toContain("daily_review_loop");
    expect(decisionEnvelopeText).not.toContain("weekly_review_loop");
    expect(decisionEnvelopeText).not.toContain("monthly_review_loop");
  });
});
