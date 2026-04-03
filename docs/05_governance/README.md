# BobbyExecute Governance

Scope: authority rules, fail-closed behavior, isolation guarantees, and documentation truth rules.  
Authority: authoritative for repository-level governance language and architecture honesty.

## 1. Objective

Define the hard rules that keep BobbyExecute from developing dual truth or hidden authority.

## 2. Current Truth

### Authority surfaces

- deterministic runtime worker and engine decide whether a cycle may advance
- private control plane changes runtime posture and safety state
- public bot and dashboard surfaces are read-oriented views, not trade-decision authority

### Advisory surfaces

- sidecars
- advisory LLM route
- dashboard KPI projections
- local skills and tool-router scaffolding

### Mixed-fidelity truth surfaces

Some operator views are canonical and some are derived. They must stay labeled as such. Examples observed in code and prior audits:

- decision pages can be derived from action logs
- some KPI values can be defaulted, derived, or fall back to partial producers

That mixed-fidelity state is real and must be disclosed, not hidden.

## 3. Gaps

- legacy documents used to describe multiple competing authority stories
- some dashboard/control narratives implied stronger runtime truth than the producers support
- local skills and legacy orchestrator/tool-router naming could be mistaken for live authority unless labeled clearly

## 4. Constraints / Non-Goals

- no LLM authority
- no hidden scoring path
- no undocumented control path
- no claim of live readiness beyond verified gates

## 5. Reuse of Existing Skills / Tools

This governance document is aligned against verified repo surfaces:

- `bot/src/core/engine.ts`
- `bot/src/runtime/live-runtime.ts`
- `bot/src/server/routes/control.ts`
- `bot/src/server/routes/kpi.ts`
- `bot/src/server/routes/kpi-advisory.ts`
- `signer/README.md`

## 6. Proposed Implementation

## Hard rules

### Authority boundary rule

Only the deterministic pipeline may create decision authority and execution attempts.

### No dual truth rule

The repository must not describe:

- parallel decision systems
- hidden scoring paths
- LLM-driven implicit decisions

### Advisory isolation rule

Skill-plane, sidecar, and LLM outputs:

- cannot trigger execution
- cannot override scoring or policy
- cannot inject decision semantics into authority artifacts

### Fail-closed rule

Missing, stale, rejected, malformed, or inconsistent critical data must:

- block
- degrade
- or require manual review

It must never silently pass.

### Journal-first rule

Critical artifacts must remain:

- serializable
- replayable
- traceable

## Control model

| Surface | Purpose | Authority |
|---|---|---|
| public bot service | read-only health and KPI exposure | not decision authority |
| private control plane | runtime posture and operator control | safety authority, not trade-picking authority |
| runtime worker | cycle execution and decision advancement | decision authority |
| remote signer | signing boundary for live mode | execution boundary, not strategy authority |

## Documentation truth rules

- "implemented" means a verified code path exists
- "planned" means architectural intent only
- "legacy" means present but not canonical
- "advisory" means non-authoritative
- "derived" means built from secondary projections rather than canonical artifacts
- "unwired" means no verified producer/consumer path exists

## 7. Acceptance Criteria

- one authority path is explicit
- control plane is separated from trade-decision authority
- sidecars and skill plane are isolated
- documentation vocabulary is normalized

## 8. Verification / Tests

Verified files:

- `bot/src/runtime/create-runtime.ts`
- `bot/src/runtime/live-runtime.ts`
- `bot/src/server/run.ts`
- `bot/src/control/run.ts`
- `bot/src/worker/run.ts`
- `bot/src/server/routes/kpi-advisory.ts`
- `bot/src/runtime/sidecar/worker-loop.ts`

## 9. Risks / Rollback

- reverting to dashboard-first descriptions would reintroduce false confidence
- claiming local skills are live MCP authority would create dual truth
- treating control-plane mode changes as strategy authority would blur boundaries

## 10. Next Step

Keep all future doc and code changes aligned to this rule: only the deterministic core may decide; every other cognitive surface is advisory or control-only.
