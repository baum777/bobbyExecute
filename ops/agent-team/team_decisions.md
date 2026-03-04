<!--
  Version: 1.0.0
  Owner: Kimi Swarm
  Layer: operations
  Last Updated: 2026-03-04T12:00:00Z
  DoD: Alle DRs mit Begründung
-->

# team_decisions.md

## Decision Records

---

### DR-001: Wiederverwendung existierender Engine-Struktur

**Datum**: 2026-03-04  
**Status**: Accepted

**Kontext**: `bot/src/core/engine.ts` hat bereits eine 7-Stufen-Pipeline (Ingest, Signal, Risk, Execute, Verify, Journal, Monitor).

**Entscheidung**: Engine als Fundament nutzen und um Extended-Pipeline-Phasen (Research, Analyse, Reasoning, Compress-DB, Chaos-Gate, Memory-Log) erweitern. Neuer Orchestrator orchestriert die 7 Master-Spec-Phasen; bestehende Engine-Handler werden wo sinnvoll integriert.

**Begründung**: Konsistenz mit bestehender Codebasis, weniger Refactoring.

---

### DR-002: TypeScript für Skills (Konsistenz mit bot/)

**Datum**: 2026-03-04  
**Status**: Accepted

**Kontext**: bot/ ist TypeScript; dor-bot/ ist Python.

**Entscheidung**: Skills werden als TypeScript/JSON + Markdown definiert (manifest.json + instructions.md). Keine Python-Skill-Implementierungen in packages/skills/ – diese sind deklarativ und werden von bot/ konsumiert.

**Begründung**: Single Language für Core-Logik, bessere Integration mit bestehender Tool-Infrastruktur.
