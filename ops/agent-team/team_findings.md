<!--
  Version: 1.1.0
  Owner: Kimi Swarm
  Layer: operations
  Last Updated: 2026-03-04T07:41:04Z
  DoD: Discoveries mit ISO-UTC, Owner, Impact, Action
-->

# team_findings.md

## Struktur: ISO-UTC | Owner | Impact | Action

---

## F-001

| Feld | Wert |
|------|------|
| **ISO-UTC** | 2026-03-04T12:00:00Z |
| **Owner** | Kimi Swarm |
| **Impact** | Foundation |
| **Action** | Implementierung gestartet |

**Discovery**: Existierende Engine in `bot/src/core/engine.ts` mit 7 Stufen (Ingest → Signal → Risk → Execute → Verify → Journal → Monitor). Contracts (Signal, MarketSnapshot, TradeIntent) und Determinism (hash, canonicalize) vorhanden. Keine `docs/`, `ops/`, `packages/skills/` Struktur – vollständiger Bootstrap erforderlich.

---

## F-002

| Feld | Wert |
|------|------|
| **ISO-UTC** | 2026-03-04T14:00:00Z |
| **Owner** | Kimi Swarm |
| **Impact** | Implementation |
| **Action** | Skills-Implementierung abgeschlossen |

**Discovery**: Compression verwendet zlib (gzip) statt Snappy – Snappy kann bei Bedarf nachgerüstet werden. Spezifikation erlaubt Kompatibilität.

---

## F-003

| Feld | Wert |
|------|------|
| **ISO-UTC** | 2026-03-04T17:05:00Z |
| **Owner** | Kimi Swarm |
| **Impact** | Phase 0 Bootstrap |
| **Action** | Schemas via Zod validiert, MCI/BCI-Formeln geprüft |

**Discovery**: Pflicht-Blueprints `pattern-recognition-chaos-memory-blueprint.md`, `secrets-management-blueprint.md`, `extended-intelligence-execution-pipeline.md` fehlen im Repo. Master-Spec dient als Single Source of Truth. JSON-Schema-Validierung erfolgt über Zod-Schemas in `bot/src/core/contracts/`; alle 24 Golden-Task-Tests bestanden. MCI/BCI/Hybrid: AGE_DECAY=0.01, DOUBLE_PENALTY_THRESHOLD=0.3, Hybrid mciWeight=0.6/bciWeight=0.4 – konform mit Master-Spec.

---

## F-004

| Feld | Wert |
|------|------|
| **ISO-UTC** | 2026-03-04T07:41:04Z |
| **Owner** | Kimi Swarm |
| **Impact** | Architecture |
| **Action** | Fehlende SoT-Blueprints ergänzt |

**Discovery**: Die drei referenzierten Blueprint-Dokumente wurden an den geforderten Pfaden ergänzt (`docs/architecture/pattern-recognition-chaos-memory-blueprint.md`, `docs/architecture/extended-intelligence-execution-pipeline.md`, `docs/operations/secrets-management-blueprint.md`), um SoT-Drift zu schließen.

---

## F-005

| Feld | Wert |
|------|------|
| **ISO-UTC** | 2026-03-04T07:41:04Z |
| **Owner** | Kimi Swarm |
| **Impact** | Runtime Safety |
| **Action** | Decision-/Vault-Gates im Orchestrator gehärtet |

**Discovery**: `DecisionResult` enthält jetzt explizit `decision: allow|deny`; Focused TX läuft nur bei `decision=allow`, validiertem Vault-Lease (TTL 1..3600s) und optionalem Review-Gate. Zusätzlich wurde der Loop-Hook `governance.action_handbook_lookup` integriert.

---

## F-006

| Feld | Wert |
|------|------|
| **ISO-UTC** | 2026-03-04T07:41:04Z |
| **Owner** | Kimi Swarm |
| **Impact** | Quality Gate |
| **Action** | Snappy + Chaos Pre-Merge/CI-Gate aktiviert |

**Discovery**: Memory-Kompression wurde von gzip auf Snappy (`snappyjs`) umgestellt. Pre-Merge-Gate (`npm run premerge`) und CI-Workflow (`.github/workflows/chaos-premerge-gate.yml`) erzwingen Lint + Golden Tasks + Chaos-Suite (inkl. Kategorie 5/GT-018).
