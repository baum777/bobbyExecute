# Render Deployment Guide

This repo now ships a Render Blueprint at [`render.yaml`](render.yaml).
The Blueprint is the source of truth for the current deployment baseline.

## Stepwise Setup

If you want the shortest implementation path, do this in order:

1. Deploy the background worker as a Render `worker` service.
2. Deploy the public bot API as a Render `web` service.
3. Deploy the private control plane as a Render `pserv` service.
4. Deploy the dashboard as a Render `web` service.
5. Fill the secret env vars in the Render dashboard.

For a single operator-facing deploy lane, follow [`docs/bobbyexecution/operator_deploy_runbook.md`](docs/bobbyexecution/operator_deploy_runbook.md).

## Current Render Topology

The deployed baseline now matches the worker split:

- `bobbyexecute-bot-{staging,production}` is the public readonly bot service
- `bobbyexecute-control-{staging,production}` is the private control plane for authenticated mutations and operator status
- `bobbyexecute-runtime-{staging,production}` is the dedicated runtime background worker
- `bobbyexecute-dashboard-{staging,production}` runs the Next.js dashboard
- `bobbyexecute-postgres-{staging,production}` provides durable config, audit, and worker visibility storage
- `bobbyexecute-postgres-rehearsal-{staging,production}` provides the disposable restore target for automated rehearsal refreshes
- `bobbyexecute-rehearsal-refresh-{staging,production}` runs the Render-native rehearsal refresh cron job
- `bobbyexecute-kv-{staging,production}` provides the fast signal layer for runtime config overlays

The public bot service stays read-only. Mutations live on the private control service, and the dashboard proxies privileged calls through server-side routes instead of calling the control plane directly from the browser.

## Schema And Recovery Discipline

Schema upgrades are explicit and must happen before a new release boots against a target database.

Operator flow:

1. Point the target environment at the intended Postgres instance.
2. Run `cd bot && npm run db:status`.
3. If the status is `missing_but_migratable` or `migration_required`, run `cd bot && npm run db:migrate`.
4. Run `cd bot && npm run recovery:db-rehearse -- --source-database-url=<canonical-db> --target-database-url=<scratch-db> --source-context=production --target-context=disposable-rehearsal` against a disposable target before governed live promotion.
5. Run `cd bot && npm run recovery:db-validate -- --input=<snapshot.json> --journal-path=/var/data/journal.jsonl` against a known-good snapshot or staging clone.
6. Run `cd bot && npm run recovery:worker-state -- --journal-path=/var/data/journal.jsonl` on the worker disk that will boot the release.
7. Deploy the services only after schema, rehearsal evidence, and worker-disk prerequisites are satisfied. Validation is launch-safe only when DB status is `exact_match` and worker `safeBoot=true`.

If `db:status` reports `unrecoverable`, treat the database as needing restore or reconciliation before the release can start.

The disposable rehearsal writes durable evidence back to the canonical control DB. Governed promotion to `live_limited` or `live` is blocked until that evidence is fresh enough for the configured gate.

Render-native automatic refresh path:

1. The cron job `bobbyexecute-rehearsal-refresh-{staging,production}` runs `cd bot && npm run recovery:db-rehearse:render`.
2. It reads from the canonical control Postgres via `SOURCE_DATABASE_URL` and restores into the disposable rehearsal Postgres via `TARGET_DATABASE_URL`.
3. It records evidence back into the canonical control DB using the existing rehearsal evidence model.
4. The promotion gate keeps reading the newest evidence from Postgres; there is no alternate CI source of truth.
5. If the cron job fails, operators rerun the manual rehearsal command before attempting governed promotion.
6. Operators can inspect `/control/status` or `/control/runtime-status` to see the latest evidence status, execution source, and freshness window.

## Build And Start

Bot web service:

- Build: `cd bot && npm ci && npm run build`
- Start: `cd bot && npm run start:server`
- Listen address: `0.0.0.0:$PORT`
- Persistent state: none

Control service:

- Build: `cd bot && npm ci && npm run build`
- Start: `cd bot && npm run start:control`
- Listen address: `0.0.0.0:$PORT`
- Persistent state: no disk required; control state persists in Postgres and Key Value

Runtime worker:

- Build: `cd bot && npm ci && npm run build`
- Start: `cd bot && npm run start:worker`
- Listen address: none, this is a background worker
- Persistent state: mounted at `/var/data`
- Boot-critical worker files stay on that disk, but they are not the canonical source of truth for control-plane state.

Dashboard service:

