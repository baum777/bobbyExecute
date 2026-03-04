# intelligence.research

<!-- Version: 1.0.0 | Owner: Kimi Swarm | Layer: intelligence | Last Updated: 2026-03-04 | DoD: Skill Instructions vollständig -->

## Input

- **IntentSpec**: Handelsabsicht, Ziel-Pairs, Constraints
- **DataQuality**: Aktueller completeness/freshness-State

## Output

- **SignalPack**: Aggregierte Signale aus Quellen (Moralis, DexScreener, Paprika, X-TL)

## Quellen

- Onchain: Moralis, DexScreener, DexPaprika
- X-TL: x_keyword_search, x_semantic_search

## Side Effects

Keine. Read-only Aggregation.

## Guardrails

- Kein ToolRouter-Bypass
- 100 % Audit-Logging
- Clock-only für Timestamps
