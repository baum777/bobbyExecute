# Checks, DoD, Review und Testing

## 1. Global Merge Gate
Ein Slice darf erst gemerged werden, wenn:

- Scope eingehalten wurde
- keine Architekturdrift eingeführt wurde
- neue kritische Pfade Tests haben
- keine falschen Success-Claims eingebaut wurden
- Summary + Remaining Gaps sauber dokumentiert wurden

---

## 2. Slice-Checkliste
Vor jedem Merge:

- [ ] Source-of-Truth-Dateien geprüft
- [ ] kleinste sichere Änderung umgesetzt
- [ ] neue/angepasste Tests vorhanden
- [ ] targeted tests grün
- [ ] `premerge` grün
- [ ] keine synthetischen Statusflächen eingeführt
- [ ] Summary of Remaining Gaps erstellt

---

## 3. Definition of Done pro Slice
Ein Slice ist fertig, wenn:

- sein fachliches Ziel geschlossen ist
- seine Runtime-Auswirkungen sichtbar und testbar sind
- fehlende Restpunkte explizit dokumentiert sind
- er die nächste Phase nicht erschwert

---

## 4. Pflicht-Testarten

### Unit
- typed result semantics
- fail-closed Pfade
- transition handling
- unsupported actions

### Runtime / Integration
- boot + runtime + API parity
- cycle success / blocked / error
- control plane Wirkung
- incident and summary persistence

### Config
- invalid combinations reject startup
- mode-specific invariants

### Server
- `/health`, `/kpi/summary`, operator surfaces grounded in runtime
- explicit unsupported responses when runtime dependencies are unwired

### Premerge
- lint
- compile / test
- focused integration slices
- repo-defined premerge command

---

## 5. Review-Fragen pro PR
Vor Merge explizit beantworten:

1. Was war die höchste Truthfulness-/Safety-Lücke?
2. Welche kleinste sichere Änderung wurde gemacht?
3. Welche Tests beweisen den Claim?
4. Was bleibt offen?
5. Blockiert dieser PR einen späteren Slice oder erleichtert er ihn?

---

## 6. Pflicht-Assertions je Zielzustand

### Für Testable
- Runtime startet valide
- Paper Runtime kann echten Cycle durchlaufen
- blocked/success/error-Zyklen sind sichtbar
- cycle summaries und incidents sind reviewbar
- control surfaces sind wahrheitsgemäß

### Für Paper Ready
- echte Adapter- und Wallet-Dependencies verdrahtet
- operator read surfaces stabil
- integration test grün
- runtime/API/persistence parity vorhanden

### Für Production Done
- auth/policy vor controls
- live verification real
- live gates aktiv
- keine stub/synthetic leakage
- audit trail vollständig

---

## 7. Anti-Patterns
Nicht akzeptieren:

- Success ohne echte Runtime-Wirkung
- stilles Weiterlaufen nach kritischem Journal-Fehler
- Tests, die nur Mocks bestätigen, aber keinen Lauf beweisen
- permissive Fallbacks bei stale/all-fail
- neue, parallele Status- oder Incident-Systeme

---

## 8. Final Review Checklist
Vor „production done“:

- [ ] alle Phasen abgeschlossen
- [ ] Paper Soak bestanden
- [ ] Pre-Live Hardening bestanden
- [ ] Control/Auth/Policy geschlossen
- [ ] Live Verification geschlossen
- [ ] Final Audit / Re-Review dokumentiert
