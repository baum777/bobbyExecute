# BobbyExecute — Phasen 0 bis 11

## Phase 0 — Baseline stabilisieren
**Ziel:** saubere Ausgangsbasis

### Tasks
- `bot/` als einzige autoritative Runtime festziehen
- Merge-Stand konsolidieren
- Node/CI auf Repo-Zielversion angleichen
- SoT/Audit/Runtime-Drift kurz prüfen

### DoD
- ein klarer Codepfad
- keine Mehrdeutigkeit zwischen `bot/` und `dor-bot/`
- reproduzierbare lokale und CI-Umgebung

---

## Phase 1 — Paper Runtime verdrahten
**Ziel:** Paper Mode mit echten Dependencies lauffähig machen

### Tasks
- Adapterliste in Bootstrap verdrahten
- Wallet-Snapshot-Provider injizieren
- Paper Runtime mit Runtime-Config starten
- Fail-closed bei fehlenden Dependencies beibehalten

### DoD
- Paper Boot startet mit echten Runtime-Dependencies
- fehlende Dependencies blocken sauber und explizit
- kein synthetischer Happy Path mehr im Bootstrap

---

## Phase 2 — End-to-End Paper Flow absichern
**Ziel:** kompletter Paper-Cycle technisch und fachlich geschlossen

### Tasks
- ingest → score → signal → risk → chaos → paper execute → paper verify
- blocked/error/success-Zyklen konsistent modellieren
- Journal/API/Runtime-Snapshot auf denselben Cycle synchronisieren

### DoD
- echter Paper Happy Path
- echter blocked Path
- echter error Path
- Artefakte und Runtime-State konsistent

---

## Phase 3 — Control Plane final härten
**Ziel:** sichere operative Steuerung

### Tasks
- `pause`, `resume`, `halt`, `emergency-stop` final schließen
- unsupported transitions explizit failen
- Kill-Switch und Runtime-State synchron halten
- gestoppte Runtime darf keine normalen Cycles weiterfahren

### DoD
- Control-Aktionen wirken wirklich auf Runtime
- Statuswechsel sind in Runtime/API sichtbar
- Tests decken Fail-/Unsupported-Fälle ab

---

## Phase 4 — Incident Handling schließen
**Ziel:** reviewbare Fehler- und Stop-Zustände

### Tasks
- Incident-Modell finalisieren
- emergency stop, pause/halt, ingest blocked, cycle error, journal failure erfassen
- Incident-Sicht für Operatoren verfügbar machen

### DoD
- kritische Events sind durabel/reviewbar
- Incident-Retrieval funktioniert
- Incidents stimmen mit Runtime-State überein

---

## Phase 5 — Operator Read Surfaces schließen
**Ziel:** kleine, echte Operator-Lesesichten

### Tasks
- recent cycle summaries Endpoint stabilisieren
- recent incidents Endpoint stabilisieren
- runtime status Endpoint/Surface finalisieren
- Limits fail-safe halten

### DoD
- Operator kann letzte Zyklen lesen
- Operator kann Incidents lesen
- Operator sieht klaren Laufzustand

---

## Phase 6 — Paper Integration Test
**Ziel:** bootstrapped Paper Runtime vollständig beweisen

### Tasks
- Integrationstest mit mock adapters + wallet + persistence bauen
- `/health`, `/kpi/summary`, cycle summaries, incidents gegen denselben Lauf prüfen
- blocked / success / error im Integrationstest abdecken

### DoD
- ein echter bootstrapped paper integration test grün
- API und Persistenz stimmen mit Runtime überein

---

## Phase 7 — Adapter Hardening für Soak-Test
**Ziel:** längere Paper-Läufe stabilisieren

### Tasks
- retry / timeout / fallback weiter härten
- adapter health und degraded state sauber sichtbar machen
- multi-cycle Fehler-/Recovery-Verhalten testen

### DoD
- transient errors führen nicht zu irreführendem Success
- stale/all-fail bleiben fail-closed
- degraded state ist nachvollziehbar

---

## Phase 8 — Persistence / Replay vervollständigen
**Ziel:** saubere Nachvollziehbarkeit längerer Läufe

### Tasks
- cycle summaries und incidents als Replay-Spur festziehen
- fehlende mandatory runtime artifacts identifizieren
- sicherstellen, dass kritische Evidenz nicht nur im RAM lebt

### DoD
- Replay eines Paper-Laufs fachlich möglich
- Review aller kritischen Zyklen möglich

---

## Phase 9 — Paper Soak Readiness
**Ziel:** mehrtägiger Paper-Test ist vertretbar

### Tasks
- wiederholte blocked cycles / repeated errors / pause-resume / recovery testen
- Operator-Runbook mit echten Surfaces synchronisieren
- mini readiness review nach soak-vorbereitendem Testlauf

### DoD
- mehrtägiger Paper-Lauf ist operativ vertretbar
- bekannte Failure-/Recovery-Pfade sind geübt/getestet

---

## Phase 10 — Pre-Live Hardening
**Ziel:** alles schließen, was vor Live zwingend notwendig ist

### Tasks
- Auth/Policy vor Control-Routen
- reale RPC-Verifikationskontinuität
- Live-Execution-Gates final
- durable Audit-Trails für live-kritische Stufen
- sicherstellen, dass keine Paper-/Stub-Pfade in Live gelangen

### DoD
- Live-Vorbereitung fachlich und technisch belastbar
- keine synthetische Live-Semantik
- Security- und Control-Gates aktiv

---

## Phase 11 — Controlled Live Micro-Test
**Ziel:** kleinster echter Live-Test mit harten Limits

### Tasks
- separate Testwallet
- Micro-Capital und harte Limits
- Kill-Switch, Incident Review, Post-Trade Verification final prüfen
- nur nach bestandenem Paper Soak starten

### DoD
- kontrollierter Live-Micro-Test möglich
- sofort stoppbar
- vollständig reviewbar
