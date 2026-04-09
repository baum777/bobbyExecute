# Local Run

This repository can run locally without Render when you keep the local safe-boot path fail-closed:

- bot/control use in-memory repositories when `DATABASE_URL` and `REDIS_URL` are unset.
- the dashboard can talk to the local control service through `CONTROL_SERVICE_URL`.
- the signer is optional for safe boot and required only for live-limited readiness.

## Canonical Local Modes

### Mode A. Local Safe Boot

Use this mode to bring up the real local services with no live execution:

- `LIVE_TRADING=false`
- `DRY_RUN=true`
- `TRADING_ENABLED=false`
- `LIVE_TEST_MODE=false`
- `RPC_MODE=stub`
- `SIGNER_MODE=disabled`
- `MORALIS_ENABLED=false`
- `NEXT_PUBLIC_USE_MOCK=false`

The dashboard should point at the local bot API and local control service:

- `NEXT_PUBLIC_API_URL=http://127.0.0.1:3333`
- `CONTROL_SERVICE_URL=http://127.0.0.1:3334`
- `CONTROL_TOKEN=<shared-local-token>`

Leave these unset for the safe-boot path:

- `DATABASE_URL`
- `REDIS_URL`
- `SIGNER_URL`
- `SIGNER_AUTH_TOKEN`
- `SIGNER_KEY_ID`
- `WALLET_ADDRESS`

### Mode B. Local Paper-Like Mode

This is the same local service graph, but with paper execution semantics instead of dry-run semantics:

- `LIVE_TRADING=false`
- `DRY_RUN=false`
- `TRADING_ENABLED=false`
- `LIVE_TEST_MODE=false`

Everything else stays local-safe. No real swaps are executed.

### Mode C. Local Live-Limited Readiness

Only use this once the control service, signer, RPC, wallet, and preflight prerequisites exist locally:

- `LIVE_TRADING=true`
- `DRY_RUN=false`
- `TRADING_ENABLED=true`
- `LIVE_TEST_MODE=true`
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
| Control | Authenticated runtime/config control plane | `cd bot` then `npm run start:control` | `CONTROL_TOKEN`, `PORT=3334`, `HOST=127.0.0.1`, safe-boot envs above | `127.0.0.1:3334` | Real local service |
| Bot/runtime | Public KPI / health / decision surface | `cd bot` then `npm run start:server` | `PORT=3333`, `HOST=127.0.0.1`, safe-boot envs above | `127.0.0.1:3333` | Real local service |
| Dashboard | Operator UI and API proxy | `cd dashboard` then `npm run dev` for local development, or `npm run build && npm run start` for production-like local mode | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_USE_MOCK=false`, `CONTROL_SERVICE_URL`, `CONTROL_TOKEN`, `OPERATOR_READ_TOKEN` | `127.0.0.1:3000` | Real local service |
| Signer | Remote signing boundary | `cd signer` then `npm run start` | `SIGNER_AUTH_TOKEN`, `SIGNER_WALLET_PRIVATE_KEY`, `SIGNER_WALLET_ADDRESS`, `SIGNER_HOST=127.0.0.1`, `SIGNER_PORT=8787` | `127.0.0.1:8787` | Required for live-limited only |

## Start Order

1. Control service.
2. Signer, if live-limited mode needs it.
3. Bot/runtime public server.
4. Dashboard.
5. Health, control, and preflight checks.

## Exact Commands

### One-time install

```powershell
cd bot
npm install

cd ..\dashboard
npm install

