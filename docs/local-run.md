# Papertrade Onboarding Index

Scope: canonical entry point for local papertrade onboarding.
This file is the shared concepts and routing map only. Shell-specific commands live in the OS docs.

## Canonical Map

| Path | Role |
|---|---|
| `docs/local-run.md` | Papertrade onboarding index |
| `docs/local-run-macos.md` | macOS papertrade commands |
| `docs/local-run-windows.md` | Windows papertrade commands |
| `docs/06_journal_replay/staging-live-preflight-runbook.md` | Live-limited onboarding index |
| `docs/06_journal_replay/staging-live-preflight-runbook-macos.md` | macOS live-limited commands |
| `docs/06_journal_replay/staging-live-preflight-runbook-windows.md` | Windows live-limited commands |
| `docs/06_journal_replay/operator-release-gate-and-incident-runbook.md` | Release / incident runbook |
| `docs/06_journal_replay/staging-live-preflight-evidence-template.md` | Evidence template |

## Definitions

- Papertrade means `LIVE_TRADING=false` and `DRY_RUN=false`.
- Dry mode means `LIVE_TRADING=false` and `DRY_RUN=true`.
- Live-limited means staged/live-limited: `LIVE_TRADING=true`, `DRY_RUN=false`, and `live:preflight` passes before any live start.

Do not use `DRY_RUN=true` as papertrade.
Do not imply live readiness without `live:preflight`.

## Shared Truth

Truthful multi-process papertrade requires shared runtime truth:

- `DATABASE_URL`
- `REDIS_URL`

If both are blank, the bot processes fall back to isolated local stores. That is only a boot smoke test, not truthful multi-process papertrade.

## Papertrade Values

Keep these set for papertrade:

- `LIVE_TRADING=false`
- `DRY_RUN=false`
- `TRADING_ENABLED=false`
- `LIVE_TEST_MODE=false`
- `ROLLOUT_POSTURE=paper_only`
- `SIGNER_MODE=disabled`

Required for truthful multi-process papertrade:

- `DATABASE_URL`
- `REDIS_URL`
- `CONTROL_TOKEN`
- `OPERATOR_READ_TOKEN`
- `CONTROL_SERVICE_URL`

Required only if you want the main LLM path exercised:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL=https://openrouter.ai/api/v1`
- `OPENAI_MODEL=qwen/qwen3.6-plus:free`

May remain blank for a boot smoke test:

- `RPC_URL` when `RPC_MODE=stub`
- `SIGNER_URL`
- `SIGNER_AUTH_TOKEN`
- `SIGNER_KEY_ID`
- `JUPITER_API_KEY`
- `MORALIS_API_KEY`
- `DASHBOARD_SESSION_SECRET`
- `DASHBOARD_OPERATOR_DIRECTORY_JSON`
- `WALLET_ADDRESS` can stay as the placeholder in the example until you want wallet-snapshot validation

## Local Files

- `bot/.env.papertrade` from `.env.papertrade.example`
- `bot/.env.live-local` from `.env.live-local.example`
- `dashboard/.env.local` from `dashboard/.env.example`
- `signer/.env.local` from `signer/.env.example`

`bot/` processes do not dotenv-load on their own.
`dashboard/.env.local` is auto-loaded by Next.
The signer is required only for live-limited mode.

## Generate Local Auth Tokens

`CONTROL_TOKEN` and `OPERATOR_READ_TOKEN` are local secrets. They must be different values.

Create them with the OS-specific commands in:

- [`docs/local-run-macos.md`](C:/workspace/main_projects/dotBot/bobbyExecute/docs/local-run-macos.md)
- [`docs/local-run-windows.md`](C:/workspace/main_projects/dotBot/bobbyExecute/docs/local-run-windows.md)

Write the generated values into:

- `bot/.env.papertrade`
- `bot/.env.live-local`
- `dashboard/.env.local` when the dashboard proxies control locally

Example values:

- `CONTROL_TOKEN=<generated-token-1>`
- `OPERATOR_READ_TOKEN=<generated-token-2>`

Do not reuse the same value for both tokens.

## Use Qwen 3.6 Free via OpenRouter

The main LLM uses the `OPENAI_*` fields, even when the backend is OpenRouter:

- `LAUNCH_MODE=openai`
- `OPENAI_API_KEY=<openrouter-api-key>`
- `OPENAI_BASE_URL=https://openrouter.ai/api/v1`
- `OPENAI_MODEL=qwen/qwen3.6-plus:free`
- `OPENROUTER_HTTP_REFERER=http://127.0.0.1`
- `OPENROUTER_X_TITLE=BobbyExecute`
- `LAUNCH_MODE=openai` is a profile label in the env examples; the runtime gate is the `OPENAI_*` block above.

Optional advisory LLM handling:

- `ADVISORY_LLM_ENABLED=false` by default
- `ADVISORY_LLM_PROVIDER=openai` uses the same `OPENAI_*` settings above
- There is no separate `ADVISORY_LLM_MODEL` env key in this repo
- If you intentionally switch the advisory provider to `qwen`, use `QWEN_API_KEY`, `QWEN_BASE_URL`, and `QWEN_MODEL=qwen/qwen3.6-plus:free`

For truthful local papertrade, keep `OPENAI_API_KEY` real if you want the main LLM path exercised.
Leave `ADVISORY_LLM_ENABLED=false` unless you are intentionally testing the advisory path.

## What Belongs Where

- Shared concepts and safety boundaries belong here.
- macOS shell commands belong in `docs/local-run-macos.md`.
- Windows PowerShell commands belong in `docs/local-run-windows.md`.

## Operator Rules

- Keep papertrade, dry mode, and live-limited separate.
- Keep live-limited readiness gated by `live:preflight`.
- Keep root onboarding references pointed at this index, not at OS-specific pages directly.
