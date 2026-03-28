# Live Test Runbook

Use this for a controlled live-test session. The runtime is fail-closed; if prerequisites are missing, startup refuses.

## Preflight

- Run `cd bot && npm run premerge`
- Run `cd bot && npm run build`
- Run `cd bot && npm run db:status`
- Run `cd bot && npm run db:migrate` if the database is not ready
- Run `cd bot && npm run recovery:db-validate -- --input=<known-good-snapshot.json>` when you are changing a target database or rehearsal environment
- Check `/control/status` or `/control/runtime-status` and confirm the latest `databaseRehearsal` record is fresh before governed live promotion
- Run `cd bot && npm run recovery:db-rehearse:render` if the automatic Render cron is stale or failed; use `cd bot && npm run recovery:db-rehearse -- --source-database-url=<canonical-db> --target-database-url=<scratch-db> --source-context=production --target-context=disposable-rehearsal` only as a manual fallback
- Run `cd bot && npm run live:preflight`
- Set `LIVE_TRADING=true`, `DRY_RUN=false`, `RPC_MODE=real`, `TRADING_ENABLED=true`, `LIVE_TEST_MODE=true`
- Set `WALLET_ADDRESS` and `CONTROL_TOKEN`
- Keep `JOURNAL_PATH` on worker persistent storage

## Start Sequence

1. Start the service with `cd bot && npm run live:test`.
2. Confirm the entry logs show live-test mode and `rpcMode=real`.
3. Confirm the runtime transitions through `preflighted` to `running`.
4. Verify `GET /health`, `GET /kpi/summary`, and `GET /control/status`.
5. Verify `GET /kpi/adapters` and `GET /kpi/metrics` before any trade attempt.
6. If the worker disk was recreated, run `npm run recovery:worker-state -- --journal-path=$JOURNAL_PATH` before resuming.
7. If governed live promotion is blocked because rehearsal evidence is missing or stale, rerun the Render rehearsal refresh or the manual fallback and wait for the evidence record to become fresh again.

## What To Watch

- `roundStatus`
- `roundStartedAt`
- `roundStoppedAt`
- `roundCompletedAt`
- `stopReason`
- `failureReason`
- `blocked`
- `disarmed`
- `stopped`
- `killSwitchActive`
- `posture`
- `rolloutPosture`

Useful read surfaces:

- `GET /kpi/summary`
- `GET /kpi/decisions`
- `GET /kpi/adapters`
- `GET /kpi/metrics`
- `GET /control/status`
- `GET /control/runtime-config`
- `GET /control/history`
- `GET /control/runtime-status`

## Stop And Reset

- `POST /emergency-stop` immediately halts the runtime and triggers the kill switch.
- `POST /control/reset` clears the kill switch and returns the round to a safe preflighted state.
- `POST /control/halt` stops the runtime loop when you want a terminal stop without an emergency path.

## Post-Run Review

1. Review `/control/history` for the attempt.
2. Review the worker visibility snapshot for heartbeat and applied-version state.
3. Review `/kpi/decisions` and `/kpi/summary` for blocked or allowed transitions.
4. Capture any unexpected quote, verification, or adapter behavior before the next run.
5. If the session changed durable control-plane state, capture a Postgres backup before the next promotion or restart.
