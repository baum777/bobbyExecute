/**
 * Action-Handbook Lookup
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: governance | Last Updated: 2026-03-04
 */

export interface ActionHandbookLookupInput {
  phase: "research" | "analyse" | "reasoning" | "compress_db" | "chaos_gate" | "memory_log" | "focused_tx";
  decision: "allow" | "deny";
  dryRun: boolean;
  focusedTxExecuted: boolean;
}

/**
 * Deterministischer Loop-Hook nach Phase 7.
 * Ergebnis wird im Orchestrator-State als nextAction abgelegt.
 */
export function lookupActionHandbook(input: ActionHandbookLookupInput): string {
  if (input.phase !== "focused_tx") {
    return "continue_pipeline";
  }

  if (input.decision === "deny") {
    return "loop_research_next_intent";
  }

  if (input.dryRun) {
    return "paper_trade_completed_loop_research";
  }

  if (input.focusedTxExecuted) {
    return "tx_executed_loop_research";
  }

  return "await_review_or_vault_lease";
}
