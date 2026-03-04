export type DecisionAction = "EXECUTE" | "HOLD" | "BLOCK";

export interface PatternCandidateV1 {
  schema_version: "pattern.candidate.v1";
  pattern_id: string;
  quality_score: number;
  expected_rr: number;
  invalidation: { type: "price_below" | "price_above" | "time_limit"; value: number; };
  evidence_refs: number[];
  features_used: string[];
}

export interface SizingProposalV1 {
  schema_version: "sizing.proposal.v1";
  risk_budget_bps: number;
  notional_cap: number;
  position_size: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  multipliers: { quality: number; regime: number; equity: number; };
  caps_applied: string[];
  hash: string;
}

export interface GateResultV1 {
  gate: string;
  status: "PASS" | "FAIL" | "HOLD";
  reason?: string;
}

export interface DecisionPreviewV1 {
  schema_version: "decision.preview.v1";
  decision_id: string;
  cqd_hash: string;
  pattern: PatternCandidateV1 | null;
  sizing: SizingProposalV1 | null;
  gates: GateResultV1[];
  overall_risk_score: number;
  action: DecisionAction;
  rationale: string[];
  hash: string;
}

export interface DecisionTokenV1 {
  schema_version: "decision.token.v1";
  decision_id: string;
  cqd_hash: string;
  pattern_id: string | null;
  sizing_hash: string | null;
  policy_hash: string;
  gates_hash: string;
  created_at_bucket: number;
  expires_at_bucket: number;
  action: DecisionAction;
  prev_journal_hash: string | null;
  token_hash: string;
  signature?: string;
}