- Build: `cd dashboard && npm ci && npm run build`
- Start: `cd dashboard && npm run start`
- Public API base: `NEXT_PUBLIC_API_URL` is injected from the bot service's `RENDER_EXTERNAL_URL`
- Privileged control proxy: `CONTROL_SERVICE_HOSTNAME` and `CONTROL_SERVICE_PORT` are injected from the private control service, and `CONTROL_TOKEN` stays server-side only
- Operator auth secrets: `DASHBOARD_SESSION_SECRET` signs dashboard sessions and `DASHBOARD_OPERATOR_DIRECTORY_JSON` defines the operator directory; both stay server-side only

## Required Environment Variables

The Render Blueprint already defines these values. Grouped here for implementation clarity:

Shared bot/runtime config:

- `NODE_ENV=production`
- `HOST=0.0.0.0` for the public web service
- `RUNTIME_CONFIG_ENV=staging|production`
- `LIVE_TRADING=false`
- `DRY_RUN=true`
- `TRADING_ENABLED=false`
- `LIVE_TEST_MODE=false`
- `RPC_MODE=stub`
- `RUNTIME_POLICY_AUTHORITY=ts-env`
- `REVIEW_POLICY_MODE=required`
- `MAX_SLIPPAGE_PERCENT=5`
- `CIRCUIT_BREAKER_FAILURE_THRESHOLD=5`
- `CIRCUIT_BREAKER_RECOVERY_MS=60000`

Public bot web service:

- `DATABASE_URL`
- `DASHBOARD_ORIGIN`

Private control service:

- `CONTROL_TOKEN`
- `CONTROL_RESTARTS_ENABLED=true`
- `CONTROL_RESTART_COOLDOWN_MS=300000`
- `CONTROL_RESTART_CONVERGENCE_TIMEOUT_MS=600000`
- `CONTROL_RESTART_ALERT_NOTIFICATION_COOLDOWN_MS=300000`
- `CONTROL_RESTART_ALERT_WEBHOOK_TIMEOUT_MS=5000`
- `CONTROL_RESTART_ALERT_WEBHOOK_REQUIRED=true`
- `WORKER_SERVICE_NAME`
- `WORKER_DEPLOY_HOOK_URL`
- `CONTROL_RESTART_ALERT_WEBHOOK_URL`
- `CONTROL_RESTART_ALERT_WEBHOOK_TOKEN`
- `DATABASE_URL`
- `REDIS_URL`

Runtime worker:

- `DATABASE_URL`
- `REDIS_URL`
- `JOURNAL_PATH=/var/data/journal.jsonl`
- `WORKER_HEARTBEAT_INTERVAL_MS=5000`

Dashboard service:

- `DASHBOARD_SESSION_SECRET`
- `DASHBOARD_OPERATOR_DIRECTORY_JSON`
- `CONTROL_TOKEN`
- `CONTROL_SERVICE_HOSTNAME`
- `CONTROL_SERVICE_PORT`
- `NEXT_PUBLIC_API_URL`

## Environment Split

The Blueprint defines separate `staging` and `production` environments.
The current repository does not yet have a dedicated staging branch, so both environments are anchored to the repo default branch for now.

Deployment behavior:

- Staging bot and dashboard auto-deploy on commit
- Production dashboard and bot are manually promoted from Render for this baseline

## Boot Configuration

These values remain boot-level configuration and are set in Render env vars:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `RUNTIME_CONFIG_ENV=staging|production`
- `LIVE_TRADING=false`
- `DRY_RUN=true`
- `TRADING_ENABLED=false`
- `LIVE_TEST_MODE=false`
- `RPC_MODE=stub`
- `RUNTIME_POLICY_AUTHORITY=ts-env`
- `REVIEW_POLICY_MODE=required`
- `MAX_SLIPPAGE_PERCENT=5`
- `CIRCUIT_BREAKER_FAILURE_THRESHOLD=5`
- `CIRCUIT_BREAKER_RECOVERY_MS=60000`
- `JOURNAL_PATH=/var/data/journal.jsonl` for the worker only
- `WORKER_HEARTBEAT_INTERVAL_MS=5000` for the worker only

Secret placeholders are created with `sync: false` and must be filled in the Render dashboard:

- `CONTROL_TOKEN`
- `DASHBOARD_SESSION_SECRET`
- `DASHBOARD_OPERATOR_DIRECTORY_JSON`

The public bot service receives:

- `DATABASE_URL` from the Render Postgres instance
- `DASHBOARD_ORIGIN` from the dashboard service's external URL for browser CORS

The private control service receives:

