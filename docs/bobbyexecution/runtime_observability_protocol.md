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
- `POST /control/restart-worker`
- `GET /control/restart-alerts`
- `POST /control/restart-alerts/:id/acknowledge`
- `POST /control/restart-alerts/:id/resolve`

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
- restart-required state, restart request status, and convergence outcome
- open restart alerts, severity, acknowledgement state, and recommended action

## Persistence Expectations

The current runtime writes:

- action logs
- journal entries
- runtime cycle summaries
- incidents
- execution evidence

These records are the bot truth, not in-memory placeholders.

The worker-local runtime files stay on the worker disk. Public and control services consume the summarized worker visibility snapshot from Postgres instead of reading those files directly.

Restart-required config changes are considered pending until the private control plane sees a restart request, the worker restarts, and the worker publishes a converged applied version that matches the requested version. A request being sent is not success on its own.

Restart alerts open when convergence stalls or fails. `acknowledge` records that an operator is investigating the incident, while `resolve` is only accepted when the underlying condition is no longer active or the governing workflow explicitly allows manual closure. Automatic resolution happens when the worker heartbeat and applied version evidence show the restart has converged.

Critical restart alerts may also emit a server-side notification through the private control plane. The notification bridge is advisory only: alert persistence happens first, delivery is rate-limited, and delivery failures are recorded without changing the canonical restart state. Operators should inspect `/control/restart-alerts` and `/control/status` if an alert remains open after a notification attempt.

## Alert Triggers

Alert when:

- circuit breaker is open
- chaos critical scenario fails
- RPC verification fails
- data quality drops below threshold
- repeated execution errors exceed threshold
