# Action-Handbook

<!-- Version: 1.0.0 | Owner: Kimi Swarm | Layer: operations | Last Updated: 2026-03-04 -->

## Loop-Verhalten

Nach Phase 7 (Focused TX Execute) erfolgt der Loop zurück zu Phase 1 (Research) via:

1. Action-Handbook Lookup
2. Nächster IntentSpec (falls Batch)
3. Oder Warte auf Renewal-Interval (45–60 s)

## Skill-Lookup

Skills werden über `packages/skills/*/manifest.json` registriert. Der Orchestrator lädt Skills dynamisch anhand von Phase-Mapping:

- research → intelligence.research
- analyse → intelligence.analyse
- reasoning → intelligence.reasoning + reasoning.pattern_recognizer
- compress_db → memory.compress_db
- chaos_gate → governance.chaos_memory_db_test
- memory_log → memory.log_append
- focused_tx → trading.focused_tx_execute
- loop → governance.action_handbook_lookup

## Error Handling

- **Fail-Closed**: Bei Vault unreachable, Chaos-Fail, DataQuality <70 % → sofortiger Stop
- **Chaos Kategorie 5 Fail**: Abort + Escalation an Reviewer_Claude
- **Recovery**: Memory-DB.recoverLast() für Crash-Recovery

## Recovery-Prozeduren

1. **Crash**: Memory-DB.recoverLast() aufrufen, letzten Snapshot rekonstruieren
2. **Vault-Failure**: Kein Fallback – Fail-Closed, manuelle Escalation
3. **Chaos-Fail**: PR blockiert, Reviewer muss genehmigen
