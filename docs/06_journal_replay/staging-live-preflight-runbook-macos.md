# macOS Live-Limited Quickstart

Use this only after papertrade works.
Shared concepts and the gate map live in `docs/06_journal_replay/staging-live-preflight-runbook.md`.

## Before You Start

- macOS `zsh` or `bash`
- Node 22
- npm
- A real RPC endpoint
- A remote signer service
- Shared Postgres and Redis if you want truthful multi-process live trade

## Step 1: Generate Local Tokens

Run this in a macOS terminal to create two distinct local secrets:

```bash
CONTROL_TOKEN="$(openssl rand -hex 32)"
OPERATOR_READ_TOKEN="$(openssl rand -hex 32)"
printf 'CONTROL_TOKEN=%s\nOPERATOR_READ_TOKEN=%s\n' "$CONTROL_TOKEN" "$OPERATOR_READ_TOKEN"
```

Copy the generated values into `bot/.env.live-local`:

```dotenv
CONTROL_TOKEN=<generated-token-1>
OPERATOR_READ_TOKEN=<generated-token-2>
```

Use the same generated values in `dashboard/.env.local` when the dashboard proxies control locally.

## Step 2: Prepare the Signer

```bash
cd /path/to/bobbyExecute/signer
npm install
cp .env.example .env.local
# Fill SIGNER_AUTH_TOKEN, SIGNER_WALLET_PRIVATE_KEY, and SIGNER_WALLET_ADDRESS.
set -a
source ./.env.local
set +a
npm run build
npm start
```

## Step 3: Prepare `bot/.env.live-local`

```bash
cd /path/to/bobbyExecute/bot
npm install
cp ../.env.live-local.example .env.live-local
# Fill the live-limited env values before continuing, including CONTROL_TOKEN,
# OPERATOR_READ_TOKEN, RUNTIME_POLICY_AUTHORITY=ts-env, ROLLOUT_POSTURE=micro_live,
# RPC_URL, SIGNER_URL, SIGNER_AUTH_TOKEN, WALLET_ADDRESS, JUPITER_API_KEY, and
# the OpenRouter/Qwen values above.
set -a
source ./.env.live-local
set +a
npm run build
```

If `DATABASE_URL` is set, check schema readiness before starting anything:

```bash
npm run db:status
# If the status says missing_but_migratable or migration_required, run:
npm run db:migrate
```

If `DATABASE_URL` is blank, skip the DB scripts. That only gives you a boot smoke test, not truthful multi-process live trade.

Then run the hard live gate:

```bash
npm run live:preflight
```

What the first live-preflight error means:

- `Live-test preflight requires LIVE_TRADING=true.` usually means the wrong env file was loaded, or you are in the wrong terminal session. Load `bot/.env.live-local` in that same terminal and retry.

## Step 4: Start Live-Limited Services

Use the same `bot/.env.live-local` values in every bot terminal.

Terminal B: bot control

```bash
cd /path/to/bobbyExecute/bot
set -a
source ./.env.live-local
set +a
npm run start:control
```

Terminal C: bot worker

```bash
cd /path/to/bobbyExecute/bot
set -a
source ./.env.live-local
set +a
npm run start:worker
```

Terminal D: bot runtime server

```bash
cd /path/to/bobbyExecute/bot
set -a
source ./.env.live-local
set +a
# This script repeats live:preflight and then starts the server.
npm run live:test
```

Terminal E: dashboard

```bash
cd /path/to/bobbyExecute/dashboard
npm install
cp .env.example .env.local
# Fill CONTROL_SERVICE_URL, CONTROL_TOKEN, and OPERATOR_READ_TOKEN.
# Use the same generated tokens from bot/.env.live-local.
set -a
source ./.env.local
set +a
npm run dev
```

## Verify Live-Limited State

```bash
curl -fsS -H "Authorization: Bearer $OPERATOR_READ_TOKEN" http://127.0.0.1:3334/control/runtime-config
curl -fsS -H "Authorization: Bearer $OPERATOR_READ_TOKEN" http://127.0.0.1:3334/control/runtime-status
curl -fsS -H "Authorization: Bearer $OPERATOR_READ_TOKEN" http://127.0.0.1:3334/control/release-gate
curl -fsS http://127.0.0.1:3333/health
```

What you want to see:

- live mode, not paper or dry
- `workerSafeBoot: true`
- `release-gate` satisfied for the live posture
- rollout posture still `micro_live`
- the signer is remote and healthy

If `npm run live:preflight` fails, stop. Do not proceed to worker runtime.

## Common Failures

- `CONTROL_TOKEN` and `OPERATOR_READ_TOKEN` are the same value.
- `SIGNER_MODE` is not `remote`.
- `RPC_MODE` is not `real`.
- `DATABASE_URL` or `REDIS_URL` is blank and you assumed the run was multi-process truth rather than smoke-test fallback.
- The signer env does not match the bot env, so the control and worker processes cannot complete the same live boundary.

## Live Trade Pointer

The release and incident runbook is separate:

- `docs/06_journal_replay/operator-release-gate-and-incident-runbook.md`
