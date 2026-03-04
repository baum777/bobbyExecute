<!--
  Version: 1.1.0
  Owner: Kimi Swarm
  Layer: operations
  Last Updated: 2026-03-04T07:41:04Z
  DoD: Autonomy Ladder definiert, Tier-Zuweisungen konsistent
-->

# autonomy_policy.md

## Autonomy Ladder

| Tier | Name | Beschreibung | Skills |
|------|------|--------------|--------|
| 1 | read-only | Nur Lesen, keine Aktionen | intelligence.research (Teil) |
| 2 | suggest-only | Vorschläge, keine Ausführung | intelligence.analyse |
| 3 | execute-with-approval | Ausführung nach Review | trading.secrets_vault, trading.focused_tx_execute |
| 4 | autonomous-with-limits | Autonom mit Limits, Blueprint-Änderungen erfordern Reviewer_Claude | governance.chaos_memory_db_test |

---

## Kimi Swarm Autorisierung

- **Autorisiert bis Tier 3** (execute-with-approval)
- **Tier 4**: Bei blueprint_changes oder golden_task_changes → Reviewer_Claude Approval erforderlich
- **destructive_ops**: Immer Review-Gate

---

## Hard Rules

1. Kein `.env`, keine static secrets – ausschließlich `trading.secrets_vault`
2. Kein ToolRouter-Bypass – alle Skills über manifest.json registriert
3. Destructive Ops: Immer Approval-Gate
4. Blueprint- oder Golden-Task-Änderungen: Reviewer_Claude Approval

---

## Approval Trigger (verbindlich)

- blueprint_or_golden_task_change
- destructive_ops
- ci_or_build
- prompt_or_agent_core
- prod_config
- large_change
