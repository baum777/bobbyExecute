# dotBot / BobbyExecute

Governance-first Trading-Bot-Repository mit deterministischer Ausführung, Memory-Hash-Chains und Chaos-Gates.

## Kontext

Dieses Repo bündelt zwei Welten:

- **`bot/`**: aktive TypeScript-Implementierung (Core Runtime, Governance, Tests).
- **`dor-bot/`**: ältere Python-Referenz/Legacy-Komponenten.

Die kanonischen Architektur- und Governance-Vorgaben liegen in:

- `docs/architecture/master-trading-bot-intelligence-spec.md`
- `docs/architecture/pattern-recognition-chaos-memory-blueprint.md`
- `docs/architecture/extended-intelligence-execution-pipeline.md`
- `docs/operations/secrets-management-blueprint.md`
- `ops/agent-team/*` (Plan, Findings, Progress, Decisions, Policy)

## Architektur-Überblick

### 1) Klassische Runtime-Pipeline (`Engine`)

```text
Ingest → Signal → Risk → Execute → Verify → Journal → Monitor
```

Ziel: deterministische Trade-Verarbeitung mit Fail-Closed bei Risk-/Verify-Fehlern.

### 2) Erweiterte Intelligence-/Execution-Pipeline (`Orchestrator`)

```text
Research → Analyse (MCI/BCI/Hybrid) → Reasoning + Pattern
→ Compress DB (Snappy + SHA-256) → Chaos Gate (19 Szenarien)
→ Memory Log (Hash-Chain) → Focused TX Execute
→ Loop via Action Handbook Lookup
```

Wichtige Leitplanken:

- `DecisionResult.decision = allow|deny`
- TX nur bei `allow` + gültigem Vault-Lease (TTL <= 1h)
- Fail-Closed bei DataQuality < 70 %, Chaos-Fail oder Vault-Problemen

## Zentrale Komponenten

- **Governance:** Review Gates, Policy Engine, Guardrails, Circuit Breaker
- **Determinismus:** Canonicalize + SHA-256 für Decision/Result/Journal
- **Memory:** iterative Renewal, Snappy-Kompression, Crash-Recovery
- **Chaos:** 19 Szenarien in 5 Kategorien (Kategorie 5 = Trading-Edge kritisch)
- **Tests:** Golden Tasks GT-001 bis GT-018 + Chaos Pre-Merge Gate

## Repository-Struktur

- `bot/` – produktive TS-Codebasis inkl. `npm run premerge`
- `docs/` – Architektur-/Operations-Blueprints
- `ops/agent-team/` – Governance- und Team-Artefakte
- `packages/skills/` – Skill-Manifeste + Instructions
- `dor-bot/` – Python-Legacy

## Cloud-Agent Umgebung (Cursor)

Die Cloud-Umgebung ist repo-seitig vorbereitet über:

- `.cursor/environment.json`
- `.cursor/setup.sh`
- `.nvmrc` (Root + `bot/.nvmrc`)

Setup-Verhalten:

1. Node **22** prüfen (nvm-Fallback, falls verfügbar)
2. `bot`-Dependencies installieren (`npm install`)
3. `snappyjs` + `@types/snappyjs` validieren

Dadurch läuft im Agent standardmäßig ohne manuelle Vorarbeit:

```bash
cd bot
npm run premerge
```

## Lokale Entwicklung

```bash
cd bot
npm install
npm run lint
npm test
npm run premerge
```

## Lizenz

Siehe `LICENSE`.
