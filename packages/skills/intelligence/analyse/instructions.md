# intelligence.analyse

<!-- Version: 1.0.0 | Owner: Kimi Swarm | Layer: intelligence | Last Updated: 2026-03-04 | DoD: Skill Instructions vollständig -->

## Input

- **SignalPack**: Aggregierte Signale aus Research
- **DataQuality**: completeness, freshness, sourceReliability

## Output

- **ScoreCard**: MCI/BCI/Hybrid Scores (age-adjusted, double-penalty protected)

## Formeln

- MCI (Market Confidence Index): age-adjusted, double-penalty bei Inkonsistenz
- BCI (Behavioral Confidence Index): Sentiment-Struktur-Alignment
- Hybrid: Gewichtete Kombination MCI + BCI
- **cross_source_confidence_score** ≥ 85 % erforderlich

## Side Effects

Keine. Deterministische Berechnung.

## Guardrails

- Fail-Closed bei DataQuality < 70 % completeness
- Kein ToolRouter-Bypass
