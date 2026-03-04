<!--
  Version: 1.0.0
  Owner: Kimi Swarm
  Layer: operations
  Last Updated: 2026-03-04T12:00:00Z
  DoD: Workstream definiert, Milestones validiert
-->

# team_plan.md

## Workstream: Kimi-Swarm-Implementation

| Feld | Wert |
|------|------|
| **Owner** | Kimi Swarm |
| **Status** | Review Ready |
| **Start** | 2026-03-04 |
| **Target** | Review Ready nach Phase 6 |

---

## Milestones

| Phase | Beschreibung | DoD |
|-------|--------------|-----|
| 0 | Bootstrap & Validation | Master-Spec, 5 Artefakte, Policy Rules |
| 1 | Core Skills | 10 Skills mit manifest.json + instructions.md |
| 2 | Extended Contracts | IntentSpec, ScoreCard, SignalPack, DataQuality, DecisionResult, MCI/BCI |
| 3 | Memory-DB & Pattern Engine | iterative renewal, 8 Patterns, compression |
| 4 | Chaos-Test Suite | 19 Szenarien, Chaos-Gate |
| 5 | Orchestrator & Golden Tasks | 7-Phasen Pipeline, GT-001 bis GT-018 |
| 6 | Final Validation & Handover | PR-Template, Review Request, Reviewer_Claude Approval |

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
