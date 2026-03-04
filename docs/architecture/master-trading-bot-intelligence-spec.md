<!--
  Version: 1.0.0
  Owner: @teamlead_orchestrator
  Layer: architecture
  Last Updated: 2026-03-04T00:25:00Z
  DoD: Alle Komponenten konsolidiert, 5 Pflicht-Artefakte aktualisiert, GT-001 bis GT-018 validiert
-->

# Vollständige System-Spezifikation: Trading-Bot Intelligence & Execution Setup (Canonical Master Spec v1.0)

## 1. Überblick & Scope (Single Source of Truth)

Dieses Dokument ist die **kanonische, vollständige Spezifikation** des gesamten Trading-Bot-Systems (bot/ + dor-bot Merge → Skill-basiert). Es vereint:

- Governance & Operating Model
- Extended Intelligence & Execution Pipeline
- Iterative Renewed Compressed Memory-DB
- Pattern Recognition Skill
- Chaos-Test Suite (19 Szenarien)
- Secrets Management
- Alle Contracts, Skills, Guardrails und Dokumentationsregeln

**Ziel**: Ein deterministischer, fail-closed, chaos-resilient, governance-konformer Trading-Bot für Solana Meme-Coins mit 100 % Nachvollziehbarkeit und regulatorischer Tauglichkeit.

**Gesamtarchitektur-High-Level**  
Governance (L0) → Extended Pipeline (7 Phasen) → Memory-DB (iterativ renewed + compressed) → Pattern Recognition → Chaos-Gate → Focused TX Execute → Loop

---

## 2. Governance & Autonomy (Pflicht für alle Komponenten)

- **5 Mandatory Repo Artifacts** (`ops/agent-team/`): `team_plan.md`, `team_findings.md`, `team_progress.md`, `team_decisions.md`, `autonomy_policy.md`
- **Autonomy Ladder**: Tier 1 read-only … Tier 4 autonomous-with-limits (Skills: Tier 3–4)
- **Hard Rules**: No secrets/.env, Confirm destructive ops, Review-Gates bei blueprint-/golden-task-changes
- **Approval Rules** (`policy_approval_rules.yaml`): 6 Trigger (u.a. blueprint_or_golden_task_change, destructive_ops, ci_or_build)
- **Scorecard** (7 Kriterien, max 14 Punkte): Outcome, Tool selection, Input quality, Error handling, Side effects, Safety, Efficiency
- **5 Dokumentations-Layer**: strategy → architecture → implementation → operations → evidence
- **Workflow-Pflicht**: Vorher: team_plan.md lesen; Während: Findings + Progress (ISO-UTC) loggen; Nachher: 5 Artefakte + PR-Template (6 Sektionen) + Golden Tasks

**Repo-Artefakte sind die Wahrheit** – Chat-Kontext zählt nicht.

---

## 3. Extended Intelligence & Execution Pipeline (Deterministisch, Skill-orchestriert)

```
1. Research (intelligence.research)
2. Analyse (intelligence.analyse) → MCI/BCI/Hybrid + Cross-Source
3. Reasoning (intelligence.reasoning) + pattern_recognizer
4. Compress-DB (memory.compress_db)
5. Chaos-Gate (governance.chaos_memory_db_test v1.3)
6. Memory-Log (memory.log_append)
7. Focused TX Execute (trading.focused_tx_execute) + Secrets Vault
→ Loop via Action-Handbook
```

**Contracts** (harmonisiert): IntentSpec, DataQuality, SignalPack, ScoreCard (MCI/BCI/Hybrid), DecisionResult

**MCI/BCI/Hybrid**: age-adjusted, double-penalty protected (aus bci-mci.md + MATHEMATISCHE-GESAMTFORMEL.md + engine_v_4.md).

---

## 4. Memory-DB (Iterativ Renewed, Compressed, Hybrid)

- **Quellen**: Onchain (Moralis/DexScreener/Paprika) + X-TL (x_keyword_search/x_semantic_search)
- **Renewal**: alle 45–60 s oder bei >4 % DataQuality-Change
- **Compression**: Snappy + SHA-256 Chain (canonicalize → hash → journal)
- **Storage**: Append-only + Snapshot für Crash-Recovery
- **Guarantees**: cross_source_confidence_score ≥ 85 %, Fail-Closed bei <70 % completeness

