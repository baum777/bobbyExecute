# Live Test Runbook

Use this for a controlled live-test session. The runtime is fail-closed; if prerequisites are missing, startup refuses.

## Preflight

- Run `cd bot && npm run premerge`
- Run `cd bot && npm run build`
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

## Stop And Reset

- `POST /emergency-stop` immediately halts the runtime and triggers the kill switch.
- `POST /control/reset` clears the kill switch and returns the round to a safe preflighted state.
- `POST /control/halt` stops the runtime loop when you want a terminal stop without an emergency path.

## Post-Run Review

1. Review `/control/history` for the attempt.
2. Review the worker visibility snapshot for heartbeat and applied-version state.
3. Review `/kpi/decisions` and `/kpi/summary` for blocked or allowed transitions.
4. Capture any unexpected quote, verification, or adapter behavior before the next run.
