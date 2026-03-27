# Runtime Observability Protocol

This protocol defines the minimum visibility required for BobbyExecution and the dashboard.

## Canonical Truth Layers

### 1. Action and Decision Logs

Persist:

- trade intents
- gate outcomes
- execution attempts
- verification results
- blocked reasons
- emergency-stop actions

### 2. Journal and Replay

Persist:

- append-only journal entries
- hash-chain metadata
- runtime cycle summaries
- incident records
- execution evidence

### 3. Metrics and Health

Track:

- adapter latency
- retry count
- breaker state
- data quality
- chaos pass rate
- blocked trades
- successful confirmations
- failed confirmations

## Correlation

`traceId` is the canonical correlation key across runtime, journal, replay, KPI, and incidents.

Every major event should carry:

- `traceId`
- timestamp
- intent or trade identifier when available
- optional transaction signature

## Dashboard-Facing Surfaces

- `GET /health`
- `GET /kpi/summary`
- `GET /kpi/decisions`
- `GET /kpi/adapters`
- `GET /kpi/metrics`
- `GET /control/status`
- `GET /control/runtime-config`
- `GET /control/history`

## What The Dashboard Should See

- system health
- adapter health
- decision summary
- blocked reason summary
- chaos pass status
- latest execution attempts
- verification outcomes
- kill-switch status
- worker heartbeat
- last applied and requested runtime config versions

## Persistence Expectations

The current runtime writes:

- action logs
- journal entries
- runtime cycle summaries
- incidents
- execution evidence

These records are the bot truth, not in-memory placeholders.

The worker-local runtime files stay on the worker disk. Public and control services consume the summarized worker visibility snapshot from Postgres instead of reading those files directly.

## Alert Triggers

Alert when:

- circuit breaker is open
- chaos critical scenario fails
- RPC verification fails
- data quality drops below threshold
- repeated execution errors exceed threshold