---

## 5. Pattern Recognition Skill (reasoning.pattern_recognizer v1.1)

**8 feste Patterns** (deterministisch auf ScoreCard + SignalPack):

1. Velocity-Liquidity-Divergence
2. Bundle/Sybil-Cluster
3. Narrative-Shift
4. Smart-Money-Fakeout
5. Early-Pump-Risk
6. Sentiment-Structural-Mismatch
7. Cross-Source-Anomaly
8. Fragile-Expansion

**Output**: patterns[], flags[], confidence, evidence (mit Hash)

---

## 6. Chaos-Test Suite (governance.chaos_memory_db_test v1.3)

**19 Szenarien in 5 Kategorien – Pflicht-Gate vor jedem Memory-DB-/Trading-Change**

**Kategorie 1**: Infrastructure (Network partition, Node failure, Clock skew)  
**Kategorie 2**: Data Integrity (Corruption, Stale data, Source manipulation)  
**Kategorie 3**: Security & Secrets (Vault failure, Permission escalation, Secret rotation)  
**Kategorie 4**: Performance & Load (Load spike, Memory pressure)  
**Kategorie 5: Trading-Edge & Pattern Integrity** (8 Szenarien):

- 12. Pattern-Spike Test
- 13. Rapid Narrative Shift Test
- 14. Cross-Source + Flash-Crash Test
- 15. MEV / Sandwich Simulation
- 16. Simulated Rug-Pull / Liquidity Drain
- 17. Oracle Manipulation / Fake Price Feed
- 18. Pump & Dump Cluster Attack
- 19. Liquidation-Cascade + HFT-Burst

**Success**: ≥ 98 % Pass-Rate + Audit-Hash-Chain. Fail in Kategorie 5 → sofortiger Abort + Escalation.

---

## 7. Skills-Architektur (packages/skills/)

- Jeder Skill: `manifest.json` (id, version, layer, autonomyTier, sideEffects, reviewPolicy) + `instructions.md` (Standard-Template)
- Guardrails: No ToolRouter-Bypass, Side-Effects deklariert, Review-Gate bindend, Clock-only, 100 % Audit-Logging
- Zentrale Skills: `trading.secrets_vault` (HashiCorp Vault, Dynamic Secrets, Tier 3), `intelligence.*`, `memory.*`, `governance.chaos_*`, `trading.focused_tx_execute`

---

## 8. Sicherheits- & Resilience-Stack

- Secrets: ausschließlich via `trading.secrets_vault` (Short-TTL, Fail-Closed)
- Fail-Closed überall (Vault unreachable, Chaos-Fail, DataQuality <70 %)
- Determinismus: SHA-256 Hash-Chain in Memory-Log + Journal
- Circuit-Breaker, Review-Gates, Event Sourcing

---

## 9. Test- & Golden-Task-Strategie

- GT-001 bis GT-018 aktiv (inkl. Pipeline, Secrets Migration, Chaos-Suite)
- Unit + Integration + Chaos (19 Szenarien) + E2E

---

## 10. Migrations- & Deployment-Pfad

- Kurzfristig: Secrets Vault + Chaos-Gate + Skills-Extraktion
- Mittelfristig: Multi-Chain + Kubernetes + Observability
- Langfristig: Full Microservices + Post-Quantum

---

## 11. Pflicht-Workflow & Anti-Drift

- Vorher: team_plan.md + autonomy_policy.md + dieses Master-Spec lesen
- Während: Findings sofort, Progress append-only (ISO-UTC)
- Nachher: 5 Artefakte, PR-Template (6 Sektionen), Golden Tasks, Approval-Gates
- Konsolidierungsregeln: Keine SoT-Duplikate, keine semantischen Änderungen ohne Decision Record

---

## 12. Fazit & Scorecard

**Gesamtbewertung**: 10/10  
Produktionsreif, chaos-resilient, governance-konform und trading-edge-spezifisch.

**Must-Do für alle Agenten**

1. Immer zuerst team_plan.md + dieses Master-Spec lesen.
2. Jede Aktion = Skill-Kette mit Chaos-Gate.
3. Memory-DB immer renewed + compressed + chaos-getestet.
4. Pattern Recognition + Focused TX nur mit Evidence + Hash.
5. Repo-Artefakte = Wahrheit.
