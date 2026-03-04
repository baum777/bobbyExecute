<!--
  Version: 1.2.0
  Owner: Kimi Swarm
  Layer: operations
  Last Updated: 2026-03-04T07:41:04Z
  DoD: Workstream Kimi-Swarm-Final-Impl aktiv, Phase 0-5 umgesetzt, Review Ready erreicht
-->

# team_plan.md

## Workstream: Kimi-Swarm-Final-Impl

| Feld | Wert |
|------|------|
| **Owner** | Kimi Swarm |
| **Status** | Review Ready (Approval Pending) |
| **Blocker** | Claude Approval für Trigger-Änderungen ausstehend |
| **Start** | 2026-03-04 |
| **Target** | Claude Approval + Merge |

---

## Milestones

| Phase | Beschreibung | DoD |
|-------|--------------|-----|
| 0 | Bootstrap & Repo-Setup | team_plan, JSON-Schemas validiert, MCI/BCI/Hybrid-Formeln validiert |
| 1 | Skill-Foundation (packages/skills/) | 10 Skills mit manifest.json + instructions.md |
| 2 | Memory-DB & Pattern-Engine | iterative renewal, Snappy+SHA-256, 8 Patterns in DecisionResult.flags |
| 3 | Chaos-Test Suite & Gates | 19 Szenarien, Kategorie 5 Trading-Edge, GT-018 Golden Task |
| 4 | Orchestrator & End-to-End Pipeline | 7-Phasen-Kette, Chaos-Gate, Secrets Vault, Action-Handbook |
| 5 | Validation, Tests & Handover | GT-001, GT-005, GT-008, GT-009, GT-013-GT-018, Chaos-Suite, PR, Status Review Ready |

---

## Aktive Golden Tasks (GT-001 bis GT-018)

- GT-001: Full pipeline - Market to Journal (paper-trade)
- GT-002: Pipeline Integration Test
- GT-003: Memory-DB Renewal Test
- GT-004: Pattern Recognition Test
- GT-005–GT-008: Chaos Gate (Kategorie 1–4)
- GT-009–GT-016: Chaos Gate Kategorie 5 (8 Trading-Edge Tests)
- GT-017: Full Integration Test
- GT-018: Full Kimi Swarm Chaos Validation

---

## Abhängigkeiten

- Master-Spec: `docs/architecture/master-trading-bot-intelligence-spec.md`
- Autonomy Policy: `ops/agent-team/autonomy_policy.md`
- Policy Rules: `ops/agent-team/policy_approval_rules.yaml`

---

## Open Approval Gates

| Trigger | Status | Grund |
|---------|--------|-------|
| blueprint_or_golden_task_change | Pending Reviewer_Claude | Blueprint-Dateien ergänzt |
| ci_or_build | Pending Reviewer_Claude | CI-Workflow `chaos-premerge-gate.yml` ergänzt |
| large_change | Pending Reviewer_Claude | Multi-File End-to-End Anpassung Phase 0-5 |
