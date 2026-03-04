# memory.iterative_renew

<!-- Version: 1.0.0 | Owner: Kimi Swarm | Layer: memory | Last Updated: 2026-03-04 | DoD: Skill Instructions vollständig -->

## Input

- **DataQuality**: completeness, freshness
- **LastRenewalTimestamp**: Letzte Renewal-Zeit

## Output

- **MemorySnapshot**: Aktualisierter Memory-DB State

## Trigger

- Alle 45–60 s
- Oder bei > 4 % DataQuality-Change

## Quellen

- Onchain: Moralis, DexScreener, Paprika
- X-TL: x_keyword_search, x_semantic_search

## Side Effects

- Memory-DB Update
- Renewal-Timestamp Update

## Guardrails

- Fail-Closed bei < 70 % completeness
- cross_source_confidence_score ≥ 85 %
