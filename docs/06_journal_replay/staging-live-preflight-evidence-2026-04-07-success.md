# Staging Live-Preflight Evidence — 2026-04-07

Scope: dated execution record proving the staged `live:preflight` checklist ran with a real staging overlay.
Authority: historical evidence only; canonical readiness claims must still be governed by committed truth.

## Run Metadata
- Date (UTC): `2026-04-07T04:59:00.445Z`
- Operator: `automation-agent-local`
- Environment: local staging overlay replicating Render staging (`RUNTIME_CONFIG_ENV=staging`, `LIVE_TRADING=true`, `RPC_MODE=real`, `ROLLOUT_POSTURE=micro_live`)
- Commit SHA: `cf2b97b4000bc93e70069433587f965e8cceeefe`

## Governance Source
- Active governance source: `meta_prompt_control_plane_bundle.zip`
- Control-plane order applied:
  1. `shared_prompt_contract_v2`
  2. `meta_prompt_control_plane_v2`
  3. `prompt_type_router_v2`
  4. `boundary_authority_validator_v1`
  5. selected family: `prompt_migration_v2`
  6. `release_checklist.md`

## Environment Readiness
- Env readiness status: `ready`
- Signer reachability: `not-tested`
- RPC reachability: `not-tested`
- Token distinctness (`CONTROL_TOKEN != OPERATOR_READ_TOKEN`): `pass`
- `JOURNAL_PATH`: `data/journal.jsonl`

## Boot-Critical Artifact Check
Derived `basePath` (`JOURNAL_PATH` minus `.jsonl`): `data/journal`

| Artifact | Required path | Present | Non-empty | Parse/status notes |
|---|---|---|---|---|
| kill switch state | `data/journal.kill-switch.json` | yes | yes | parsed via `FileSystemKillSwitchRepository`; `halted:false` is valid
| live control state | `data/journal.live-control.json` | yes | yes | parsed via `FileSystemLiveControlRepository`
| daily loss state | `data/journal.daily-loss.json` | yes | yes | parsed via `FileSystemDailyLossRepository`
| idempotency cache | `data/journal.idempotency.json` | yes | yes | parsed via `FileSystemIdempotencyRepository`

*Note: `data/journal.execution-evidence.jsonl` stays absent; it is not boot-critical and was reported as `recoveryDrillMissing` but did not block `safeBoot`.*

## `recovery:worker-state` Evidence
- Command: `npm --prefix bot run recovery:worker-state`
- Exit code: `0`
- Status: `ready`
- `safeBoot`: `true`
- `bootCriticalMissing`: `[]`
- `bootCriticalInvalid`: `[]`
- Captured output: the script emitted a JSON report that lists the four boot-critical files as present & valid.

## `live:preflight` Evidence
- Command: `node dist/scripts/live-test-preflight.js` (executed from `bot/` with the staging overlay above)
- Exit code: `0`
- Result: `pass`
- Key output lines:
  - `[live-preflight] Live-test configuration validated {"executionMode":"live","rpcMode":"real","liveTestEnabled":true,"rolloutPosture":"micro_live","preflightGate":"micro_live","workerSafeBoot":true}`
  - `[live-preflight] Preflight passed`
- Captured output path: `data/journal.live-preflight.json` (registered the same readiness report, `blockers:[]`, and `preflightGate=micro_live`).

## Gate Decision
- Pass/Fail decision: `pass`
- Decision reason: live-test preflight completed with `safeBoot=true`, `preflightGate=micro_live`, and zero blockers, confirming the staged guardrails.
- Follow-up action: continue with runtime start only after separate operator approval and new runtime evidence; this document covers the preflight gate alone.
- Approval scope note: this record documents the blocked-guards run; it does not imply live runtime execution beyond the prepared gate.
