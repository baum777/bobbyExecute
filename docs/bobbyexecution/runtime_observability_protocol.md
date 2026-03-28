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
- `GET /control/runtime-status`
- `POST /control/restart-worker`
- `GET /control/restart-alerts`
- `GET /control/restart-alert-deliveries`
- `GET /control/restart-alert-deliveries/summary`
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
- filtered delivery journal rows and compact per-destination delivery summaries
- database rehearsal freshness status with last success / failure timestamps
- open rehearsal freshness alerts, severity, blocked-by-freshness state, and the latest evidence source
- automation health that distinguishes healthy automation from manual fallback or repeated failed refreshes

## Persistence Expectations

The current runtime writes:

- action logs
- journal entries
- runtime cycle summaries
- incidents
- execution evidence

These records are the bot truth, not in-memory placeholders.

Schema readiness is separate from runtime health. The supported operator view is `cd bot && npm run db:status`; the supported upgrade path is `cd bot && npm run db:migrate`. The migration table `schema_migrations` is the source of truth for which SQL files have been applied.

The worker-local runtime files stay on the worker disk. Public and control services consume the summarized worker visibility snapshot from Postgres instead of reading those files directly.

Worker disk classification is explicit:

- boot-critical canonical state: kill switch, live control, daily loss, idempotency
- reconstructible or evidence-only state: journal, actions, runtime cycle summaries, incidents, execution evidence

If boot-critical worker state is missing, the worker must fail closed rather than inventing a healthy state.

Restart-required config changes are considered pending until the private control plane sees a restart request, the worker restarts, and the worker publishes a converged applied version that matches the requested version. A request being sent is not success on its own.

Restart alerts open when convergence stalls or fails. `acknowledge` records that an operator is investigating the incident, while `resolve` is only accepted when the underlying condition is no longer active or the governing workflow explicitly allows manual closure. Automatic resolution happens when the worker heartbeat and applied version evidence show the restart has converged.

Critical restart alerts may also emit a server-side notification through the private control plane. The notification bridge is advisory only: alert persistence happens first, delivery is rate-limited, and delivery failures are recorded without changing the canonical restart state. Operators should inspect `/control/restart-alerts` and `/control/status` if an alert remains open after a notification attempt.

Database rehearsal freshness uses the same pattern: durable Postgres evidence is authoritative, the control surface derives `fresh` / `warning` / `stale` / `failed` / `unknown`, and an open freshness alert is the visible operator signal when the latest automation or evidence cadence is no longer healthy. A manual fallback rehearsal can satisfy freshness temporarily, but the control surface should still show degraded automation health until the Render-native path recovers.
Freshness notifications are advisory only. `warning` remains local-only, `stale` and repeated automated failures may fan out externally, and recovery notifications are only emitted after a previously notified degradation resolves. Notification delivery state is visible in the same control/status payload so operators can tell whether a freshness alert was sent, suppressed, failed, or recovered.

The delivery payload is intentionally small and stable. It includes the environment, worker target, severity, reason code, summary, restart request id, requested and applied version ids when known, worker heartbeat age or timestamp when available, the recommended operator action, and a path hint for the control surface. Recovery notifications are emitted only after a previously notified alert resolves, so the bridge stays an escalation path rather than a parallel restart authority.

The bridge can fan out by destination. Routing is configured on the private control service, with explicit destination names, cooldown windows, recovery flags, and formatter profiles. Generic JSON is the transport base; Slack-compatible payloads are a presentation profile layered on top of the same webhook transport. Destination-level status, suppression, and failure reasons are visible in the restart alert event history, but no external provider response is treated as restart truth.

To verify the sink in staging, point `NOTIFY_WEBHOOK_STAGING_URL` at a test webhook, trigger a restart alert, and confirm the destination row on `/control/restart-alerts` shows `sent` or `suppressed` with the expected route reason. If the destination is misconfigured, the alert remains open and the failure is recorded instead of being hidden.

For destination troubleshooting, use the read-only reporting views on the private control plane. `GET /control/restart-alert-deliveries` returns the newest-first delivery journal with filters for environment, destination, status, event type, severity, alert id, restart request id, formatter profile, and time window. `GET /control/restart-alert-deliveries/summary` returns compact per-destination aggregates with sent, failed, suppressed, and skipped counts plus a derived health hint:

- `healthy` means recent successful sends and no recent failures
- `degraded` means recent successes and failures mixed together
- `failing` means repeated recent failures without success
- `idle` means no meaningful recent activity or only suppressed/skipped traffic
- `unknown` is the fallback when the counts do not map cleanly

Suppressed events remain first-class rows in the journal, so operators can distinguish policy skips from cooldown suppression and provider failures. These reporting views are read-only and are derived from the durable restart-alert event history; they never mutate canonical alert state.

## Alert Triggers

Alert when:

- circuit breaker is open
- chaos critical scenario fails
- RPC verification fails
- data quality drops below threshold
- repeated execution errors exceed threshold
- database rehearsal evidence is missing
- database rehearsal freshness is warning, stale, or failed
- repeated automated rehearsal failures exceed threshold