- `CONTROL_TOKEN` as its mutation secret
- `CONTROL_RESTARTS_ENABLED=true` to allow restart orchestration
- `CONTROL_RESTART_COOLDOWN_MS=300000` to rate-limit repeated restart requests
- `CONTROL_RESTART_CONVERGENCE_TIMEOUT_MS=600000` to bound restart convergence waiting
- `CONTROL_RESTART_ALERT_NOTIFICATION_COOLDOWN_MS=300000` to rate-limit alert notifications
- `CONTROL_RESTART_ALERT_WEBHOOK_TIMEOUT_MS=5000` to cap external notification latency
- `CONTROL_RESTART_ALERT_WEBHOOK_REQUIRED=true` so missing webhook config is visible as a failed delivery
- `WORKER_SERVICE_NAME` for the worker target metadata
- `WORKER_DEPLOY_HOOK_URL` as a server-side only deploy hook URL
- `CONTROL_RESTART_ALERT_WEBHOOK_URL` as a server-side only notification endpoint
- `CONTROL_RESTART_ALERT_WEBHOOK_TOKEN` as a server-side only notification secret
- `DATABASE_URL` from the same Render Postgres instance
- `REDIS_URL` from the same Render Key Value instance
- `RUNTIME_CONFIG_ENV` to keep the runtime namespace aligned with the worker

The runtime worker receives:

- `DATABASE_URL` from the same Render Postgres instance
- `REDIS_URL` from the same Render Key Value instance
- `JOURNAL_PATH=/var/data/journal.jsonl`
- `WORKER_HEARTBEAT_INTERVAL_MS` if you want to tune snapshot cadence

The dashboard server receives:

- `DASHBOARD_SESSION_SECRET` to sign operator sessions
- `DASHBOARD_OPERATOR_DIRECTORY_JSON` to define the operator directory
- `CONTROL_TOKEN` as a server-only secret for the control proxy
- `CONTROL_SERVICE_HOSTNAME` and `CONTROL_SERVICE_PORT` from the private control service
- `NEXT_PUBLIC_API_URL` from the bot service's external URL for read-only browser fetches

Runtime behavior is now controlled through the persisted runtime-config layer rather than by editing those env vars. The boot env values above act as seed defaults and fallback wiring only.

The Key Value instance is a bootstrap resource in this wave.
Before live control-plane state moves onto it, upgrade it to a paid persistent instance.
The bot only emits CORS headers for the dashboard origin injected by the Blueprint, which keeps the browser fetch path explicit instead of globally open.

## Persistent Storage

The runtime worker owns the persistent disk mount.
The worker-local file-backed runtime artifacts stay on that disk and are not assumed to be shared with the public bot or control services. The journal, incident files, cycle summaries, and execution evidence are operational records. The kill-switch, live-control, daily-loss, and idempotency files are boot-critical worker state and must be backed up or restored explicitly if the disk is replaced.

The public bot and private control services read the summarized worker visibility snapshot from Postgres instead of reaching into worker-local files.

## Rollout Notes

1. Deploy staging first.
2. For the bot web service, Render runs the build phase with `npm ci && npm run build`, then starts the server with `npm run start:server`.
3. For the worker, Render runs the same build phase, then starts the background process with `npm run start:worker` and does not expect an HTTP port.
4. Verify the public bot read surfaces: `/health`, `/kpi/summary`, `/kpi/decisions`, `/kpi/adapters`, and `/kpi/metrics`.
5. Verify the control surfaces: `/control/status`, `/control/runtime-config`, `/control/history`, `/control/mode`, `/control/pause`, `/control/resume`, `/control/halt`, `/control/reset`, and `/control/reload`.
6. Verify restart-required changes through `POST /control/restart-worker` and confirm the control status shows worker heartbeat, last applied version, reload nonce, and restart convergence state.
7. If convergence stalls or fails, inspect `GET /control/restart-alerts` and acknowledge or resolve the alert from the dashboard or private control service.
8. Confirm the dashboard proxy routes are using the private control service, not the public bot service.
9. Promote the same commit to production only after staging is healthy.
10. Treat `LIVE_TRADING`, `DRY_RUN`, `TRADING_ENABLED`, `LIVE_TEST_MODE`, `MAX_SLIPPAGE_PERCENT`, and the circuit breaker env values as boot-seed defaults only; runtime changes now go through the control API.

## Current Gap

The remaining operational gap is restart orchestration configuration and dashboard operator secret provisioning:

- the control service needs the Render deploy hook URL for the runtime worker
- the worker service name must match the target metadata used by restart requests
- restart-required promotions stay pending until a worker restart is requested and the worker converges on the requested version
- stalled or failed convergence now raises a durable restart alert, so operators do not need to inspect raw tables to notice the failure
- the dashboard still needs a real session secret and operator directory payload in each Render environment before operator login and privileged control actions are usable

Those inputs are server-side only and should be added before enabling restart promotion in production. The external notification bridge uses the same control-service secret boundary; the browser never sees the webhook URL or token.
