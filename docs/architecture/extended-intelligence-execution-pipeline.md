<!--
  Version: 1.0.0
  Owner: Kimi Swarm
  Layer: architecture
  Last Updated: 2026-03-04T00:25:00Z
  DoD: 7-Phasen-Pipeline inkl. Contracts, Gates und Loop-Mechanik dokumentiert
-->

# Extended Intelligence Execution Pipeline

## Deterministische 7-Phasen-Kette

1. `intelligence.research`
2. `intelligence.analyse` (MCI/BCI/Hybrid + Cross-Source)
3. `intelligence.reasoning` + `reasoning.pattern_recognizer`
4. `memory.compress_db` (nach `memory.iterative_renew`)
5. `governance.chaos_memory_db_test`
6. `memory.log_append`
7. `trading.focused_tx_execute` (nur mit Decision=allow + Vault-Lease)

Loop: `governance.action_handbook_lookup`

## Contracts

- `IntentSpec`
- `SignalPack`
- `DataQuality`
- `ScoreCard`
- `DecisionResult`

## Analyse-Modelle

- **MCI**: age-adjusted
- **BCI**: quality/sentiment-nah
- **Hybrid**: gewichtete Kombination MCI + BCI
- **Double-Penalty**: bei starker Cross-Source-Varianz

## Fail-Closed Regeln

- DataQuality completeness < 70 % => Stop
- Chaos-Gate Fail => Stop
- Vault nicht erreichbar => Stop

## Execution-Gate

`trading.focused_tx_execute` darf nur laufen, wenn:

- `DecisionResult.decision === "allow"`
- gültiger Vault-Lease (TTL <= 1h)
- Review-Gate akzeptiert (wenn konfiguriert)
