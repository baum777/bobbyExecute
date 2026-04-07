# Staging Live-Preflight Runbook

Scope: operator procedure for environment-backed readiness proof using `npm --prefix bot run live:preflight`.
Authority: operational readiness documentation only. This file does not authorize live production trading or change runtime authority.

## 1. Objective

Verify that a staging environment can satisfy the repo's live-test guardrails and boot-critical file-state requirements, then capture the evidence needed for sign-off.

## 2. Current Truth

Verified code surfaces that define the preflight gate:

- `bot/package.json` wires `live:preflight` to `npm run premerge && npm run build && node dist/scripts/live-test-preflight.js`.
- `bot/src/scripts/live-test-preflight.ts` loads config, rejects non-live execution mode, inspects worker-disk recovery, and prints the success or fail-closed log lines.
- `bot/src/config/load-config.ts`, `bot/src/config/safety.ts`, and `bot/src/config/config-schema.ts` enforce the live-mode env gates, token distinctness, `ts-env` runtime policy authority, and live-test caps.
- `bot/src/runtime/live-runtime.ts` later consumes the same safety state at runtime start; preflight is necessary but not sufficient for running the worker.
- `bot/src/runtime/live-control.ts` models the live-test round state machine that runtime start uses after preflight.
- `bot/src/recovery/worker-state-manifest.ts` derives worker-local artifact paths from `JOURNAL_PATH`.
- `.env.example` and `render.yaml` are intentionally non-live by default and must be overridden in the rehearsal environment.

Important truth boundary:

- `LIVE_TRADING=true` resolves execution mode to `live`.
- `DRY_RUN` is not the live safety gate once `LIVE_TRADING=true` is set.
- This runbook proves staging readiness for the live-test guardrails, not live production authorization.

## 3. Gaps

- Repo-only readiness assessment is complete, but environment-backed proof remains pending.
- Operators still need a single checked-in procedure that names the required env, files, commands, and evidence capture steps without implying production approval.

## 4. Constraints / Non-Goals

- No secrets are stored in this repo.
- No runtime authority behavior is changed here.
- No second decision path is introduced.
- No export widening is introduced.
- No live safety prerequisite is weakened.
- No success is claimed without a real environment-backed run.

## 5. Reuse of Existing Skills / Tools

This runbook reuses verified repository surfaces instead of inventing new logic:

- `npm --prefix bot run live:preflight`
- `npm --prefix bot run recovery:worker-state`
- `bot/src/scripts/live-test-preflight.ts`
- `bot/src/recovery/worker-state-manifest.ts`
- `bot/src/runtime/live-runtime.ts`
- `bot/src/runtime/live-control.ts`

## 6. Staging Live-Preflight Procedure

Companion preparation and evidence artifacts:

- `docs/06_journal_replay/boot-critical-artifact-preparation.md`
- `docs/06_journal_replay/staging-live-preflight-evidence-template.md`

### 6.1 Required env vars

| Variable | Required value | Why it is required |
|---|---|---|
| `LIVE_TRADING` | `true` | Sets execution mode to live. |
| `TRADING_ENABLED` | `true` | Live trading requires the trading feature flag to be on. |
| `LIVE_TEST_MODE` | `true` | Live preflight requires the live-test guardrail mode. |
| `RPC_MODE` | `real` | Live trading requires real RPC mode. |
| `RUNTIME_POLICY_AUTHORITY` | `ts-env` | YAML is not authoritative at boot. |
| `WALLET_ADDRESS` | non-empty wallet address | Required for live mode. |
| `SIGNER_MODE` | `remote` | Live mode requires a remote signing boundary. |
| `SIGNER_URL` | valid URL | Required when `SIGNER_MODE=remote`. |
| `SIGNER_AUTH_TOKEN` | non-empty secret | Required when `SIGNER_MODE=remote`. |
| `CONTROL_TOKEN` | non-empty secret | Required live-control token. |
| `OPERATOR_READ_TOKEN` | non-empty secret | Required operator-read token. |
| `MORALIS_API_KEY` | non-empty secret | Required live-mode adapter input. |
| `JUPITER_API_KEY` | non-empty secret | Required live-mode adapter input. |
| `JOURNAL_PATH` | mounted journal path | Drives the file-backed worker state check. |

### 6.2 Required distinct token relationships

| Rule | Why |
|---|---|
| `CONTROL_TOKEN` must differ from `OPERATOR_READ_TOKEN` | The code fails closed if they are equal. |
| `SIGNER_AUTH_TOKEN` should remain separate from control and operator secrets | The current code requires presence, but the signing boundary should stay isolated. |

