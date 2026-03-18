<!--
  Version: 1.1.0
  Owner: Kimi Swarm
  Layer: operations
  Last Updated: 2026-03-04T07:41:44Z
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

---

### DR-003: Snappy als Standard für Memory-Compression

**Datum**: 2026-03-04  
**Status**: Accepted

**Kontext**: Bisherige Implementierung nutzte gzip als Platzhalter; Master-Spec fordert Snappy + SHA-256 Chain.

**Entscheidung**: Umstellung von gzip auf `snappyjs` in `bot/src/memory/memory-db.ts`. Hash-Chain (SHA-256 auf canonicalized payload) bleibt unverändert.

**Begründung**: Spezifikationskonformität und deterministischer, schneller Kompressionspfad.

---

### DR-004: Focused TX nur bei Decision=allow + gültigem Vault-Lease

**Datum**: 2026-03-04  
**Status**: Accepted

**Kontext**: Pipeline-Regel verlangt TX-Ausführung nur bei expliziter Freigabe und gültiger Secret-Lease.

**Entscheidung**: `DecisionResult` erweitert um `decision: allow|deny`; `Orchestrator.run()` führt `focused_tx` nur bei `decision=allow`, optional freigegebenem Review-Gate und validiertem Lease (TTL 1..3600s, optional expiresAt in Zukunft) aus.

**Begründung**: Governance-first Ausführung, weniger Side-Effect-Risiko, klare Fail-Closed Semantik.

---

### DR-005: Chaos-Pre-Merge- und CI-Gate verpflichtend

**Datum**: 2026-03-04  
**Status**: Accepted (Approval Pending)

**Kontext**: Phase 3 verlangt Chaos-Suite als Pre-Merge/CI-Gate inkl. Kategorie 5.

**Entscheidung**: Neuer Pre-Merge-Command `npm run premerge` (lint + golden + chaos), separater Chaos-Test `tests/chaos/chaos-gate.test.ts`, CI-Workflow `.github/workflows/chaos-premerge-gate.yml`.

**Begründung**: Frühe Gate-Durchsetzung vor Merge, reproduzierbarer Qualitätsnachweis.

---

### DR-006: Paper-Bootstrap verdrahtet Runtime-Dependencies vor Runtime-Start

**Datum**: 2026-03-18
**Status**: Accepted

**Kontext**: Der Paper-Modus lief im Bootstrap bisher ohne echte Paper-Dependencies an und blockierte sofort mit `PAPER_INGEST_BLOCKED`. Phase 1 fordert verdrahtete Adapterliste, Wallet-Snapshot-Injektion und fail-closed Verhalten bei fehlenden Dependencies.

**Entscheidung**: `bootstrap()` erzeugt nun im Paper-Modus verdrahtete Runtime-Dependencies für Markt-Adapter und Wallet-Snapshot-Provider. Wenn Tests eigene `runtimeDeps` injizieren, wird dafür ein passender Circuit Breaker aus den injizierten Adapter-IDs aufgebaut. Fehlt `WALLET_ADDRESS`, schlägt der Paper-Start explizit fehl.

**Begründung**: Schließt die kleinste sichere Phase-1-Lücke ohne Architekturdrift, entfernt den synthetischen Happy/Blocked-Startpfad und hält den Runtime-Start fail-closed.
