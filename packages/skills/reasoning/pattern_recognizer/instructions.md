# reasoning.pattern_recognizer v1.1

<!-- Version: 1.1.0 | Owner: Kimi Swarm | Layer: reasoning | Last Updated: 2026-03-04 | DoD: 8 Patterns definiert -->

## Input

- **ScoreCard**: MCI/BCI/Hybrid Scores
- **SignalPack**: Aggregierte Signale

## Output

```json
{
  "patterns": ["pattern_id", "..."],
  "flags": ["flag_id", "..."],
  "confidence": 0.0-1.0,
  "evidence": [{ "id": "...", "hash": "sha256..." }]
}
```

## 8 feste Patterns (deterministisch)

1. **Velocity-Liquidity-Divergence**: Geschwindigkeit vs. Liquidität weichen ab
2. **Bundle/Sybil-Cluster**: Erkennung von Bundle-/Sybil-Clustern
3. **Narrative-Shift**: Schneller Narrativwechsel
4. **Smart-Money-Fakeout**: Fakeout durch Smart Money
5. **Early-Pump-Risk**: Frühes Pump-Risiko
6. **Sentiment-Structural-Mismatch**: Sentiment vs. Struktur passen nicht
7. **Cross-Source-Anomaly**: Anomalie über Quellen hinweg
8. **Fragile-Expansion**: Fragile Expansion/Liquidität

## Side Effects

Keine. Deterministisch auf ScoreCard + SignalPack.

## Guardrails

- Evidence mit Hash für jede Erkennung
- Kein ToolRouter-Bypass
