# Local Run

This repository can run locally without Render when you keep the local safe-boot path fail-closed:

- bot/control/runtime code reads `process.env` directly; there is no dotenv auto-loader for the `bot/` processes.
- `dashboard/.env.local` is auto-loaded by Next and is the authoritative dashboard file for local development.
- `NEXT_PUBLIC_USE_MOCK` only changes the dashboard UI; it does not change bot execution mode.
- when `DATABASE_URL` and `REDIS_URL` are unset, runtime config state is in-memory, but runtime visibility falls back to a shared file-backed local path (`data/runtime-visibility.json` by default, or `RUNTIME_VISIBILITY_PATH` if set).
- the dashboard can talk to the local control service through `CONTROL_SERVICE_URL`.
- for the standard local dashboard read path, use a distinct `OPERATOR_READ_TOKEN` in the control/server bot shells and `dashboard/.env.local`; leave it blank only if you intentionally want the dashboard read proxy disconnected.
- the signer is optional for safe boot and required only for live-limited readiness.

## Canonical Local Modes

### Mode A. Local Dry-Run Safe Boot

Use this mode to bring up the real local services with no live execution:

- `LIVE_TRADING=false`
- `DRY_RUN=true`
- `TRADING_ENABLED=false`
- `LIVE_TEST_MODE=false`
- `RPC_MODE=stub`
- `SIGNER_MODE=disabled`
- `MORALIS_ENABLED=false`
- `NEXT_PUBLIC_USE_MOCK=false`
- `OPERATOR_READ_TOKEN=` (blank in paper-safe mode; the dashboard falls back to `CONTROL_TOKEN`)

This is dry-run, not papertrade. No swap execution is attempted.

The dashboard should point at the local bot API and local control service:

- `NEXT_PUBLIC_API_URL=http://127.0.0.1:3333`
- `CONTROL_SERVICE_URL=http://127.0.0.1:3334`
- `CONTROL_TOKEN=<shared-local-token>`
- `OPERATOR_READ_TOKEN=` (blank; the dashboard falls back to `CONTROL_TOKEN` for GET/HEAD)

Leave these unset for the safe-boot path:

- `DATABASE_URL`
- `REDIS_URL`
- `SIGNER_URL`
- `SIGNER_AUTH_TOKEN`
- `SIGNER_KEY_ID`
- `WALLET_ADDRESS`

### Mode B. Local Papertrade Mode

This is the same local service graph, but with papertrade semantics instead of dry-run semantics:

- `LIVE_TRADING=false`
- `DRY_RUN=false`
- `TRADING_ENABLED=false`
- `LIVE_TEST_MODE=false`
- `SIGNER_MODE=disabled`
- `WALLET_ADDRESS=11111111111111111111111111111111` (non-secret local placeholder; papertrade boot still requires a non-empty value)
- `CONTROL_TOKEN=local-control-token`
- `OPERATOR_READ_TOKEN=local-operator-read-token`

Everything else stays local-safe. No real swaps are executed.
This is papertrade, not dry-run.
The worker is the actual runtime loop; the public server alone is only the read surface.
For a truthful three-process papertrade boot, keep `DATABASE_URL` and `REDIS_URL` unset in all three `bot/` shells, set the same `OPERATOR_READ_TOKEN` value in the control/server shells and `dashboard/.env.local`, and either rely on the shared local default at `data/runtime-visibility.json` or set the same POSIX `RUNTIME_VISIBILITY_PATH` value in all three shells.

Dashboard mutations are separate from dashboard reads:

- read-only control proxying uses `CONTROL_TOKEN` plus `OPERATOR_READ_TOKEN`
- mutation routes require a dashboard operator session from `POST /api/auth/login`
- to enable local operator login, set `DASHBOARD_SESSION_SECRET` and `DASHBOARD_OPERATOR_DIRECTORY_JSON` in `dashboard/.env.local`
- without a session, mutation requests must return `403` and that is expected
- the helper script `generate_render_dashboard_secrets_macos (1).sh` can generate the local dashboard auth values for macOS

