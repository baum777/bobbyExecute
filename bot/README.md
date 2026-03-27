# BobbyExecution Bot

Public readonly bot API, private control plane, and runtime worker entrypoints for the repository.

## Current Behavior

- Ingest -> Signal -> Risk -> Execute -> Verify -> Journal -> Monitor
- Deterministic scoring, pattern recognition, and fail-closed control
- Persistent action logs, journal entries, cycle summaries, incidents, and execution evidence
- Guarded live-test round control with worker visibility snapshots for the dashboard
- Runtime behavior is now controlled through persisted runtime config plus private control endpoints.

## Commands

Run from `bot/`:

```bash
npm install
npm run lint
npm test
npm run test:golden
npm run test:chaos
npm run test:integration
npm run test:e2e
npm run test:config
npm run build
npm run premerge
npm run start:server
npm run start:control
npm run start:worker
npm run live:preflight
npm run live:test
```

## Config and Authority

- Environment variables remain boot-only: secrets, database/KV URLs, service wiring, host/port, and hard defaults.
- Runtime behavior moves through `GET/POST /control/runtime-config`, `GET /control/status`, and related private control routes.
- `RUNTIME_POLICY_AUTHORITY=ts-env` is still the current boot-time authority gate.
- `src/config/agents.yaml`, `src/config/guardrails.yaml`, and `src/config/permissions.yaml` are reference policy files, not runtime authority.
- Safe local defaults remain:

  ```bash
  LIVE_TRADING=false
  DRY_RUN=true
  RPC_MODE=stub
  TRADING_ENABLED=false
  ```

- `PORT` defaults to `3333` and `HOST` defaults to `0.0.0.0`.
- Controlled live-test mode still requires the boot prerequisites above, but operator mutations now happen through the control API instead of env edits.

## Runtime Surfaces

- `GET /health`
- `GET /kpi/summary`
- `GET /kpi/decisions`
- `GET /kpi/adapters`
- `GET /kpi/metrics`
- Public bot surface is read-only and does not expose runtime replay or incident routes.
- `GET /control/status`
- `GET /control/runtime-config`
- `GET /control/runtime-status`
- Private control service mutation surfaces:
  - `POST /emergency-stop`
  - `POST /control/pause`
  - `POST /control/resume`
  - `POST /control/halt`
  - `POST /control/reset`
  - `POST /control/mode`
  - `POST /control/kill-switch`
  - `POST /control/runtime-config`
  - `POST /control/reload`
- `GET /control/history`

## Operational Notes

- `/kpi/*` expose public bot truth for the dashboard.
- `/control/status` and `/control/runtime-status` expose the worker heartbeat and applied config state through the private control service.
- `POST /emergency-stop` and `POST /control/reset` mutate canonical config state through the private control service.
- `/control/runtime-config` is the first-class runtime behavior control surface for mode, pause, kill switch, filters, thresholds, and reload state on the private control service.
- If the control token is missing, the protected routes fail closed.

## Related Docs

- [`../README.md`](../README.md)
- [`../docs/bobbyexecution/README.md`](../docs/bobbyexecution/README.md)
- [`../RENDER_DEPLOYMENT.md`](../RENDER_DEPLOYMENT.md)
