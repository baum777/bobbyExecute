# ReducedMode V1 Specification

## Overview

ReducedMode V1 is a failure-resilient Cross-DEX analysis engine that aggregates token data from multiple decentralized exchange data providers (DexScreener, DexPaprika), normalizes and cross-validates the data, computes structural and risk metrics, detects divergences, and produces a comprehensive analysis artifact.

## Design Principles

- **Fail-Closed**: When data quality is insufficient or the token universe cannot be built, the engine refuses to produce results rather than producing unreliable output.
- **Deterministic Output**: Stable JSON structure; only `run_id` and timestamps vary between runs with identical inputs.
- **Contracts First**: Zod schemas define canonical contracts; all inputs/outputs are validated.
- **No Speculative Features**: V1 does not execute trades; it produces analysis artifacts only.

## Architecture

### 9-Phase Pipeline

```
Phase 1: Universe Builder     -> Fetch, resolve, dedupe token candidates
Phase 2: Normalization         -> Merge sources, compute data quality
Phase 3: Structural Metrics    -> Log normalization, regime inference
Phase 4: Social Collection     -> Feature-flagged, disabled by default
Phase 5: Social Scoring        -> Feature-flagged, disabled by default
Phase 6: Risk Model            -> Dynamic weights, risk decomposition
Phase 7: Divergence Detection  -> Cross-source divergence signals
Phase 8: Ecosystem Classify    -> Market structure, narrative, liquidity
Phase 9: Output Builder        -> Report, rankings, transparency metrics
```

### Failure Recovery Chain

```
Retry with backoff -> Alternate endpoint -> Cache fallback -> Fail-closed
```

## Configuration

| Parameter | Default | Description |
|---|---|---|
| MAX_UNIQUE_TOKENS | 30 | Maximum tokens in final universe |
| MIN_UNIQUE_TOKENS | 20 | Minimum tokens required (fail-closed below) |
| TRENDING_RATIO_TARGET | 0.5 | Target ratio of trending vs volume tokens |
| VOLUME_RATIO_TARGET | 0.5 | Target ratio of volume vs trending tokens |
| DISCREPANCY_THRESHOLD | 0.20 | Relative delta threshold for discrepancy flagging |
| MIN_DATA_COMPLETENESS | 70 | Minimum completeness % for confident analysis |
| MAX_RECOVERY_ATTEMPTS | 3 | Maximum retry attempts per source |

## Data Sources

| Source | Status | Endpoints |
|---|---|---|
| DexScreener | Required | Trending pairs, pair details |
| DexPaprika | Required | Trending tokens, top volume, token details |
| Moralis | Optional (stub) | Feature-flagged, disabled by default |
| RPC Verify | Optional (stub) | Mint verification, disabled by default |

## Output Schema

The output is a `ReducedModeRunV1` object containing:

- **run_id**: Unique identifier
- **config**: Engine configuration used
- **universe**: Universe build statistics
- **tokens[]**: Per-token analysis (normalized, structural, social, risk, divergence, reasoning)
- **ecosystem**: Aggregate classification
- **transparency**: Data quality metrics
- **rankings**: top_structural, top_fragile
- **low_confidence**: Boolean flag when quality is below threshold
- **notes**: Human-readable notes about the run

### Reasoning Bullets

Each token has exactly 3 reasoning bullets that reference computed fields:
1. Structural metrics (score, regime, v2l ratio)
2. Risk decomposition (score, flags, weight profile)
3. Data quality (completeness, confidence, divergence count)

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | /reducedmode/run | Execute a new analysis run |
| GET | /reducedmode/runs/:runId | Retrieve a completed run |
| GET | /reducedmode/health | Health check with breaker states |

## Operational Notes

- No external API keys required for baseline operation (social/moralis/rpc are optional stubs)
- Engine validates output against Zod schema before returning
- All timestamps are ISO 8601
- Rankings are sorted: top_structural descending by structural_score, top_fragile descending by risk_score
