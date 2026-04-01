# BobbyExecution Bot

Public readonly bot API, private control plane, and runtime worker entrypoints for the repository.

## Current Behavior

- Ingest -> Signal -> Risk -> Execute -> Verify -> Journal -> Monitor
- Deterministic scoring, pattern recognition, and fail-closed control
- Persistent action logs, journal entries, cycle summaries, incidents, and execution evidence
- Guarded live-test round control with worker visibility snapshots for the dashboard
- Runtime behavior is now controlled through persisted runtime config plus private control endpoints.
- Schema migrations are explicit, versioned, and tracked in `bot/migrations/`.
- Recovery helpers are available for Postgres snapshots, semantic restore validation, disposable restore rehearsals, and worker-disk classification.
- Render-native automatic rehearsal refresh uses a dedicated cron entrypoint and writes fresh evidence into the canonical control database.

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
npm run db:status
npm run db:migrate
npm run recovery:db-backup
npm run recovery:db-restore
npm run recovery:db-validate
npm run recovery:db-rehearse
npm run recovery:db-rehearse:render
npm run recovery:worker-state
npm run build
npm run premerge
npm run start:server
npm run start:control
npm run start:worker
npm run live:preflight
npm run live:test
```

`npm run premerge` is the canonical merge gate and now runs `npm run lint` plus full `npm test`.

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
- `GET /kpi/summary` (includes `metricProvenance` for operator-visible honesty: wired vs derived vs default scalars)
- `GET /kpi/decisions` — prefers **canonical** rows from runtime `recentHistory.recentCycles[].decisionEnvelope` when the worker exposes snapshots; legacy action-log projections fill gaps and are labeled `derived`.
- `GET /kpi/adapters`
- `GET /kpi/metrics`
- Public bot surface is read-only and does not expose runtime replay or incident routes.
- Private control service read surfaces:
  - `GET /control/status`
  - `GET /control/runtime-config`
  - `GET /control/runtime-status`
  - `GET /control/restart-alerts`
- Private control service mutation surfaces:
  - `POST /emergency-stop`
  - `POST /control/pause`
  - `POST /control/resume`
- `POST /control/halt`
- `POST /control/reset`
- `POST /control/mode`
- `POST /control/runtime-config`
- `POST /control/reload`
  - `POST /control/restart-worker`
  - `POST /control/restart-alerts/:id/acknowledge`
  - `POST /control/restart-alerts/:id/resolve`
- `GET /control/history`

## Advisory LLM (non-trading)

- Optional OpenAI/xAI wiring lives under `src/advisory-llm/` and is exported only as `@onchain-trading-bot/core/advisory-llm`.
- It is **not** imported by bootstrap, worker, server, or `src/index.ts` — not part of the deterministic trading hot path.

## Schema And Recovery

- The Postgres repositories no longer create tables on boot. They assert schema readiness and fail closed if the schema is missing, incomplete, or checksum-mismatched.
- `npm run db:status` reports whether the database is ready, migratable, pending migration, or unrecoverable.
- `npm run db:migrate` applies ordered SQL files from `bot/migrations/` and records them in `schema_migrations`.
- `npm run recovery:db-backup`, `npm run recovery:db-restore`, `npm run recovery:db-validate`, and `npm run recovery:db-rehearse` are the supported control-plane backup, restore, and rehearsal entrypoints.
- `npm run recovery:db-validate` is semantic (not count-only) and only reports ready when DB content matches exactly and worker boot-critical state validates (when `--journal-path`/`JOURNAL_PATH` is provided).
- `npm run recovery:worker-state` reports which worker-local files are canonical, reconstructible, or evidence-only, and marks boot-critical files invalid when empty, malformed, or structurally incompatible.
- Governed live promotion into `live_limited` and `live` is blocked if the latest disposable restore rehearsal evidence is missing or stale.

## Operational Notes

- `/kpi/*` expose public bot truth for the dashboard.
- `/control/status` and `/control/runtime-status` expose the worker heartbeat and applied config state through the private control service.
- `POST /emergency-stop` and `POST /control/reset` mutate canonical config state through the private control service.
- `/control/runtime-config` is the first-class runtime behavior control surface for mode, pause, kill switch, filters, thresholds, and reload state on the private control service.
- `/control/restart-worker` is the private, audited orchestration path for restart-required config promotions.
- `/control/restart-alerts` exposes durable restart incidents, severity, acknowledgement state, and recommended operator actions.
- The private control plane can also forward selected restart-alert events to a server-side webhook sink. The browser never receives the webhook URL or token, and notification delivery failures do not change canonical alert state.
- External notification is an escalation bridge, not the source of truth: critical alert openings and escalations notify, repeated failure summaries can notify after cooldown, and a recovery notification is sent when a previously notified alert resolves. Acknowledgements stay local-only. Operators can inspect notification status, last attempt time, failure reason, suppression reason, and recovery-send status through `/control/restart-alerts` and `/control/status`.
- Routing is destination-based, not provider-based: the private control plane can fan out to primary, secondary, and staging webhook destinations with explicit per-destination cooldown and recovery flags. Generic JSON is the transport base, while Slack-compatible formatting is just a payload profile on top of the same webhook transport.
- Notification secrets stay server-side only in the control-plane environment. If a destination is missing or malformed, the control plane records the failure and keeps restart alert state authoritative.
- Read-only delivery reporting lives on the private control plane too: `GET /control/restart-alert-deliveries` returns the filtered delivery journal and `GET /control/restart-alert-deliveries/summary` returns compact destination aggregates. Both are derived from the same durable event history and are meant for troubleshooting, not mutation.
- `GET /control/restart-alert-deliveries/trends` adds a bounded 24h vs 7d trend view on top of the same event history. It surfaces compact per-destination deltas, current health hints, and trend hints so operators can spot flapping, worsening, or inactive destinations without reading the full journal. It is read-only and non-authoritative.
- Trend rows can be drilled into a bookmarkable journal slice through the dashboard URL. Selecting a destination writes the bounded drilldown state into the query string, widening to 7d updates the URL deterministically, and clearing drilldown removes the destination/window markers while keeping any broader safe journal filters. Malformed URL state is normalized safely, and all reads continue to go through the dashboard server-side proxy.
- When bounded journal or drilldown state is active, the dashboard also exposes a `Copy drilldown URL` action. It copies the current normalized dashboard URL only, so the shared link stays read-only and cannot expose private-control secrets or endpoints. Clipboard failures degrade safely and the browser can still use the address bar if needed.
- If the control token is missing, the protected routes fail closed.
- If a schema migration is missing or mismatched, the service does not pretend to be healthy. Operators must migrate or restore before boot.

## Related Docs

- [`../README.md`](../README.md)
- [`../docs/bobbyexecution/README.md`](../docs/bobbyexecution/README.md)
- [`../RENDER_DEPLOYMENT.md`](../RENDER_DEPLOYMENT.md)