Local dashboard operator bootstrap:

1. Run `./generate_render_dashboard_secrets_macos\ \(1\).sh` on macOS, or use the Windows helper if you are on Windows.
2. Copy the emitted `DASHBOARD_SESSION_SECRET` and `DASHBOARD_OPERATOR_DIRECTORY_JSON` into `dashboard/.env.local`.
3. Keep the generated operator directory as a JSON array of objects with `username`, `displayName`, `role`, `passwordSalt`, and `passwordHash`.
4. Leave `active` omitted unless you intentionally want a disabled operator. Leave `passwordIterations` omitted unless you need a non-default cost.
5. Use role `operator` for the smallest reversible local mutation test. Use role `admin` only for admin-only control actions such as `restart_worker` or `reload`.
6. Log in with `POST /api/auth/login` using the generated username and password.
7. Confirm the session with `GET /api/auth/session`.
8. Test a reversible mutation such as `POST /api/control/pause` or `POST /api/control/resume`.

Truthful local papertrade means the following surfaces agree:

- `bot/src/server/routes/health.ts` sees the same worker visibility snapshot as the control plane.
- `bot/src/server/routes/control.ts` returns the same runtime visibility and runtime config status for the local environment.
- `dashboard/.env.local` points the dashboard at the same local API and control base URLs that the `bot/` processes are serving.
- the configured runtime visibility file changes after the worker loop runs and the timestamped snapshot is fresh, not recycled from a previous boot.

### Mode C. Local Live-Limited Readiness

Only use this once the control service, signer, RPC, wallet, and preflight prerequisites exist locally or have been provisioned for the live environment:

- `LIVE_TRADING=true`
- `DRY_RUN=false`
- `TRADING_ENABLED=true`
- `LIVE_TEST_MODE=true`
- `RUNTIME_POLICY_AUTHORITY=ts-env`
- `RPC_MODE=real`
- `RPC_URL=<real Solana RPC URL>`
- `SIGNER_MODE=remote`
- `SIGNER_URL=http://127.0.0.1:8787/sign`
- `SIGNER_AUTH_TOKEN=<shared-signer-token>`
- `SIGNER_WALLET_PRIVATE_KEY=<local signer secret>`
- `SIGNER_WALLET_ADDRESS=<matching-public-wallet>`
- `WALLET_ADDRESS=<matching-public-wallet>`
- `JUPITER_API_KEY=<required>`
- `CONTROL_TOKEN=<shared-control-token>`
- `OPERATOR_READ_TOKEN=<distinct-read-token>`
- `DISCOVERY_PROVIDER=dexscreener`
- `MARKET_DATA_PROVIDER=dexpaprika`
- `STREAMING_PROVIDER=dexpaprika`
- `MORALIS_ENABLED=false`
- `ROLLOUT_POSTURE=micro_live`

If any of the required live-limited prerequisites are missing, the bot fails closed and `npm run live:preflight` should report the blocker instead of arming live mode.

Local live-limited can leave `DATABASE_URL` and `REDIS_URL` unset, but the live deployment path in `render.yaml` wires Postgres and Redis for control/history/rehearsal state. Without that external provisioning, the governance and restart-history path remains in-memory and is not a full live deployment.

Hard live gates enforced in code include:

- stale or missing worker heartbeat
- unresolved restart alerts
- pending restart-required config
- restart in progress
- active kill switch
- missing, failed, or stale database rehearsal evidence
- quote, signer, send, or receipt-verification failure in the swap path

Live-limited refusal is expected when any of the following are true:

