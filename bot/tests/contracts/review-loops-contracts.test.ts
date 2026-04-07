import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as coreContracts from "@bot/core/contracts/index.js";
import {
  PerTradeReviewLoopInputSchema,
  ReviewLoopPlanSchema,
  REVIEW_LOOP_INPUT_SCHEMA_VERSION,
  REVIEW_LOOP_LAYER,
  REVIEW_LOOP_PLAN_SCHEMA_VERSION,
} from "../../src/core/contracts/review-loops.js";

const NOW = "2026-04-06T10:00:00.000Z";

function makeJournalRef(traceId: string, stage: string) {
  return {
    trace_id: traceId,
    timestamp: NOW,
    stage,
    event_hash: `event:${traceId}:${stage}`,
    decision_hash: `decision:${traceId}:${stage}`,
    result_hash: `result:${traceId}:${stage}`,
  };
}

function makeCaseRef(caseId: string) {
  return {
    case_id: caseId,
    case_type: "trade_case" as const,
    trace_id: `trace:${caseId}`,
    source_journal_record_refs: [makeJournalRef(`trace:${caseId}`, "case.event")],
    trace_refs: [`trace:${caseId}`],
    evidence_lineage_refs: [`lineage:${caseId}`],
  };
}

describe("review loop contracts", () => {
  it("exposes typed input and plan schemas without authority mutation surfaces", () => {
    const input = PerTradeReviewLoopInputSchema.parse({
      schema_version: REVIEW_LOOP_INPUT_SCHEMA_VERSION,
      layer: REVIEW_LOOP_LAYER,
      authority_class: "non_authoritative",
      loop_kind: "per_trade_loop",
      trace_id: "review-loop-trace-1",
      observed_at: NOW,
      source_journal_record_refs: [makeJournalRef("review-loop-trace-1", "journal.write")],
      source_case_refs: [makeCaseRef("case-trade-1")],
      source_derived_view_refs: [],
      source_prior_refs: [],
      source_playbook_refs: [],
      trace_refs: ["review-loop-trace-1"],
      audit_log_entry_refs: ["journal:review-loop-trace-1"],
      evidence_lineage_refs: ["lineage:review-loop-trace-1"],
      trade_case_ref: makeCaseRef("case-trade-1"),
      journal_write_follow_up_candidates: [
        {
          authority_class: "non_authoritative",
          proposal_state: "proposed",
          action_kind: "journal_write_follow_up",
          follow_up_target: "journal:case-trade-1",
          follow_up_reason: "close the journal follow-up loop",
          follow_up_priority: "high",
          trace_refs: ["review-loop-trace-1"],
          audit_log_entry_refs: ["journal:review-loop-trace-1"],
          evidence_lineage_refs: ["lineage:review-loop-trace-1"],
          source_journal_record_refs: [makeJournalRef("review-loop-trace-1", "journal.write")],
          source_case_refs: [makeCaseRef("case-trade-1")],
          source_derived_view_refs: [],
          source_prior_refs: [],
          source_playbook_refs: [],
        },
      ],
      case_create_or_update_candidates: [
        {
          authority_class: "non_authoritative",
          proposal_state: "proposed",
          action_kind: "case_create_or_update",
          case_operation: "update",
          case_type: "trade_case",
          case_id: "case-trade-1",
          subject_refs: [
            {
              subject_kind: "trade",
              subject_id: "trade-1",
              subject_label: "trade:trade-1",
            },
          ],
          trace_refs: ["review-loop-trace-1"],
          audit_log_entry_refs: ["journal:review-loop-trace-1"],
          evidence_lineage_refs: ["lineage:review-loop-trace-1"],
          source_journal_record_refs: [makeJournalRef("review-loop-trace-1", "journal.write")],
          source_case_refs: [makeCaseRef("case-trade-1")],
          source_derived_view_refs: [],
          source_prior_refs: [],
          source_playbook_refs: [],
        },
      ],
      post_mortem_generation_candidates: [
        {
          authority_class: "non_authoritative",
          proposal_state: "proposed",
          action_kind: "post_mortem_generation",
          trade_case_ref: makeCaseRef("case-trade-1"),
          case_id: "post-mortem:case-trade-1",
          subject_refs: [
            {
              subject_kind: "trade",
              subject_id: "trade-1",
              subject_label: "trade:trade-1",
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
          follow_up_reason: "capture the post-trade lesson while it is still fresh",
          trace_refs: ["review-loop-trace-1"],
          audit_log_entry_refs: ["journal:review-loop-trace-1"],
          evidence_lineage_refs: ["lineage:review-loop-trace-1"],
          source_journal_record_refs: [makeJournalRef("review-loop-trace-1", "journal.write")],
          source_case_refs: [makeCaseRef("case-trade-1")],
          source_derived_view_refs: [],
          source_prior_refs: [],
          source_playbook_refs: [],
        },
      ],
      anomaly_review_candidates: [
        {
          authority_class: "non_authoritative",
          proposal_state: "proposed",
          action_kind: "anomaly_review",
          anomaly_id: "anomaly-1",
          anomaly_kind: "slippage_spike",
          severity: "medium",
          review_summary: "review the anomalous slippage pattern",
          trace_refs: ["review-loop-trace-1"],
          audit_log_entry_refs: ["journal:review-loop-trace-1"],
          evidence_lineage_refs: ["lineage:review-loop-trace-1"],
          source_journal_record_refs: [makeJournalRef("review-loop-trace-1", "journal.write")],
          source_case_refs: [makeCaseRef("case-trade-1")],
          source_derived_view_refs: [],
          source_prior_refs: [],
          source_playbook_refs: [],
        },
      ],
    });

    expect(input.schema_version).toBe(REVIEW_LOOP_INPUT_SCHEMA_VERSION);
    expect(input.layer).toBe(REVIEW_LOOP_LAYER);
    expect(input.authority_class).toBe("non_authoritative");

    const plan = ReviewLoopPlanSchema.parse({
      schema_version: REVIEW_LOOP_PLAN_SCHEMA_VERSION,
      layer: REVIEW_LOOP_LAYER,
      authority_class: "non_authoritative",
      loop_kind: "per_trade_loop",
      loop_run_id: "review-loop:per_trade_loop:abc123",
      trace_id: "review-loop-trace-1",
      observed_at: NOW,
      proposal_state: "proposed",
      input_hash: "input-hash-abc123",
      output_hash: "output-hash-abc123",
      audit: {
        source_journal_record_refs: [makeJournalRef("review-loop-trace-1", "journal.write")],
        source_case_refs: [makeCaseRef("case-trade-1")],
        source_derived_view_refs: [],
        source_prior_refs: [],
        source_playbook_refs: [],
        trace_refs: ["review-loop-trace-1"],
        audit_log_entry_refs: ["journal:review-loop-trace-1"],
        evidence_lineage_refs: ["lineage:review-loop-trace-1"],
      },
      next_actions: [
        {
          authority_class: "non_authoritative",
          proposal_state: "proposed",
          action_kind: "journal_write_follow_up",
          action_id: "review-loop:per_trade_loop:journal_write_follow_up:abc123",
          loop_run_id: "review-loop:per_trade_loop:abc123",
          follow_up_target: "journal:case-trade-1",
          follow_up_reason: "close the journal follow-up loop",
          follow_up_priority: "high",
          trace_refs: ["review-loop-trace-1"],
          audit_log_entry_refs: ["journal:review-loop-trace-1"],
          evidence_lineage_refs: ["lineage:review-loop-trace-1"],
          source_journal_record_refs: [makeJournalRef("review-loop-trace-1", "journal.write")],
          source_case_refs: [makeCaseRef("case-trade-1")],
          source_derived_view_refs: [],
          source_prior_refs: [],
          source_playbook_refs: [],
        },
      ],
    });

    expect(plan.authority_class).toBe("non_authoritative");
    expect(plan.proposal_state).toBe("proposed");
    expect(plan.next_actions[0].proposal_state).toBe("proposed");
    expect(plan.next_actions[0].authority_class).toBe("non_authoritative");
    expect(plan).not.toHaveProperty("decisionEnvelope");
    expect(plan).not.toHaveProperty("execution_authority");
  });

  it("keeps the core contracts barrel explicit and includes the review loop exports", () => {
    expect(Object.keys(coreContracts)).toEqual(
      expect.arrayContaining([
        "REVIEW_LOOP_LAYER",
        "REVIEW_LOOP_INPUT_SCHEMA_VERSION",
        "REVIEW_LOOP_PLAN_SCHEMA_VERSION",
        "ReviewLoopKindSchema",
        "ReviewLoopActionKindSchema",
        "ReviewLoopCaseRefSchema",
        "ReviewLoopDerivedViewRefSchema",
        "ReviewLoopPriorRefSchema",
        "ReviewLoopPlaybookRefSchema",
        "ReviewLoopAnomalyRefSchema",
        "ReviewLoopTaxonomyRefSchema",
        "ReviewLoopInputSchema",
        "ReviewLoopPlanSchema",
        "ReviewLoopAuditLinkageSchema",
        "assertReviewLoopInput",
        "assertReviewLoopPlan",
      ])
    );
  });

  it("does not broaden the decision envelope contract while adding review loop support", () => {
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
