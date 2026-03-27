# Production Readiness Checklist

Use this before any controlled live-test or any rollout beyond paper mode.

## Implemented In Current Code

- [x] Deterministic ingest -> signal -> risk -> execute -> verify -> journal -> monitor pipeline
- [x] Persistent action log, journal, runtime cycle summaries, incidents, and execution evidence
- [x] Runtime truth surfaces: `/health`, `/kpi/*`, `/control/status`, `/control/runtime-config`, `/control/history`
- [x] Live-control and kill-switch state with pause, resume, halt, reset, and emergency stop
- [x] Adapter circuit breaker, freshness checks, and fail-closed config validation
- [x] Real quote and live swap path guarded by RPC verification and live prerequisites

## Verify Before Controlled Live-Test

- [ ] `cd bot && npm run premerge`
- [ ] `cd bot && npm run build`
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
- [ ] `POST /emergency-stop` and `POST /control/reset` behave as documented
- [ ] the dashboard reflects the same runtime truth as the bot
- [ ] dry or paper rehearsal has been reviewed in the journal and worker visibility snapshot

## No-Go Conditions

- live config validation fails
- any live prerequisite is missing
- control token is absent
- runtime status is `error` or adapter health is degraded for live
- quote or verification handling falls back silently
- kill switch is active and not reset
- uncontrolled live trading is being attempted

Controlled live-test only. Uncontrolled live trading remains out of scope.