- `RPC_MODE` is not `real`
- `RPC_URL` is missing or blank
- `DRY_RUN=true`
- `LIVE_TRADING=false`
- `TRADING_ENABLED=false`
- `LIVE_TEST_MODE=false`
- `SIGNER_MODE` is not `remote`
- `SIGNER_URL` is missing
- `SIGNER_AUTH_TOKEN` is missing
- `WALLET_ADDRESS` is missing
- `CONTROL_TOKEN` is missing
- `OPERATOR_READ_TOKEN` is missing or matches `CONTROL_TOKEN`
- `JUPITER_API_KEY` is missing
- `MORALIS_ENABLED=true` without `MORALIS_API_KEY`
- `ROLLOUT_POSTURE` is `paper_only` or `paused_or_rolled_back`
- worker boot-critical state is incomplete or invalid

## Local Service Map

| Service | Purpose | Startup command | Required envs | Local host / port | Status |
| --- | --- | --- | --- | --- | --- |
| Control | Authenticated runtime/config control plane | `cd bot` then `npm run start:control` | `CONTROL_TOKEN`, `PORT=3334`, `HOST=127.0.0.1`, papertrade envs above, same `RUNTIME_VISIBILITY_PATH` as the other bot shells if you set one | `127.0.0.1:3334` | Real local service |
| Worker | Runtime loop and heartbeat publisher | `cd bot` then `npm run start:worker` | `SIGNER_MODE=disabled`, papertrade envs above, same `RUNTIME_VISIBILITY_PATH` as the other bot shells if you set one | n/a | Real local service |
| Bot/runtime | Public KPI / health / decision surface | `cd bot` then `npm run start:server` | `PORT=3333`, `HOST=127.0.0.1`, papertrade envs above, same `RUNTIME_VISIBILITY_PATH` as the other bot shells if you set one | `127.0.0.1:3333` | Real local service |
| Dashboard | Operator UI and API proxy | `cd dashboard` then `npm run dev` for local development, or `npm run build && npm run start` for production-like local mode | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_USE_MOCK=false`, `CONTROL_SERVICE_URL`, `CONTROL_TOKEN`, `OPERATOR_READ_TOKEN`; add `DASHBOARD_SESSION_SECRET` and `DASHBOARD_OPERATOR_DIRECTORY_JSON` in `dashboard/.env.local` when you want local mutation login | `127.0.0.1:3000` | Real local service |
| Signer | Remote signing boundary | `cd signer` then `npm run start` | `SIGNER_AUTH_TOKEN`, `SIGNER_WALLET_PRIVATE_KEY`, `SIGNER_WALLET_ADDRESS`, `SIGNER_HOST=127.0.0.1`, `SIGNER_PORT=8787` | `127.0.0.1:8787` | Required for live-limited only |

## Start Order

1. Control service.
2. Worker runtime loop.
3. Bot/runtime public server.
4. Dashboard.
5. Health, control, and preflight checks.

## Env Authority

Use these files as follows:

- `dashboard/.env.local`: authoritative local dashboard env file. Next auto-loads it.
- `bot/` shell environment: authoritative for `npm run start:control`, `npm run start:worker`, and `npm run start:server`.
- `.env.example` and `.env.live-local.example`: reference templates only. They are not auto-loaded by the `bot/` processes.
- root `.env`: reference snapshot only unless you explicitly source it before launching commands.

If you choose a file-backed local visibility path, prefer an absolute `RUNTIME_VISIBILITY_PATH` and set it identically in all three `bot/` shells.

## Exact Commands

### One-time install

```bash
cd bot
npm install
npm run build

cd ../dashboard
npm install