cd ..\signer
npm install
```

### Safe boot

```powershell
cd bot
$env:NODE_ENV = "development"
$env:RUNTIME_CONFIG_ENV = "development"
$env:HOST = "127.0.0.1"
$env:PORT = "3334"
$env:CONTROL_TOKEN = "local-control-token"
$env:LIVE_TRADING = "false"
$env:DRY_RUN = "true"
$env:TRADING_ENABLED = "false"
$env:LIVE_TEST_MODE = "false"
$env:RPC_MODE = "stub"
$env:SIGNER_MODE = "disabled"
$env:MORALIS_ENABLED = "false"
npm run start:control
```

```powershell
cd bot
$env:NODE_ENV = "development"
$env:RUNTIME_CONFIG_ENV = "development"
$env:HOST = "127.0.0.1"
$env:PORT = "3333"
$env:LIVE_TRADING = "false"
$env:DRY_RUN = "true"
$env:TRADING_ENABLED = "false"
$env:LIVE_TEST_MODE = "false"
$env:RPC_MODE = "stub"
$env:SIGNER_MODE = "disabled"
$env:MORALIS_ENABLED = "false"
npm run start:server
```

```powershell
cd dashboard
$env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:3333"
$env:NEXT_PUBLIC_USE_MOCK = "false"
$env:CONTROL_SERVICE_URL = "http://127.0.0.1:3334"
$env:CONTROL_TOKEN = "local-control-token"
npm run dev
```

### Paper-like mode

Use the same start order as safe boot, but set:

```powershell
$env:LIVE_TRADING = "false"
$env:DRY_RUN = "false"
$env:TRADING_ENABLED = "false"
$env:LIVE_TEST_MODE = "false"
```

### Local live-limited readiness

Start the services in the standard local order, with the signer inserted after control:

1. Copy [`.env.live-local.example`](../.env.live-local.example) to a local env file and fill in the required secrets and RPC URL.
2. Use the same live-local values for control, bot, dashboard, and signer, but override `PORT` / `HOST` per service at launch.

```powershell
cd bot
$env:NODE_ENV = "production"
$env:RUNTIME_CONFIG_ENV = "local-live"
$env:HOST = "127.0.0.1"
$env:PORT = "3334"
$env:CONTROL_TOKEN = "local-control-token"
$env:LIVE_TRADING = "true"
$env:DRY_RUN = "false"
$env:TRADING_ENABLED = "true"
$env:LIVE_TEST_MODE = "true"
$env:RPC_MODE = "real"
$env:RPC_URL = "<real-solana-rpc-url>"
$env:SIGNER_MODE = "remote"
$env:SIGNER_URL = "http://127.0.0.1:8787/sign"
$env:SIGNER_AUTH_TOKEN = "local-signer-token"
$env:SIGNER_KEY_ID = "local-key-1"
$env:WALLET_ADDRESS = "<matching-public-wallet>"
$env:JUPITER_API_KEY = "<required>"
$env:DISCOVERY_PROVIDER = "dexscreener"
$env:MARKET_DATA_PROVIDER = "dexpaprika"
$env:STREAMING_PROVIDER = "dexpaprika"
$env:MORALIS_ENABLED = "false"
$env:OPERATOR_READ_TOKEN = "local-operator-read-token"
$env:ROLLOUT_POSTURE = "micro_live"
npm run start:control
```

```powershell
cd signer
$env:SIGNER_AUTH_TOKEN = "local-signer-token"
$env:SIGNER_WALLET_PRIVATE_KEY = "<matching-secret-key>"
$env:SIGNER_WALLET_ADDRESS = "<matching-public-wallet>"
$env:SIGNER_PORT = "8787"
$env:SIGNER_HOST = "127.0.0.1"
npm run start
```

```powershell
cd bot
$env:NODE_ENV = "production"
$env:RUNTIME_CONFIG_ENV = "local-live"
$env:HOST = "127.0.0.1"
$env:PORT = "3333"
$env:LIVE_TRADING = "true"
$env:DRY_RUN = "false"
$env:TRADING_ENABLED = "true"
$env:LIVE_TEST_MODE = "true"
$env:RPC_MODE = "real"
$env:RPC_URL = "<real-solana-rpc-url>"
$env:SIGNER_MODE = "remote"
$env:SIGNER_URL = "http://127.0.0.1:8787/sign"
$env:SIGNER_AUTH_TOKEN = "local-signer-token"
$env:SIGNER_KEY_ID = "local-key-1"
$env:WALLET_ADDRESS = "<matching-public-wallet>"
$env:JUPITER_API_KEY = "<required>"
$env:DISCOVERY_PROVIDER = "dexscreener"
$env:MARKET_DATA_PROVIDER = "dexpaprika"
$env:STREAMING_PROVIDER = "dexpaprika"
$env:MORALIS_ENABLED = "false"
$env:OPERATOR_READ_TOKEN = "local-operator-read-token"
$env:ROLLOUT_POSTURE = "micro_live"
npm run start:server
```

```powershell
cd dashboard
$env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:3333"
$env:NEXT_PUBLIC_USE_MOCK = "false"
$env:CONTROL_SERVICE_URL = "http://127.0.0.1:3334"
$env:CONTROL_TOKEN = "local-control-token"
$env:OPERATOR_READ_TOKEN = "local-operator-read-token"
npm run build
npm run start
```

Then verify live readiness:

```powershell
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

```powershell
Invoke-WebRequest http://127.0.0.1:3333/health | Select-Object -ExpandProperty Content
Invoke-WebRequest -Headers @{ Authorization = "Bearer local-control-token" } http://127.0.0.1:3334/control/status | Select-Object -ExpandProperty Content
```

Open the dashboard at `http://127.0.0.1:3000/overview` after the dashboard server starts.
