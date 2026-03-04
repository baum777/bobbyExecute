# governance.action_handbook_lookup

<!-- Version: 1.0.0 | Owner: Kimi Swarm | Layer: governance | Last Updated: 2026-03-04 | DoD: Loop-Entscheidung nach Phase 7 dokumentiert -->

## Input

- **PhaseState**: Aktuelle Pipeline-Phase
- **DecisionResult**: Entscheidung (`allow|deny`) + Kontext

## Output

- **NextAction**: Deterministische nächste Aktion (Loop/Wait/Continue)

## Regeln

1. Nur nach `focused_tx` relevant.
2. `decision=deny` → `loop_research_next_intent`.
3. `dryRun=true` + `decision=allow` → `paper_trade_completed_loop_research`.
4. `decision=allow` + TX ausgeführt → `tx_executed_loop_research`.
5. Fehlende Freigabe/Vault-Lease → `await_review_or_vault_lease`.

## Side Effects

Keine. Reine Lookup-Funktion.

## Guardrails

- Deterministisch
- Kein ToolRouter-Bypass
- Keine impliziten Retry-Loops ohne Audit-Log
