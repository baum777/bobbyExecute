# Local Run Onboarding

Start here.

Choose `papertrade` first. It is the safest first-run path because it keeps `LIVE_TRADING=false`, `DRY_RUN=false`, and `SIGNER_MODE=disabled`.

`Live trade` in this repo means the live-limited path in `docs/06_journal_replay/staging-live-preflight-runbook.md`. It uses real capital controls, a remote signer, and a hard preflight gate. Do not start it until papertrade works.

## Local Support Rules

- Treat env exports as shell-local. Load the same mode file separately in each terminal before starting a service.
- The control service still reads `PORT`, so set `PORT=3334` in the control shell before `npm run start:control`. `CONTROL_PORT=3334` alone does not retarget startup.
- The dashboard reads `dashboard/.env.local`; root env values do not automatically flow into the dashboard.
- Restart the affected process after any env change.
- For interactive dashboard work, use `npm run dev`. If the dev server runs out of memory, set `NODE_OPTIONS=--max-old-space-size=4096` in that terminal first.
- If control or dashboard requests return `403`, check tokens and operator config before assuming the service is broken.
- Treat malformed `REDIS_URL` values as real worker failures, not acceptable defaults.
- A tiny or free Postgres plan can still fail under full-pipeline control-path load; do not assume it is always sufficient.

## Mode Comparison

| Mode | What it does | Safe for first run? | Working file |
|---|---|---|---|
| Papertrade | Simulated execution path, no real capital | Yes | `bot/.env` |
| Live trade | Real RPC, remote signer, live preflight gate | No | `bot/.env.live-local` |
| Dry mode | No execution, not papertrade | No | `DRY_RUN=true` only |

## Before You Start

- Node 22. The repo pins it in `.nvmrc`.
- npm.
- A real Postgres and Redis only if you want truthful multi-process papertrade or live trade. Blank values fall back to local in-memory/file stores and are not a truthful multi-process run.
- If you use Neon, set `NEON_API_KEY` once and optionally `NEON_PROJECT_ID`, `NEON_PROJECT_NAME`, `NEON_BRANCH_ID`, `NEON_BRANCH_NAME`, `NEON_DATABASE_NAME`, `NEON_ROLE_NAME`, or `NEON_ENDPOINT_ID` for disambiguation.
- An OpenRouter API key if you want the main LLM path exercised.
- For live trade only: a real Solana RPC endpoint, a remote signer, a matching wallet address, and a Jupiter API key.
- Generate distinct `CONTROL_TOKEN` and `OPERATOR_READ_TOKEN` values locally.
- Do not commit secrets.

## Files To Copy

- `bot/.env` from `.env.papertrade.example`
- `bot/.env.live-local` from `.env.live-local.example`
- `dashboard/.env.local` from `dashboard/.env.example`
- `signer/.env.local` from `signer/.env.example` for live trade only

## Startup Order

For full-pipeline local papertrade or local live-limited runs, start the services in separate terminals:

1. Bot API server: `cd bot` then `npm run start:server`
2. Worker: `cd bot` then `npm run start:worker`
3. Control plane: `cd bot`, set `PORT=3334` in that shell, then run `npm run start:control`
4. Dashboard: `cd dashboard`, then run `npm run dev` for interactive work or `npm run start` after build

Use the same `bot/.env` values in every bot terminal. The dashboard uses `dashboard/.env.local`, so changing those values requires a dashboard restart.

## Required Keys

Papertrade:

- Required: `LIVE_TRADING=false`, `DRY_RUN=false`, `TRADING_ENABLED=true`, `LIVE_TEST_MODE=false`, `ROLLOUT_POSTURE=paper_only`, `RUNTIME_POLICY_AUTHORITY=ts-env`, `SIGNER_MODE=disabled`, `CONTROL_TOKEN`, `OPERATOR_READ_TOKEN`, `CONTROL_SERVICE_URL`
- Required if you want the main LLM path exercised: `OPENAI_API_KEY`
- Required for truthful multi-process papertrade: `DATABASE_URL`, `REDIS_URL`
- If `DATABASE_URL` is not set, `npm run db:bootstrap` can derive `DATABASE_URL` and `DIRECT_URL` from Neon before it runs `db:migrate`.
- Required for dashboard operator auth in a truthful full-pipeline run: `DASHBOARD_OPERATOR_DIRECTORY_JSON`, `DASHBOARD_SESSION_SECRET`
- Optional or boot-smoke only: `RPC_URL` when `RPC_MODE=stub`, `SIGNER_URL`, `SIGNER_AUTH_TOKEN`, `SIGNER_KEY_ID`, `JUPITER_API_KEY`, `MORALIS_API_KEY`
- `WALLET_ADDRESS` may stay on the placeholder value in the example if you only want a boot smoke test. Use a real wallet address if you want wallet-snapshot validation.

