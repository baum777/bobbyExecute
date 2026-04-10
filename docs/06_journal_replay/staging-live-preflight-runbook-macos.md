# macOS Live-Limited Onboarding

This page contains the macOS shell commands for the live-limited path.
Shared concepts and the gate map live in [staging-live-preflight-runbook.md](C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-runbook.md).

## Prerequisites

- macOS `zsh` or `bash`
- Node 22
- npm
- a real RPC endpoint
- a remote signer service
- shared Postgres and Redis if you want truthful multi-process live-limited state

## Generate Local Auth Tokens

Run these in a macOS terminal to create two distinct local secrets:

```bash
CONTROL_TOKEN="$(openssl rand -hex 32)"
OPERATOR_READ_TOKEN="$(openssl rand -hex 32)"
printf 'CONTROL_TOKEN=%s\nOPERATOR_READ_TOKEN=%s\n' "$CONTROL_TOKEN" "$OPERATOR_READ_TOKEN"
```

Paste the generated values into `bot/.env.live-local`:

```dotenv
CONTROL_TOKEN=<generated-token-1>
OPERATOR_READ_TOKEN=<generated-token-2>
```

Also use the same generated values in `dashboard/.env.local` when the dashboard proxies control locally.

## Use Qwen 3.6 Free via OpenRouter

Set these in `bot/.env.live-local` before running live preflight:

```dotenv
LAUNCH_MODE=openai
OPENAI_API_KEY=<openrouter-api-key>
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=qwen/qwen3.6-plus:free
OPENROUTER_HTTP_REFERER=http://127.0.0.1
OPENROUTER_X_TITLE=BobbyExecute
ADVISORY_LLM_ENABLED=false
ADVISORY_LLM_PROVIDER=openai
```

There is no separate `ADVISORY_LLM_MODEL` env key in this repo. If you intentionally switch the advisory provider to `qwen`, use `QWEN_API_KEY`, `QWEN_BASE_URL`, and `QWEN_MODEL=qwen/qwen3.6-plus:free`.

## Terminal 0: Signer

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

## Terminal A: Bot Preflight

```bash
cd /path/to/bobbyExecute/bot
npm install
cp ../.env.live-local.example .env.live-local
# Fill the live-limited env values before continuing, including CONTROL_TOKEN,
# OPERATOR_READ_TOKEN, and the OpenRouter/Qwen values above.
set -a
source ./.env.live-local
set +a
npm run build
npm run live:preflight
```

## Terminal B: Bot Control

```bash
cd /path/to/bobbyExecute/bot
set -a
source ./.env.live-local
set +a
npm run start:control
```

## Terminal C: Bot Worker

```bash
cd /path/to/bobbyExecute/bot
set -a
source ./.env.live-local
set +a
npm run start:worker
```

## Terminal D: Bot Server

```bash
cd /path/to/bobbyExecute/bot
set -a
source ./.env.live-local
set +a
npm run live:test
```

## Terminal E: Dashboard

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

## Verification

```bash
curl -fsS -H "Authorization: Bearer $OPERATOR_READ_TOKEN" http://127.0.0.1:3334/control/runtime-config
curl -fsS -H "Authorization: Bearer $OPERATOR_READ_TOKEN" http://127.0.0.1:3334/control/runtime-status
curl -fsS -H "Authorization: Bearer $OPERATOR_READ_TOKEN" http://127.0.0.1:3334/control/release-gate
```

What you want to see:

- live mode, not paper or dry
- `workerSafeBoot: true`
- `release-gate` satisfied for the live posture
- rollout posture still `micro_live`
- the signer is remote and healthy

If `npm run live:preflight` fails, stop. Do not proceed to worker runtime.

## Live-Limited Pointer

The release and incident runbook is separate:

- [docs/06_journal_replay/operator-release-gate-and-incident-runbook.md](C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/operator-release-gate-and-incident-runbook.md)
