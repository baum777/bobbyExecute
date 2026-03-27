# dotBot / BobbyExecute

Governance-first Solana trading bot with deterministic execution, append-only journaling, and guarded live-test control surfaces.

## Current State

- `bot/` contains the public readonly API, private control plane, and dedicated runtime worker entrypoints.
- Dry and paper are the normal local modes.
- Live-test support is guarded, bounded, and operator-visible.
- Runtime behavior is governed by persisted runtime config and a private control service, not by changing env vars.
- The repository does not claim uncontrolled live trading readiness.

## Canonical Docs

- [`render.yaml`](render.yaml)
- [`governance/SoT.md`](governance/SoT.md)
- [`docs/bobbyexecution/README.md`](docs/bobbyexecution/README.md)
- [`bot/README.md`](bot/README.md)
- [`RENDER_DEPLOYMENT.md`](RENDER_DEPLOYMENT.md)
- [`docs/bobbyexecution/production_readiness_checklist.md`](docs/bobbyexecution/production_readiness_checklist.md)
- [`docs/bobbyexecution/live_test_runbook.md`](docs/bobbyexecution/live_test_runbook.md)
- [`docs/bobbyexecution/incident_and_killswitch_runbook.md`](docs/bobbyexecution/incident_and_killswitch_runbook.md)
- [`docs/bobbyexecution/trading_execution_protocol.md`](docs/bobbyexecution/trading_execution_protocol.md)
- [`docs/bobbyexecution/market_data_reliability_protocol.md`](docs/bobbyexecution/market_data_reliability_protocol.md)
- [`docs/bobbyexecution/risk_and_chaos_governance.md`](docs/bobbyexecution/risk_and_chaos_governance.md)
- [`docs/bobbyexecution/runtime_observability_protocol.md`](docs/bobbyexecution/runtime_observability_protocol.md)
- [`docs/architecture/master-trading-bot-intelligence-spec.md`](docs/architecture/master-trading-bot-intelligence-spec.md)
- [`docs/trading/trading-edge_chaos-scenarios.md`](docs/trading/trading-edge_chaos-scenarios.md)

## Fast Start

1. Copy [`.env.example`](.env.example) to `.env` in the repo root.
2. Keep the safe defaults for local work:

   ```bash
   LIVE_TRADING=false
   DRY_RUN=true
   RPC_MODE=stub
   TRADING_ENABLED=false
   ```

3. Install dependencies:

   ```bash
   cd bot
   npm install
   ```

4. Run the offline gate:

   ```bash
   npm run premerge
   ```

5. Build the runtime:

   ```bash
   npm run build
   ```

6. Start the API server:

   ```bash
   npm run start:server
   ```

7. Check `GET /health` and `GET /kpi/summary` on the public bot service.
8. Use the private control service or the dashboard proxy routes for control-path testing, and read worker status through `GET /control/status`.

## Runtime Surfaces

- `GET /health`
- `GET /kpi/summary`
- `GET /kpi/decisions`
- `GET /kpi/adapters`
- `GET /kpi/metrics`
- Public bot surface is read-only for mutations and no longer exposes runtime replay or incident routes.
- Private control service read surfaces:
  - `GET /control/status`
  - `GET /control/runtime-config`
  - `GET /control/runtime-status`
  - `GET /control/restart-alerts`
- Privileged mutations now live on the private control service:
  - `POST /emergency-stop`
  - `POST /control/pause`
  - `POST /control/resume`
  - `POST /control/halt`
  - `POST /control/reset`
  - `POST /control/mode`
  - `POST /control/kill-switch`
  - `POST /control/runtime-config`
  - `POST /control/reload`
  - `POST /control/restart-worker`
  - `POST /control/restart-alerts/:id/acknowledge`
  - `POST /control/restart-alerts/:id/resolve`
- `GET /control/history`

The dashboard now calls the private control service through server-side proxy routes. Control routes require `x-control-token` or `Authorization: Bearer <token>` on the control service. Missing tokens fail closed with `403`.

Restart-required config changes can now open durable restart alerts when worker convergence stalls or fails. Operators acknowledge an alert to record investigation, and resolve it only when the underlying condition has cleared or an explicit governed manual resolution is justified.

Selected restart alerts can also notify an external server-side webhook through the private control plane. The webhook URL and token live only in Render service env vars on the control service, and notification delivery is rate-limited so repeated alert polling does not spam operators. Canonical alert state remains the Postgres source of truth even when notification delivery fails.

Notification policy is intentionally narrow: critical alert openings, critical escalations, repeated-failure summaries, and recovery notifications after a previously notified alert resolves can leave the control plane. Warning-only alerts stay local by default, acknowledgements remain local-only, and the webhook sink is deduped per alert/event/sink with a cooldown window so retries and poll loops do not spam downstream receivers. The payload is compact and structured: environment, worker target, severity, reason code, summary, restart request id, requested/applied versions, worker heartbeat age, recommended action, and an operator path hint.

## Repo Layout

```text
/
├─ governance/   canonical governance layer
├─ docs/         operational and architecture docs
├─ bot/          active TypeScript runtime
├─ ops/          team artifacts and internal process docs
├─ packages/     skill manifests and instructions
└─ dor-bot/      legacy Python reference tree
```
