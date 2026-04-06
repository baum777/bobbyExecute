# Staging Live-Preflight Evidence Template

Scope: fillable operator record for blocked-execution preparation, preflight execution, and pass/fail gating.  
Authority: evidence capture only. This template does not authorize runtime start or production trading.

## Run Metadata

- Date (UTC): `<YYYY-MM-DDTHH:MM:SSZ>`
- Operator: `<name-or-handle>`
- Environment: `<staging-env-name>`
- Commit SHA: `<git-sha>`

## Governance Source

- Active governance source: `meta_prompt_control_plane_bundle.zip`
- Control-plane order applied:
  1. `shared_prompt_contract_v2`
  2. `meta_prompt_control_plane_v2`
  3. `prompt_type_router_v2`
  4. `boundary_authority_validator_v1` (sensitive cases only)
  5. selected family: `prompt_migration_v2`
  6. `release_checklist.md`

## Environment Readiness

- Env readiness status: `<ready|blocked|partial>`
- Signer reachability: `<reachable|unreachable|not-tested>`
- RPC reachability: `<reachable|unreachable|not-tested>`
- Token distinctness (`CONTROL_TOKEN != OPERATOR_READ_TOKEN`): `<pass|fail|not-tested>`
- `JOURNAL_PATH`: `<absolute-path>`

## Boot-Critical Artifact Check

Derived `basePath` (`JOURNAL_PATH` minus trailing `.jsonl`): `<base-path>`

| Artifact | Required path | Present | Non-empty | Parse/status notes |
|---|---|---|---|---|
| kill switch state | `${basePath}.kill-switch.json` | `<yes/no>` | `<yes/no>` | `<notes>` |
| live control state | `${basePath}.live-control.json` | `<yes/no>` | `<yes/no>` | `<notes>` |
| daily loss state | `${basePath}.daily-loss.json` | `<yes/no>` | `<yes/no>` | `<notes>` |
| idempotency cache | `${basePath}.idempotency.json` | `<yes/no>` | `<yes/no>` | `<notes>` |

## `recovery:worker-state` Evidence

- Command: `npm --prefix bot run recovery:worker-state`
- Exit code: `<code>`
- Status: `<ready|not_ready|error>`
- `safeBoot`: `<true|false>`
- `bootCriticalMissing`: `<json-array>`
- `bootCriticalInvalid`: `<json-array>`
- Captured output path: `<path-or-link>`

## `live:preflight` Evidence

- Command: `npm --prefix bot run live:preflight`
- Exit code: `<code|not-run>`
- Result: `<pass|fail|blocked|not-run>`
- Key output lines:
  - `<line 1>`
  - `<line 2>`
- Captured output path: `<path-or-link>`

## Gate Decision

- Pass/Fail decision: `<pass|fail|hold>`
- Decision reason: `<short reason>`
- Follow-up action: `<next concrete action>`
- Approval scope note: `This record is blocked-execution preparation evidence unless environment-backed checks actually ran and passed.`


Note: completed evidence files are historical records and should be indexed in docs/06_journal_replay/evidence-records-index.md.