Live trade:

- Required: `LIVE_TRADING=true`, `DRY_RUN=false`, `TRADING_ENABLED=true`, `LIVE_TEST_MODE=true`, `ROLLOUT_POSTURE=micro_live`, `RUNTIME_POLICY_AUTHORITY=ts-env`, `RPC_MODE=real`, `SIGNER_MODE=remote`, `SIGNER_URL`, `SIGNER_AUTH_TOKEN`, `WALLET_ADDRESS`, `CONTROL_TOKEN`, `OPERATOR_READ_TOKEN`, `JUPITER_API_KEY`, `CONTROL_SERVICE_URL`
- Required in the signer env: `SIGNER_AUTH_TOKEN`, `SIGNER_WALLET_PRIVATE_KEY`, `SIGNER_WALLET_ADDRESS`
- Required for truthful multi-process live trade: `DATABASE_URL`, `REDIS_URL`
- If `DATABASE_URL` is not set, `npm run db:bootstrap` can derive `DATABASE_URL` and `DIRECT_URL` from Neon before it runs `db:migrate`.

## Fallback Behavior

- If `DATABASE_URL` is blank, control/governance falls back to in-memory state.
- If `REDIS_URL` is blank, runtime-config falls back to in-memory state.
- These fallback paths are useful for a boot smoke test, but they are not truthful multi-process papertrade or live trade.

## DB Checks

- `db:status` and `db:migrate` are only needed when you have a real database URL configured.
- `db:bootstrap` first respects `DATABASE_URL`, then falls back to `NEON_API_KEY`, resolves a Neon connection, exports `DATABASE_URL` and `DIRECT_URL`, and then invokes `db:migrate`.
- `db:migrate` accepts `DIRECT_URL` or `DATABASE_URL`.
- If no real DB is configured, those commands fail hard by design.

What the first DB errors mean:

- `DATABASE_URL is required.` means no real DB is configured yet. Skip the DB checks for a smoke test, or set a real database URL.
- `DIRECT_URL or DATABASE_URL is required.` means migrations need a real database connection before they can run.

## Verify

- `npm run db:status` reports the schema state when `DATABASE_URL` is set.
- `npm run db:migrate` creates or updates schema state when `db:status` says migration is needed.
- `GET /health` should return `200`.
- `GET /control/status` should report the intended runtime mode.
- `GET /control/runtime-status` should match the intended mode and posture.
- `GET /control/release-gate` should show paper-safe for papertrade and live-eligible only for live-limited after preflight.
- `GET /health` for the control service should respond on `127.0.0.1:3334` when the control shell is started with `PORT=3334`.
- Dashboard should respond on `127.0.0.1:3000` with `NEXT_PUBLIC_USE_MOCK=false` for real local wiring.

## What Success Looks Like

Papertrade:

- `runtime-status` shows paper mode, not live
- `release-gate` does not allow live execution
- no signer process is running
- logs describe paper or simulated behavior only

Live trade:

- `live:preflight` passes
- `control/status` and `control/runtime-status` report live mode
- `release-gate` is satisfied for the live posture
- the signer is remote and healthy
- runtime is armed only when you intentionally arm it

## Common Mistakes

- Copying the wrong env file
- Leaving `CONTROL_TOKEN` and `OPERATOR_READ_TOKEN` the same
- Running live trade with `SIGNER_MODE=disabled`
- Expecting `DRY_RUN=true` to behave like papertrade
- Using blank `DATABASE_URL` or `REDIS_URL` and then assuming you exercised shared state
- Starting the dashboard with different tokens than the bot and control service
- Leaving `dashboard/.env.local` without `DASHBOARD_OPERATOR_DIRECTORY_JSON` and then expecting dashboard login to work
- Thinking `npm run live:test` is only a test; it runs preflight and then starts the live-limited server

## OS Docs

- macOS papertrade: `docs/local-run-macos.md`
- Windows papertrade: `docs/local-run-windows.md`
- macOS live-limited: `docs/06_journal_replay/staging-live-preflight-runbook-macos.md`
- Windows live-limited: `docs/06_journal_replay/staging-live-preflight-runbook-windows.md`
