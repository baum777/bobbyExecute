# ReducedMode V1 Failure-Resilient Cross-DEX Engine Specification

## Scope

ReducedMode V1 liefert eine deterministische Analyse-Pipeline (ohne Trade-Execution), die Solana-Token aus mehreren DEX-Quellen zusammenführt, validiert, strukturell bewertet, Risiken berechnet und transparente Reports erzeugt.

Pflichtquellen:

- DexScreener
- DexPaprika

Optionale Stubs:

- Moralis
- RPC Verify

## Operating Rules

1. Contracts first: alle Ein-/Ausgaben werden über Zod-Contracts validiert.
2. Fail-Closed nach Recovery Attempts:
   - Retry
   - Alternate Endpoint
   - Cache Fallback
   - Fail-Closed
3. Keine spekulativen Features außerhalb von V1.
4. Deterministische Ausgaben:
   - stabile Schlüsselstruktur
   - stabile Sortierung
   - variable Felder nur `run_id` und Zeitstempel
5. Keine externen Schlüssel für Baseline notwendig.

## Pipeline Phasen 1–9

### Phase 1 — Universe Builder

- Kandidaten aus DexScreener + DexPaprika laden
- Ziel: ~25 je Quelle, Pre-Dedupe Zielpool ~60
- Contract-Address auflösen, fehlende CA ausschließen
- Dedup nach Contract Address
- Soft 50/50 Balance:
  - strikt anwenden
  - wenn Coverage zu stark sinkt: Ratio lockern
- Mindestuniversum erzwingen, sonst Fail-Closed nach Recovery Attempts

### Phase 2 — Normalization & Quality

- Snapshots pro Token zusammenführen
- relative Delta und Diskrepanzen berechnen
- Data Completeness Score
- Cross-Source Confidence Score
- Discrepancy Rate

### Phase 3 — Structural Metrics

- Log-Normalisierung für Liquidity/Volume
- v2l ratio berechnen
- Structural Score clamp 0..100
- Regime inferieren:
  - Liquidity Regime: Structural/Healthy/Thin/Fragile
  - Volatility Regime (Proxy)

### Phase 4–5 — Social Intel Lite

- Feature-flagged
- Default disabled
- disabled => `data_status="disabled"`
- enabled und sample < 10 => `data_status="data_insufficient"`

### Phase 6 — Risk Model

- Dynamisches Weight Profile auswählen
- Risk Breakdown berechnen:
  - structural
  - social
  - quality
  - divergence
- Overall Risk Score berechnen
- Flags ableiten (z. B. cross_source_anomaly)

### Phase 7 — Divergence

- Divergenz-Signale berechnen
- bei >= 2 Signalen:
  - Override auf Klassifikation `Fragile Expansion`

### Phase 8 — Ecosystem Classification

- 3 Achsen ausgeben:
  - market_structure
  - narrative_dominance
  - liquidity_regime
- Narrative bei disabled social: mixed/unknown Mapping

### Phase 9 — Output

- Sections A–F vollständig erzeugen
- reasoning_bullets pro Token:
  - exakt 3 Bullet Points
  - jeder Bullet referenziert berechnete Felder
- Rankings:
  - top_structural nach structural_score
  - top_fragile nach overall_risk_score + divergences
- Bei niedriger Completeness:
  - `low_confidence_analysis=true`
  - aggressive Rankings deaktivieren

## Required Contracts

- TokenRefV1
- TokenSourceSnapshotV1
- DataQualityV1
- NormalizedTokenV1
- StructuralMetricsV1
- SocialIntelV1
- DynamicWeightProfileV1
- RiskBreakdownV1
- DivergenceV1
- EcosystemClassV1
- ReducedModeRunV1

## API

- `POST /reducedmode/run`
  - Body: `{ mode?: "live" | "dry", maxTokens?: number }`
  - Response: `ReducedModeRunV1`
- `GET /reducedmode/runs/:runId`
- `GET /reducedmode/health`
  - last run status
  - breaker states
  - p95 latency snapshot

## Worker

- in-memory queue
- cron job (konfigurierbar)
- run artifacts speichern

## Observability

- strukturierte Logs mit `run_id`, `phase`, `token_count`
- Metrics Interface:
  - counters
  - histograms
  - gauges

Adapter-Metriken:

- request counts
- latency
- status labels

Engine-Metriken:

- universe size
- completeness average
- confidence average
- discrepancy rate
- divergence histogram

## Definition of Done

1. `pnpm i && pnpm -r test` erfolgreich
2. `pnpm -r build` erfolgreich
3. API liefert validen `ReducedModeRunV1`
4. Fail-Closed bei unzureichendem Universe
5. Transparenz-Metriken + exakt 3 Reasoning-Bullets pro Token
