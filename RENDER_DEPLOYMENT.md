# Render Deployment Guide

This repo now ships a Render Blueprint at [`render.yaml`](render.yaml).
The Blueprint is the source of truth for the current deployment baseline.

## Current Render Topology

The deployed baseline now matches the worker split:

- `bobbyexecute-bot-{staging,production}` is the public readonly bot service
- `bobbyexecute-control-{staging,production}` is the private control plane for authenticated mutations and operator status
- `bobbyexecute-runtime-{staging,production}` is the dedicated runtime background worker
- `bobbyexecute-dashboard-{staging,production}` runs the Next.js dashboard
- `bobbyexecute-postgres-{staging,production}` provides durable config, audit, and worker visibility storage
- `bobbyexecute-kv-{staging,production}` provides the fast signal layer for runtime config overlays

The public bot service stays read-only. Mutations live on the private control service, and the dashboard proxies privileged calls through server-side routes instead of calling the control plane directly from the browser.

## Build And Start

Bot service:

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

Dashboard service:

- Build: `cd dashboard && npm ci && npm run build`
- Start: `cd dashboard && npm run start`
- Public API base: `NEXT_PUBLIC_API_URL` is injected from the bot service's `RENDER_EXTERNAL_URL`
- Privileged control proxy: `CONTROL_SERVICE_HOSTNAME` and `CONTROL_SERVICE_PORT` are injected from the private control service, and `CONTROL_TOKEN` stays server-side only

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

The public bot service receives:

- `DATABASE_URL` from the Render Postgres instance
- `DASHBOARD_ORIGIN` from the dashboard service's external URL for browser CORS

The private control service receives:

- `CONTROL_TOKEN` as its mutation secret
- `CONTROL_RESTARTS_ENABLED=true` to allow restart orchestration
- `CONTROL_RESTART_COOLDOWN_MS=300000` to rate-limit repeated restart requests
- `CONTROL_RESTART_CONVERGENCE_TIMEOUT_MS=600000` to bound restart convergence waiting
- `WORKER_SERVICE_NAME` for the worker target metadata
- `WORKER_DEPLOY_HOOK_URL` as a server-side only deploy hook URL
- `DATABASE_URL` from the same Render Postgres instance
- `REDIS_URL` from the same Render Key Value instance
- `RUNTIME_CONFIG_ENV` to keep the runtime namespace aligned with the worker

The runtime worker receives:

- `DATABASE_URL` from the same Render Postgres instance
- `REDIS_URL` from the same Render Key Value instance
- `JOURNAL_PATH=/var/data/journal.jsonl`
- `WORKER_HEARTBEAT_INTERVAL_MS` if you want to tune snapshot cadence

The dashboard server receives:

- `CONTROL_TOKEN` as a server-only secret for the control proxy
- `CONTROL_SERVICE_HOSTNAME` and `CONTROL_SERVICE_PORT` from the private control service
- `NEXT_PUBLIC_API_URL` from the bot service's external URL for read-only browser fetches

Runtime behavior is now controlled through the persisted runtime-config layer rather than by editing those env vars. The boot env values above act as seed defaults and fallback wiring only.

The Key Value instance is a bootstrap resource in this wave.
Before live control-plane state moves onto it, upgrade it to a paid persistent instance.
The bot only emits CORS headers for the dashboard origin injected by the Blueprint, which keeps the browser fetch path explicit instead of globally open.

## Persistent Storage

The runtime worker owns the persistent disk mount.
The worker-local file-backed runtime artifacts stay on that disk and are not assumed to be shared with the public bot or control services. That includes the journal, incident files, cycle summaries, idempotency state, kill switch state, and live-control state.

The public bot and private control services read the summarized worker visibility snapshot from Postgres instead of reaching into worker-local files.

## Rollout Notes

1. Deploy staging first.
2. Verify the public bot read surfaces: `/health`, `/kpi/summary`, `/kpi/decisions`, `/kpi/adapters`, and `/kpi/metrics`.
3. Verify the control surfaces: `/control/status`, `/control/runtime-config`, `/control/history`, `/control/mode`, `/control/pause`, `/control/resume`, `/control/kill-switch`, `/control/runtime-config`, and `/control/reload`.
4. Verify restart-required changes through `POST /control/restart-worker` and confirm the control status shows worker heartbeat, last applied version, reload nonce, and restart convergence state.
5. If convergence stalls or fails, inspect `GET /control/restart-alerts` and acknowledge or resolve the alert from the dashboard or private control service.
6. Confirm the dashboard proxy routes are using the private control service, not the public bot service.
7. Promote the same commit to production only after staging is healthy.
8. Treat `LIVE_TRADING`, `DRY_RUN`, `TRADING_ENABLED`, `LIVE_TEST_MODE`, `MAX_SLIPPAGE_PERCENT`, and the circuit breaker env values as boot-seed defaults only; runtime changes now go through the control API.

## Current Gap

The remaining operational gap is restart orchestration configuration:

- the control service needs the Render deploy hook URL for the runtime worker
- the worker service name must match the target metadata used by restart requests
- restart-required promotions stay pending until a worker restart is requested and the worker converges on the requested version
- stalled or failed convergence now raises a durable restart alert, so operators do not need to inspect raw tables to notice the failure

Those inputs are server-side only and should be added before enabling restart promotion in production.
