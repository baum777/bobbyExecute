# Codex Implementation Runbook

## 1. Arbeitsmodus
Codex arbeitet pro Slice:

1. Review
2. kleinste sichere Änderung
3. Tests ergänzen
4. targeted validate
5. premerge
6. strukturierte Summary
7. PR

---

## 2. Prompt-Muster pro Slice
Jeder Slice-Prompt soll enthalten:

- Ziel des Slices
- in-scope / out-of-scope
- Source-of-Truth-Priorität
- konkrete Files to inspect first
- minimum fix targets
- required test scenarios
- hard prohibitions
- final output format

---

## 3. Empfohlene PR-Reihenfolge
- Phase 1
- Phase 2
- Phase 3
- Phase 4
- Phase 5
- Phase 6
- Phase 7
- Phase 8
- Phase 9
- Phase 10
- Phase 11

Jede Phase:
- eigener PR
- eigener Review
- neuer Chat / neuer Agent-Run

---

## 4. Standard-Final-Output von Codex
Codex soll immer zurückgeben:

1. Review findings
2. Files changed
3. Behavior implemented
4. Tests added or updated
5. Commands run
6. Remaining gaps
7. Recommended next slice

---

## 5. Abbruch-Regel
Wenn ein Slice auf einen größeren strukturellen Blocker läuft:

- nicht improvisieren
- kein Redesign starten
- kleinste Blocker-Zusammenfassung liefern
- nächsten sicheren Slice empfehlen

---

## 6. Pflichtregeln für Codex
- keine synthetischen Success-Claims
- keine stillen Workarounds
- keine zweite Runtime
- keine Aktivierung von `dor-bot/`
- keine Live-Claims ohne reale Grundlage
- keine Test-Abschwächung zur künstlichen Grünfärbung

---

## 7. Check vor Merge
- [ ] Scope eingehalten
- [ ] Tests grün
- [ ] premerge grün
- [ ] Remaining gaps dokumentiert
- [ ] nächster Slice empfohlen
