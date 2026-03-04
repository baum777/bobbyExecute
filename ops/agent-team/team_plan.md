<!--
  Version: 1.1.0
  Owner: Kimi Swarm
  Layer: operations
  Last Updated: 2026-03-04T17:00:00Z
  DoD: Workstream definiert, Milestones Phase 0-5 + GT-018, alle Schemas validiert
-->

# team_plan.md

## Workstream: Kimi-Swarm-Full-Implementation

| Feld | Wert |
|------|------|
| **Owner** | Kimi Swarm |
| **Status** | In Progress |
| **Blocker** | none |
| **Start** | 2026-03-04 |
| **Target** | Review Ready nach Phase 5 + GT-018 |

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
