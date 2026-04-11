# macOS Papertrade Quickstart

Use this first. Do not use the live-limited path until papertrade works.
Shared concepts and the mode map live in `docs/local-run.md`.

## Before You Start

- macOS `zsh` or `bash`
- Node 22
- npm
- A local Postgres and Redis only if you want truthful multi-process papertrade

## Step 1: Generate Local Tokens

Run this once to create two distinct local secrets:

```bash
CONTROL_TOKEN="$(openssl rand -hex 32)"
OPERATOR_READ_TOKEN="$(openssl rand -hex 32)"
printf 'CONTROL_TOKEN=%s\nOPERATOR_READ_TOKEN=%s\n' "$CONTROL_TOKEN" "$OPERATOR_READ_TOKEN"
```

Copy the values into `bot/.env.papertrade`:

```dotenv
CONTROL_TOKEN=<generated-token-1>
OPERATOR_READ_TOKEN=<generated-token-2>
```

Keep the two values different. Use the same style of generated values in `bot/.env.live-local` only when you are preparing live trade later.

## Step 2: Prepare `bot/.env.papertrade`

```bash
cd /path/to/bobbyExecute/bot
npm install
cp ../.env.papertrade.example .env.papertrade
# Fill the env file before continuing.
# Required for papertrade:
# - CONTROL_TOKEN
# - OPERATOR_READ_TOKEN
# - RUNTIME_POLICY_AUTHORITY=ts-env
# - ROLLOUT_POSTURE=paper_only
# - OPENAI_API_KEY if you want the main LLM path exercised
# - DATABASE_URL and REDIS_URL only if you want truthful multi-process papertrade
set -a
source ./.env.papertrade
set +a
npm run build
```

If `DATABASE_URL` is set, check schema readiness before starting anything:

```bash
npm run db:status
# If the status says missing_but_migratable or migration_required, run:
npm run db:migrate
```

If `DATABASE_URL` is blank, skip the DB scripts. That only gives you a boot smoke test, not truthful multi-process papertrade.

## Step 3: Start Papertrade Services

Use the same `bot/.env.papertrade` values in every bot terminal.

Terminal A: control service

```bash
cd /path/to/bobbyExecute/bot
set -a
source ./.env.papertrade
set +a
npm run start:control
```

Terminal B: worker

```bash
cd /path/to/bobbyExecute/bot
set -a
source ./.env.papertrade
set +a
npm run start:worker
```

Terminal C: public API server

```bash
cd /path/to/bobbyExecute/bot
set -a
source ./.env.papertrade
set +a
npm run start:server
```

Terminal D: dashboard

```bash
cd /path/to/bobbyExecute/dashboard
npm install
cp .env.example .env.local
# Fill CONTROL_SERVICE_URL, CONTROL_TOKEN, and OPERATOR_READ_TOKEN.
# Use the same generated tokens from bot/.env.papertrade.
set -a
source ./.env.local
set +a
npm run dev
```

## Verify Papertrade

Run these in the same terminal where you executed `source ./.env.papertrade`.
If you open a new terminal, the loaded env values such as tokens, URLs, and mode flags are gone.

```bash
curl -fsS http://127.0.0.1:3333/health
curl -fsS -H "Authorization: Bearer $OPERATOR_READ_TOKEN" http://127.0.0.1:3334/control/status
curl -fsS -H "Authorization: Bearer $OPERATOR_READ_TOKEN" http://127.0.0.1:3334/control/runtime-status
curl -fsS -H "Authorization: Bearer $OPERATOR_READ_TOKEN" http://127.0.0.1:3334/control/release-gate
curl -fsS http://127.0.0.1:3000/api/auth/session
```

Success looks like:

- `runtime-status` reports paper mode, not live
- `release-gate` does not allow live execution
- no signer process is running
- the logs describe paper or simulated behavior only

## Common Failures

- `db:status` fails because `DATABASE_URL` is blank. That is expected for smoke tests, not for truthful multi-process runs.
- `db:status` and `db:migrate` are only needed when you have a real database URL configured, and `db:migrate` also accepts `DIRECT_URL`.
- The dashboard cannot talk to control because `CONTROL_SERVICE_URL`, `CONTROL_TOKEN`, or `OPERATOR_READ_TOKEN` do not match the bot env.
- The runtime behaves like a smoke test because `DATABASE_URL` or `REDIS_URL` are blank.
- `DRY_RUN=true` was used by mistake. That is dry mode, not papertrade.

## Live Trade

Do not switch directly from this page into live execution.

- Live-limited macOS commands: `docs/06_journal_replay/staging-live-preflight-runbook-macos.md`