### 6.3 Required service endpoints

| Endpoint | Required state | Notes |
|---|---|---|
| `SIGNER_URL` | required | Use the staging signer endpoint. The config gate only requires a valid URL, but the documented boundary is remote signing. |
| `RPC_URL` | explicit staging value strongly recommended | The config defaults to mainnet-beta, but staging should use an explicit live RPC target. |
| `MORALIS_BASE_URL` | optional override | Default is `https://solana-gateway.moralis.io`. |
| `JUPITER_QUOTE_URL` | optional override | Default is `https://api.jup.ag/swap/v1`. |
| `JUPITER_SWAP_URL` | optional override | Default is `https://api.jup.ag/swap/v1`. |

### 6.4 Required file-backed artifacts under `JOURNAL_PATH`

Let `base` be `JOURNAL_PATH` with a trailing `.jsonl` removed.

| Artifact path | Kind | Boot critical |
|---|---|---|
| `${base}.jsonl` | worker journal | no |
| `${base}.actions.jsonl` | paper action log | no |
| `${base}.runtime-cycles.jsonl` | runtime cycle summaries | no |
| `${base}.incidents.jsonl` | incident journal | no |
| `${base}.execution-evidence.jsonl` | execution evidence | no |
| `${base}.kill-switch.json` | kill switch state | yes |
| `${base}.live-control.json` | live control state | yes |
| `${base}.daily-loss.json` | daily loss state | yes |
| `${base}.idempotency.json` | idempotency cache | yes |

Boot-critical files must exist, be non-empty, and parse to the expected shapes. If any are missing or invalid, live preflight must fail closed.

### 6.5 Required runtime mode values

| Setting | Required value | Notes |
|---|---|---|
| execution mode | `live` | Derived from `LIVE_TRADING=true`. |
| RPC mode | `real` | Required for live trading. |
| live-test mode | `true` | Required for preflight and runtime start. |
| runtime policy authority | `ts-env` | The runtime is not allowed to boot under YAML authority. |
| rollout posture | optional; if set, `micro_live` or `staged_live_candidate` | `paper_only` and `paused_or_rolled_back` are fail-closed states. |

### 6.6 Optional but strongly recommended explicit overrides

| Variable | Suggested value | Why it helps |
|---|---|---|
| `LIVE_TEST_MAX_CAPITAL_USD` | set explicitly | Default is `100`; minimum is `1`. |
| `LIVE_TEST_MAX_TRADES_PER_DAY` | set explicitly | Default is `1`; minimum is `1`. |
| `LIVE_TEST_MAX_DAILY_LOSS_USD` | set explicitly | Default is `50`; minimum is `0`. |
| `ROLLOUT_POSTURE` | `micro_live` or `staged_live_candidate` | Makes the live posture explicit instead of implicit. |
| `JOURNAL_PATH` | mounted staging disk path, such as `/var/data/journal.jsonl` | Avoids accidentally using the repo-local default path. |
| `RPC_URL` | staging live RPC endpoint | Makes the live RPC target explicit. |
| `MORALIS_BASE_URL` | staging-compatible Moralis endpoint | Avoids ambiguity about adapter routing. |
| `JUPITER_QUOTE_URL` | staging-compatible Jupiter endpoint | Avoids ambiguity about adapter routing. |
| `JUPITER_SWAP_URL` | staging-compatible Jupiter endpoint | Avoids ambiguity about adapter routing. |

### 6.7 Hard fail conditions

- `npm run premerge` fails.
- `npm run build` fails.
- `LIVE_TRADING` is missing or not `true`.
- `RUNTIME_POLICY_AUTHORITY` is not `ts-env`.
- `TRADING_ENABLED` is not `true`.
- `LIVE_TEST_MODE` is not `true`.
- `RPC_MODE` is not `real`.
- `SIGNER_MODE` is not `remote`.
- `SIGNER_URL`, `SIGNER_AUTH_TOKEN`, `WALLET_ADDRESS`, `CONTROL_TOKEN`, `OPERATOR_READ_TOKEN`, `MORALIS_API_KEY`, or `JUPITER_API_KEY` are missing.
- `CONTROL_TOKEN` equals `OPERATOR_READ_TOKEN`.
- `ROLLOUT_POSTURE` is invalid.
- `ROLLOUT_POSTURE` is `paper_only` or `paused_or_rolled_back` when attempting to proceed from preflight to live runtime start (fail-closed live posture).
- Any boot-critical file under `JOURNAL_PATH` is missing or structurally invalid.

