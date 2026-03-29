# Production Readiness Checklist

Use this before any controlled live-test or any rollout beyond paper mode.

## Implemented In Current Code

- [x] Deterministic ingest -> signal -> risk -> execute -> verify -> journal -> monitor pipeline
- [x] Persistent action log, journal, runtime cycle summaries, incidents, and execution evidence
- [x] Runtime truth surfaces: `/health`, `/kpi/*`, `/control/status`, `/control/runtime-config`, `/control/history`
- [x] Live-control and kill-switch state with pause, resume, halt, reset, and emergency stop
- [x] Adapter circuit breaker, freshness checks, and fail-closed config validation
- [x] Real quote and live swap path guarded by RPC verification and live prerequisites
- [x] Versioned SQL migration runner with explicit schema readiness checks
- [x] Postgres backup / restore helpers for control-plane state
- [x] Disposable restore rehearsal runner with durable evidence capture
- [x] Render-native automatic rehearsal refresh cron with disposable target Postgres
- [x] Rehearsal freshness status, alert persistence, and operator visibility for fresh / warning / stale / failed states
- [x] Worker disk classification helper for boot-critical vs evidence-only state

## Verify Before Controlled Live-Test

- [ ] `cd bot && npm run premerge` (lint + full `npm test`)
- [ ] `cd bot && npm run build`
- [ ] `cd bot && npm run db:status`
- [ ] `cd bot && npm run db:migrate` if the status is not `ready`
- [ ] `cd bot && npm run recovery:db-validate -- --input=<known-good-snapshot.json> --journal-path=/var/data/journal.jsonl` reports `status=ready` with DB `exact_match`
- [ ] `cd bot && npm run recovery:db-rehearse:render` has succeeded recently, or `cd bot && npm run recovery:db-rehearse -- --source-database-url=<canonical-db> --target-database-url=<scratch-db> --source-context=production --target-context=disposable-rehearsal` has been run manually as fallback
- [ ] `cd bot && npm run recovery:worker-state -- --journal-path=/var/data/journal.jsonl`
- [ ] `cd bot && npm run live:preflight`
- [ ] `LIVE_TRADING=true`
- [ ] `DRY_RUN=false`
- [ ] `RPC_MODE=real`
- [ ] `TRADING_ENABLED=true`
- [ ] `LIVE_TEST_MODE=true`
- [ ] `WALLET_ADDRESS` is set
- [ ] `CONTROL_TOKEN` is set
- [ ] `JOURNAL_PATH` points to worker persistent storage
- [ ] `GET /health`, `/kpi/summary`, `/kpi/decisions`, `/kpi/adapters`, and `/kpi/metrics` are healthy on the public bot service
- [ ] `GET /control/status`, `/control/runtime-config`, and `/control/history` are healthy on the private control service
- [ ] `/control/status` or `/control/runtime-status` shows `databaseRehearsal.status=fresh`, `warning`, `stale`, or `failed` as appropriate, plus the latest success/failure timestamps and evidence source you expect
- [ ] dashboard operator auth is configured with `DASHBOARD_SESSION_SECRET` and `DASHBOARD_OPERATOR_DIRECTORY_JSON`
- [ ] dashboard login returns a signed session cookie for at least one admin operator and the control proxy forwards the resulting identity
- [ ] If `databaseRehearsal.status=warning`, check the open freshness alert reason, notification delivery state, and automation health before promotion
- [ ] If `databaseRehearsal.status=stale` or `failed`, do not promote until the Render rehearsal refresh or manual fallback has written fresh evidence to Postgres and the operator-facing freshness alert has recovered or been understood
- [ ] `POST /emergency-stop` and `POST /control/reset` behave as documented
- [ ] the dashboard reflects the same runtime truth as the bot
- [ ] dry or paper rehearsal has been reviewed in the journal and worker visibility snapshot

## No-Go Conditions

- live config validation fails
- schema migration status is `missing_but_migratable`, `migration_required`, or `unrecoverable`
- dashboard operator auth is unconfigured
- rehearsal evidence is missing or stale for the governed promotion target
- `recovery:db-validate` is not `ready` (including `content_mismatch` or unverified/invalid worker boot-critical state)
- the Render rehearsal cron is failing and no fresh evidence has been written
- rehearsal freshness is `warning` and the open alert indicates automation has not recovered
- any live prerequisite is missing
- control token is absent
- runtime status is `error` or adapter health is degraded for live
- quote or verification handling falls back silently
- kill switch is active and not reset
- uncontrolled live trading is being attempted

Controlled live-test only. Uncontrolled live trading remains out of scope.
