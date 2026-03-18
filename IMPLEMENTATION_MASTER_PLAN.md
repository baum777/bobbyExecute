# BobbyExecute — Master Implementation Plan

## 1. Zielbild

BobbyExecute soll als **governance-first, fail-closed, deterministische Solana-Trading-Runtime** in `bot/` so geschlossen werden, dass der Ablauf belastbar ist:

```text
Bootstrap → Runtime Start → Ingest → Normalize → Score → Signal → Risk → Chaos → Execute → Verify → Journal → Monitor
```

Der Zielzustand ist erst erreicht, wenn die Runtime:

- **truthfully testable** ist
- **paper runtime operationally controllable** ist
- **paper soak capable** ist
- **final hardening gates** bestanden hat
- **controlled live micro-test ready** ist

---

## 2. Aktueller strukturierter Ausgangspunkt

### Bereits geschlossen / stark verbessert
- Runtime-Truth über Snapshot-/Status-Surfaces
- explizite Dry/Paper/Live-Semantik
- adapter-orchestrator-backed paper ingest
- durable per-cycle runtime summaries
- Control Plane deutlich erweitert
- Incident-Handling minimal, aber reviewbar
- `/health` und `/kpi/summary` näher an echter Runtime-Wahrheit
- Tests für wichtige Truthfulness-/Control-/Paper-Runtime-Pfade

### Noch offen / must-have vor echtem Teststart
- Bootstrap-Paper-Dependencies vollständig verdrahten
- echter End-to-End Paper Integration Test
- Operator Read Surfaces konsolidieren
- Incident/Health/KPI Parität unter Fehler-/Kill-Switch-Pfaden
- Adapter Hardening für längere Soak-Läufe
- Replay-/Persistence-Vollständigkeit
- Auth/Policy für Control-Routen vor Pre-Live
- reale Live-Verifikationskontinuität vor Micro-Live

---

## 3. Run Path in 4 Stufen

### Stufe A — Testable Closure
Ziel:
- Runtime startet valide
- Paper Runtime kann technisch einen echten Cycle durchlaufen
- Truthfulness der Runtime-Surfaces ist gegeben
- kritische Artefakte sind reviewbar

Enthält:
- Phase 0–6

### Stufe B — Paper Soak Readiness
Ziel:
- längere Paper-Läufe sicher und reviewbar
- Degraded States, Incidents und Recovery sauber sichtbar
- Replay-/Persistence-Spur ausreichend

Enthält:
- Phase 7–9

### Stufe C — Pre-Live Hardening
Ziel:
- operative und sicherheitstechnische Barrieren vor Live
- keine synthetischen Pfade im Live-Bereich
- Control-, Policy- und Verification-Gates final

Enthält:
- Phase 10

### Stufe D — Controlled Live Micro-Test
Ziel:
- kleinster echter Live-Test mit harten Limits
- nur nach bestandener Paper-Soak-Freigabe und Final Hardening

Enthält:
- Phase 11

---

## 4. Verbindliche Prinzipien

### Fail-Closed
Wenn Zustand, Daten, Authority oder Persistenz nicht tragfähig sind:
- **kein permissiver Durchlauf**
- **keine implizite Success-Semantik**

### Truthful Surfaces
Alle Runtime-/Server-/KPI-/Health-Surfaces müssen:
- echte Runtime-State abbilden
- keine synthetische Erfolgsmeldung liefern
- Unterschiede zwischen dry/paper/live explizit machen

### Durable Reviewability
Kritische Laufartefakte dürfen nicht nur im RAM leben:
- cycle summaries
- incidents
- execution / verification outcomes
- block reasons

### Minimal Safe Change
Jeder Slice soll:
- reviewbar bleiben
- bestehende Architektur bewahren
- keinen Redesign-Drift erzeugen

---

## 5. Arbeitsmodus für Implementierung

### Pro Slice
1. Review
2. kleinste sichere Änderung
3. Tests ergänzen
4. targeted validate
5. premerge
6. merge
7. nächster Slice

### Verboten
- Parallel-Runtimes
- permissive Workarounds
- Live-Claims ohne reale Grundlage
- „grün machen“ durch Testabschwächung
- große kosmetische Umbauten

---

## 6. Definitionen

### Testable
- Boot + Runtime + API + Journal + Paper-Cycle sind technisch und fachlich beweisbar
- zentrale Fail-Closed-Pfade sind getestet
- Status- und Incident-Surfaces sind wahrheitsgemäß

### Paper Ready
- echte Adapter- und Wallet-Dependencies verdrahtet
- Paper-Cycles laufen deterministisch
- block/success/error-Zyklen sind reviewbar
- Operator kann Laufzustand lesen und kontrollieren

### Production Done
- alle Pre-Live-Hardening-Gates bestanden
- Auth/Policy vor Control-Routen
- Live-Verification lückenlos
- Audit-/Persistence-/Control-/Incident-Pfade vollständig
- Final Review bestanden