### 6.8 Exact execution order

1. Prepare a staging-only environment overlay outside the repo. Do not edit checked-in `.env.example` for rehearsal secrets.
2. Set the live-mode and policy env vars first: `RUNTIME_POLICY_AUTHORITY=ts-env`, `LIVE_TRADING=true`, `TRADING_ENABLED=true`, `LIVE_TEST_MODE=true`, and `RPC_MODE=real`.
3. Inject the remaining required inputs: `WALLET_ADDRESS`, `SIGNER_MODE=remote`, `SIGNER_URL`, `SIGNER_AUTH_TOKEN`, `CONTROL_TOKEN`, `OPERATOR_READ_TOKEN`, `MORALIS_API_KEY`, `JUPITER_API_KEY`, and `JOURNAL_PATH`.
4. Provision the mounted disk or directory for `JOURNAL_PATH`, then create or restore the nine required artifact files above.
5. Apply explicit staging overrides such as `ROLLOUT_POSTURE=micro_live`, `RPC_URL`, and the three live-test caps.
6. Optional but useful: run `npm --prefix bot run recovery:worker-state` to inspect the same file-backed state view that live preflight consumes.
7. Record preflight inputs and recovery evidence in `docs/06_journal_replay/staging-live-preflight-evidence-template.md`.
8. Run `npm --prefix bot run live:preflight` from the repository root.
9. Record preflight output and gate decision in the same evidence template.
10. If the command succeeds and you are advancing the worker, start the live runtime separately and capture the live-test round transition evidence from `bot/src/runtime/live-runtime.ts` and `bot/src/runtime/live-control.ts`.

### 6.9 Operator checklist

- [ ] Staging overlay prepared outside the repo.
- [ ] Live-mode env vars set.
- [ ] Control and operator tokens are distinct.
- [ ] Signer and RPC endpoints are available.
- [ ] `JOURNAL_PATH` is mounted and seeded.
- [ ] Boot-critical files are present and valid.
- [ ] `npm --prefix bot run live:preflight` completed successfully.
- [ ] Success JSON report captured.
- [ ] Fail-closed evidence captured if the run rejected.

## 7. Acceptance Criteria

The staging rehearsal is acceptable only if all of the following are true:

- The command exits with code `0`.
- The output contains `[live-preflight] Live-test configuration validated ...`.
- The output contains `[live-preflight] Preflight passed`.
- The JSON report shows:
  - `executionMode:"live"`
  - `rpcMode:"real"`
  - `liveTestEnabled:true`
  - expected live-test cap values
  - `workerJournalPath` pointing at the staging disk mount
  - `workerSafeBoot:true`
  - `workerBootCriticalMissing:[]`
  - `workerBootCriticalInvalid:[]`
- A redacted environment record shows the rehearsal used a staging overlay, not the checked-in defaults.
- If runtime start is also performed, the live-test round transition evidence is captured separately.

## 8. Verification / Evidence

### Success evidence to capture

- Exit code `0`.
- Full stdout and stderr for the `live:preflight` command.
- The JSON report line printed by `[live-preflight] Live-test configuration validated ...`.
- The final `[live-preflight] Preflight passed` line.
- A record of the staging env overlay values, redacted for secrets.
- If runtime start is performed, the first `preflighted` and `running` live-test round transitions.

### Fail-closed evidence to capture

- Any line that starts with `[live-preflight] Preflight failed:`.
- Exit code non-zero.
- Any `Config validation failed (fail-closed)` error text.
- Any `Live-test preflight requires LIVE_TRADING=true. Current executionMode='dry'.` rejection.
- Any missing or invalid boot-critical artifact reported by the worker-disk recovery check.

## 9. Risks / Rollback

- Misreading `DRY_RUN` as a live safety control would create false confidence; do not rely on it once `LIVE_TRADING=true` is set.
- Missing or malformed boot-critical files must block the run, not degrade silently.
- This runbook is readiness documentation only; it does not replace governed production authorization.

## 10. Next Step

Use this runbook for the next environment-backed staging rehearsal. If the rehearsal passes, continue to the worker start gate only with separate operator approval and separate evidence capture.

Before any live-stage release decision, consult `docs/06_journal_replay/operator-release-gate-and-incident-runbook.md` and verify `GET /control/release-gate` alongside `GET /control/status` and `GET /health`.


Historical evidence index: C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/evidence-records-index.md.

