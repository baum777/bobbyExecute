# BobbyExecute — Root Spec Bundle

Dieses Bundle ist als **Repo-Root-taugliches Planungs- und Umsetzungs-Paket** gedacht.

## Zweck
Es liefert einen klaren Run Path von:

**Planning → Implement → Checks → DoD → Review/Testing → Final Hardening**

mit dem Ziel:

- **testable**
- **paper-ready**
- **production-done** (nach Abschluss aller finalen Gates)
- **operator-fähig**
- **auditierbar**

## Empfohlene Ablage im Repo-Root

```text
/IMPLEMENTATION_MASTER_PLAN.md
/PHASES_0_TO_11.md
/CHECKS_DOD_REVIEW_TESTING.md
/FINAL_HARDENING_AND_PROD_GATES.md
/CODEX_IMPLEMENTATION_RUNBOOK.md
/HANDOFF_TEMPLATE_PHASED.md
```

## Wichtige Annahmen
- `bot/` ist die **autoritative aktive Runtime**
- `dor-bot/` bleibt **Legacy/Referenz**
- Governance und SoT bleiben übergeordnet
- Dry Run → Paper → Live ist die verbindliche Rollout-Reihenfolge
- Live ist **nicht** Teil des unmittelbaren Implementation-Closures, sondern erst nach Paper-Soak und Final Hardening

## Sofort nutzbarer Ablauf
1. `IMPLEMENTATION_MASTER_PLAN.md` lesen
2. `PHASES_0_TO_11.md` als Arbeitsreihenfolge benutzen
3. `CHECKS_DOD_REVIEW_TESTING.md` für PR- und Merge-Gates verwenden
4. `CODEX_IMPLEMENTATION_RUNBOOK.md` für Agent-/Codex-Runs nutzen
5. `FINAL_HARDENING_AND_PROD_GATES.md` erst nach Paper-Soak als Freigabedokument verwenden
