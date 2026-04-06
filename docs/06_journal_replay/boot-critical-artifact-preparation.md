# Boot-Critical Artifact Preparation Guide

Scope: operator preparation for boot-critical worker artifacts before staging `live:preflight`.  
Authority: preparation and evidence guidance only. This document does not authorize runtime start or production trading.

## 1. Objective

Convert the current blocked-execution truth into a repeatable operator procedure for preparing and validating boot-critical files under `JOURNAL_PATH`.

## 2. Current Truth

Verified code sources:

- `bot/src/recovery/worker-state-manifest.ts`
- `bot/src/runtime/live-runtime.ts`
- `bot/src/scripts/live-test-preflight.ts`
- `docs/06_journal_replay/staging-live-preflight-runbook.md`

Observed blocked state:

- `npm --prefix bot run recovery:worker-state` returned `status: "not_ready"` and `safeBoot: false`.
- Missing boot-critical artifacts were:
  - kill switch state
  - live control state
  - daily loss state
  - idempotency cache

## 3. Boot-Critical Files Under `JOURNAL_PATH`

Let:

- `journalPath = JOURNAL_PATH`
- `basePath = JOURNAL_PATH` with trailing `.jsonl` removed

The required boot-critical files are:

| Required file | Label in recovery report | Why boot blocks if absent/invalid |
|---|---|---|
| `${basePath}.kill-switch.json` | `kill switch state` | Runtime requires hydrated kill-switch state; missing state fails closed. |
| `${basePath}.live-control.json` | `live control state` | Runtime requires hydrated live-control state; state is not inferred from Postgres. |
| `${basePath}.daily-loss.json` | `daily loss state` | Runtime requires durable daily-loss accounting state. |
| `${basePath}.idempotency.json` | `idempotency cache` | Runtime requires durable duplicate-suppression state. |

Important non-boot-critical but related file:

- `journalPath` itself (worker journal) is required for recovery drill evidence, but does not drive `safeBoot`.

## 4. Validation Semantics And Fail-Closed Conditions

`worker-state-manifest` enforces all boot-critical files as:

- present on disk
- non-empty
- parseable into expected typed structures

`safeBoot` is true only when:

- `bootCriticalMissing` is empty
- `bootCriticalInvalid` is empty

Fail-closed conditions:

- Any boot-critical file missing
- Any boot-critical file empty
- Any boot-critical file parse failure or missing required fields
- `live-test-preflight` receives `safeBoot=false` and aborts with a preflight error
- Runtime boot later aborts if any durable safety state cannot be loaded

## 5. Operator Preparation Procedure

1. Set `JOURNAL_PATH` to the staging-mounted path intended for the rehearsal.
2. Derive `basePath` by removing only a trailing `.jsonl` from `JOURNAL_PATH`.
3. Restore or seed the four boot-critical files at the exact `basePath`-derived paths above.
4. Verify each boot-critical file exists and is non-empty.
5. Run `npm --prefix bot run recovery:worker-state` and confirm:
   - `status: "ready"`
   - `safeBoot: true`
   - `bootCriticalMissing: []`
   - `bootCriticalInvalid: []`

## 6. Evidence To Capture Before `live:preflight`

Capture this before running `npm --prefix bot run live:preflight`:

- Resolved `JOURNAL_PATH` value used for the rehearsal
- Derived `basePath` and the four concrete boot-critical file paths
- For each boot-critical file: present/missing and non-empty status
- Full `recovery:worker-state` JSON output
- Explicit operator decision: proceed to `live:preflight` or hold

Use:

- `docs/06_journal_replay/staging-live-preflight-evidence-template.md`

to keep evidence capture consistent across runs.

## 7. Boundary Note

Boot-critical artifact presence and parseability are necessary but not sufficient for staging preflight success.

`live:preflight` also requires valid live secrets/services (for example signer, RPC, and required tokens). This guide does not provide environment-backed proof by itself.

Boot-critical JSON files under `bot/data/` are environment-local runtime state for rehearsal/operations. They are not portable evidence of live readiness across environments.


Historical evidence index: C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/evidence-records-index.md.

