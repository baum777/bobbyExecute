# Live Trade Onboarding Index

Start here only after papertrade works.

This is the live-limited, real-capital path. It still uses caps and a hard preflight gate, so it is not unconstrained production trading.

## Canonical Map

| Path | Role |
|---|---|
| `docs/06_journal_replay/staging-live-preflight-runbook.md` | Live trade onboarding index |
| `docs/06_journal_replay/staging-live-preflight-runbook-macos.md` | macOS live-limited commands |
| `docs/06_journal_replay/staging-live-preflight-runbook-windows.md` | Windows live-limited commands |
| `docs/local-run.md` | Papertrade onboarding index |
| `docs/06_journal_replay/operator-release-gate-and-incident-runbook.md` | Release / incident runbook |
| `docs/06_journal_replay/staging-live-preflight-evidence-template.md` | Evidence template |

## Current Truth

- `bot/package.json` wires `live:preflight` to `npm run premerge && npm run build && node dist/scripts/live-test-preflight.js`.
- `bot/src/scripts/live-test-preflight.ts` rejects non-live execution mode and inspects worker-disk recovery.
- `bot/src/config/load-config.ts`, `bot/src/config/safety.ts`, and `bot/src/config/config-schema.ts` enforce the live-mode env gates, token distinctness, `ts-env` runtime policy authority, and live-test caps.
- `bot/src/runtime/live-runtime.ts` later consumes the same safety state at runtime start; preflight is necessary but not sufficient for running the worker.
- `bot/src/runtime/live-control.ts` models the live-test round state machine that runtime start uses after preflight.
- `bot/src/recovery/worker-state-manifest.ts` derives worker-local artifact paths from `JOURNAL_PATH`.
- The checked-in env examples and `render.yaml` default the provider stack to `DISCOVERY_PROVIDER=dexscreener`, `MARKET_DATA_PROVIDER=dexpaprika`, `STREAMING_PROVIDER=dexpaprika`, and `MORALIS_ENABLED=false`; staging overrides still must supply the live-mode secrets and mounted state.
- The operator decision surface is documented in `operator-release-gate-and-incident-runbook.md`, including `GET /control/release-gate`, `GET /control/status`, and `GET /health`.

Important truth boundary:

- `LIVE_TRADING=true` resolves execution mode to `live`.
- `DRY_RUN` is not the live safety gate once `LIVE_TRADING=true` is set.
- If `DATABASE_URL` or `REDIS_URL` is blank, the runtime falls back to local in-memory/file state. That is useful for smoke tests, but it is not a truthful multi-process live run.
- `live:preflight` proves staging readiness for the live-test guardrails, not live production authorization.

## Local Auth Tokens And LLM Config

Local live-limited onboarding reuses the same token and LLM conventions as papertrade:

- Generate `CONTROL_TOKEN` and `OPERATOR_READ_TOKEN` with the OS-specific commands in `docs/local-run-macos.md` or `docs/local-run-windows.md`.
- Write those distinct values into `bot/.env.live-local` and `dashboard/.env.local`.
- The main LLM uses `OPENAI_*` fields, including `OPENAI_BASE_URL=https://openrouter.ai/api/v1` and `OPENAI_MODEL=qwen/qwen3.6-plus:free`, if you want the main LLM path exercised.
- `LAUNCH_MODE=openai` is a profile label in the env examples; the runtime gate is the `OPENAI_*` block above.
- `ADVISORY_LLM_ENABLED=false` remains the default.
- `ADVISORY_LLM_PROVIDER=openai` reuses the same `OPENAI_*` fields; this repo does not define a separate `ADVISORY_LLM_MODEL` env key.
- If you intentionally switch the advisory provider to `qwen`, use `QWEN_API_KEY`, `QWEN_BASE_URL`, and `QWEN_MODEL=qwen/qwen3.6-plus:free`.

## Shared Requirements

For live-limited mode, the bot env must include:

- `LIVE_TRADING=true`
- `TRADING_ENABLED=true`
- `LIVE_TEST_MODE=true`
- `RPC_MODE=real`
- `RUNTIME_POLICY_AUTHORITY=ts-env`
- `DISCOVERY_PROVIDER=dexscreener`
- `MARKET_DATA_PROVIDER=dexpaprika`
- `STREAMING_PROVIDER=dexpaprika`
- `MORALIS_ENABLED=false`
- `WALLET_ADDRESS` non-empty
- `SIGNER_MODE=remote`
- `SIGNER_URL` valid
- `SIGNER_AUTH_TOKEN` non-empty
- `CONTROL_TOKEN` non-empty
- `OPERATOR_READ_TOKEN` non-empty
- `JUPITER_API_KEY` non-empty
- `JOURNAL_PATH` mounted

Required distinct-token rule:

- `CONTROL_TOKEN` must differ from `OPERATOR_READ_TOKEN`.

Required file-backed artifacts:

- `${base}.kill-switch.json`
- `${base}.live-control.json`
- `${base}.daily-loss.json`
- `${base}.idempotency.json`

`base` is `JOURNAL_PATH` with a trailing `.jsonl` removed.

Hard fail conditions include:

- `npm run premerge` fails
- `npm run build` fails
- any required live-mode env is missing or invalid
- `CONTROL_TOKEN` equals `OPERATOR_READ_TOKEN`
- any boot-critical file under `JOURNAL_PATH` is missing or structurally invalid

## What Belongs Where

- Shared concepts, gates, and acceptance criteria belong here.
- macOS shell commands belong in `docs/06_journal_replay/staging-live-preflight-runbook-macos.md`.
- Windows PowerShell commands belong in `docs/06_journal_replay/staging-live-preflight-runbook-windows.md`.

## Operator Rules

- Keep live-limited separate from papertrade and dry mode.
- Keep `live:preflight` as the hard readiness gate.
- Keep release/incident handling in `operator-release-gate-and-incident-runbook.md`.
- Keep evidence capture in `staging-live-preflight-evidence-template.md`.