cd ../signer
npm install
```

### Local Papertrade Boot

Build `bot` first, or the `start:*` commands will run stale or missing `dist/` output.

```bash
cd bot
export NODE_ENV=development
export RUNTIME_CONFIG_ENV=development
export HOST=127.0.0.1
export PORT=3334
export CONTROL_TOKEN=local-control-token
export WALLET_ADDRESS=11111111111111111111111111111111
export LIVE_TRADING=false
export DRY_RUN=false
export TRADING_ENABLED=false
export LIVE_TEST_MODE=false
export SIGNER_MODE=disabled
export RPC_MODE=stub
export OPERATOR_READ_TOKEN=local-operator-read-token
export MORALIS_ENABLED=false
npm run start:control
```

```bash
cd bot
export NODE_ENV=development
export RUNTIME_CONFIG_ENV=development
export HOST=127.0.0.1
export PORT=3333
export CONTROL_TOKEN=local-control-token
export OPERATOR_READ_TOKEN=local-operator-read-token
export WALLET_ADDRESS=11111111111111111111111111111111
export LIVE_TRADING=false
export DRY_RUN=false
export TRADING_ENABLED=false
export LIVE_TEST_MODE=false
export SIGNER_MODE=disabled
export RPC_MODE=stub
export MORALIS_ENABLED=false
npm run start:server
```

```bash
cd bot
export NODE_ENV=development
export RUNTIME_CONFIG_ENV=development
export WALLET_ADDRESS=11111111111111111111111111111111
export LIVE_TRADING=false
export DRY_RUN=false
export TRADING_ENABLED=false
export LIVE_TEST_MODE=false
export SIGNER_MODE=disabled
export RPC_MODE=stub
export MORALIS_ENABLED=false
npm run start:worker
```

```bash
cd dashboard
export NEXT_PUBLIC_API_URL=http://127.0.0.1:3333
export NEXT_PUBLIC_USE_MOCK=false
export CONTROL_SERVICE_URL=http://127.0.0.1:3334
export CONTROL_TOKEN=local-control-token
export OPERATOR_READ_TOKEN=local-operator-read-token
npm run dev
```

Papertrade boot uses the same start order and services as safe boot, but with papertrade semantics:

```bash
export LIVE_TRADING=false
export DRY_RUN=false
export TRADING_ENABLED=false
export LIVE_TEST_MODE=false
export SIGNER_MODE=disabled
export WALLET_ADDRESS=11111111111111111111111111111111
export OPERATOR_READ_TOKEN=local-operator-read-token
```

To provision local dashboard operator login for mutations, run the macOS helper script or generate equivalent values yourself:

```bash
./generate_render_dashboard_secrets_macos\ \(1\).sh
```

Then copy the generated `DASHBOARD_SESSION_SECRET` and `DASHBOARD_OPERATOR_DIRECTORY_JSON` into `dashboard/.env.local`.

Mutation login flow:

1. Start the dashboard with the session values set.
2. `POST /api/auth/login` with one of the operator credentials from the generated directory.
3. Use the resulting `bobbyexecute_dashboard_session` cookie for `POST`, `PUT`, `PATCH`, or `DELETE` control actions.
4. Expect `403` on mutation routes when no valid session cookie is present.

### Local live-limited readiness

Start the services in the standard local order, with the signer inserted after control:

1. Copy [`.env.live-local.example`](../.env.live-local.example) to a local env file and fill in the required secrets and RPC URL.
2. Use the same live-local values for control, bot, dashboard, and signer, but override `PORT` / `HOST` per service at launch.

```bash
cd bot
export NODE_ENV=production
export RUNTIME_CONFIG_ENV=local-live
export HOST=127.0.0.1
export PORT=3334
export CONTROL_TOKEN=local-control-token
export LIVE_TRADING=true
export DRY_RUN=false
export TRADING_ENABLED=true
export LIVE_TEST_MODE=true
export RUNTIME_POLICY_AUTHORITY=ts-env
export RPC_MODE=real
export RPC_URL="real Solana RPC URL"
export SIGNER_MODE=remote
export SIGNER_URL=http://127.0.0.1:8787/sign
export SIGNER_AUTH_TOKEN=local-signer-token
export SIGNER_KEY_ID=local-key-1
export WALLET_ADDRESS="matching-public-wallet"
export JUPITER_API_KEY="required"
export DISCOVERY_PROVIDER=dexscreener
export MARKET_DATA_PROVIDER=dexpaprika
export STREAMING_PROVIDER=dexpaprika
export MORALIS_ENABLED=false
export OPERATOR_READ_TOKEN=local-operator-read-token
export ROLLOUT_POSTURE=micro_live
npm run start:control
```

```bash
cd signer
export SIGNER_AUTH_TOKEN=local-signer-token
export SIGNER_WALLET_PRIVATE_KEY="matching-secret-key"
export SIGNER_WALLET_ADDRESS="matching-public-wallet"
export SIGNER_PORT=8787
export SIGNER_HOST=127.0.0.1
npm run start
```

```bash
cd bot
export NODE_ENV=production
export RUNTIME_CONFIG_ENV=local-live
export HOST=127.0.0.1
export PORT=3333
export LIVE_TRADING=true
export DRY_RUN=false
export TRADING_ENABLED=true
export LIVE_TEST_MODE=true
export RUNTIME_POLICY_AUTHORITY=ts-env
export RPC_MODE=real
export RPC_URL="real Solana RPC URL"
export SIGNER_MODE=remote
export SIGNER_URL=http://127.0.0.1:8787/sign
export SIGNER_AUTH_TOKEN=local-signer-token
export SIGNER_KEY_ID=local-key-1
export WALLET_ADDRESS="matching-public-wallet"
export JUPITER_API_KEY="required"
export DISCOVERY_PROVIDER=dexscreener
export MARKET_DATA_PROVIDER=dexpaprika
export STREAMING_PROVIDER=dexpaprika
export MORALIS_ENABLED=false
export OPERATOR_READ_TOKEN=local-operator-read-token
export ROLLOUT_POSTURE=micro_live
npm run start:server
```

```bash
cd dashboard
export NEXT_PUBLIC_API_URL=http://127.0.0.1:3333
export NEXT_PUBLIC_USE_MOCK=false
export CONTROL_SERVICE_URL=http://127.0.0.1:3334
export CONTROL_TOKEN=local-control-token
export OPERATOR_READ_TOKEN=local-operator-read-token
npm run build
npm run start
```

Then verify live readiness:

```bash
cd bot
npm run live:preflight
```

Expected success signals:

- `loadConfig()` accepts the live env set without throwing.
- `npm run live:preflight` exits cleanly.
- the preflight report shows `executionMode: "live"`, `rpcMode: "real"`, `liveTestEnabled: true`, `rolloutPosture: "micro_live"`, `preflightGate: "micro_live"`, and `blockers: []`.
- the persisted preflight evidence file is marked `ready`.

If the real RPC or live secrets are still missing, the preflight must refuse and write blocked evidence instead.

Expected refusal signals:

- missing or blank `RPC_URL`
- missing signer credentials or wallet material
- missing `JUPITER_API_KEY`
- missing `CONTROL_TOKEN` or `OPERATOR_READ_TOKEN`
- `CONTROL_TOKEN` and `OPERATOR_READ_TOKEN` being identical
- `DRY_RUN=true` while `LIVE_TRADING=true`
- `ROLLOUT_POSTURE=paper_only` or `ROLLOUT_POSTURE=paused_or_rolled_back`
- worker boot-critical artifacts missing or invalid

## Quick Checks

```bash
curl -s http://127.0.0.1:3333/health
curl -s -H "Authorization: Bearer local-control-token" http://127.0.0.1:3334/control/status
curl -s -H "Authorization: Bearer local-control-token" http://127.0.0.1:3334/control/runtime-config
curl -s http://127.0.0.1:3000/api/auth/session
```

Open the dashboard at `http://127.0.0.1:3000/overview` after the dashboard server starts.

Truthful local papertrade symptoms:

- `GET /health` shows a worker snapshot, but `GET /control/status` shows a different runtime environment or a missing worker.
- `GET /control/runtime-config` reports a different `runtimeConfig.environment` than the server health response.
- the configured runtime visibility file does not update after worker startup.
- the dashboard points at a different `NEXT_PUBLIC_API_URL` or `CONTROL_SERVICE_URL` than the local bot ports.
- `NEXT_PUBLIC_USE_MOCK=true` is set anywhere in the local dashboard path.
