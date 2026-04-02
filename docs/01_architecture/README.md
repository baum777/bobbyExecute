# BobbyExecute Architecture

Scope: full system architecture and authority boundaries.  
Authority: authoritative for architectural terminology and layer separation.

## 1. Objective

Define BobbyExecute as a layered system with one decision authority:

```text
deterministic core + MCP skill plane + shadow cognitive sidecars
```

## 2. Current Truth

### Implemented

- deterministic runtime authority in `bot/src/core/engine.ts`
- runtime entrypoints in `bot/src/server/run.ts`, `bot/src/control/run.ts`, and `bot/src/worker/run.ts`
- typed pre-authority contracts in `bot/src/discovery/` and `bot/src/intelligence/`
- control-plane and dashboard read/write surfaces
- shadow sidecar loop in `bot/src/runtime/sidecar/worker-loop.ts`
- remote signer boundary in `bot/src/adapters/signer/` and `signer/`

### Implemented but non-authoritative

- `DataQualityV1`, `CQDSnapshotV1`, `ConstructedSignalSetV1`, and `ScoreCardV1` builders
- advisory LLM decision annotation route
- trend-reversal observation worker and watch-candidate registry
- dashboard KPI projections and control summaries

### Not yet wired

- use of the newer pre-authority artifact chain as the active runtime decision input
- a real MCP server for tools/resources/prompts
- any LLM influence on scoring, policy, or execution authority

### Legacy

- `bot/src/core/orchestrator.ts`
- `bot/src/core/tool-router.ts`
- repo-local skill manifests in `packages/skills/`

Legacy does not mean authoritative.

## 3. Gaps

- The target deterministic-core chain exists as contracts/builders but is not yet the authority pipeline end to end.
- The repo has local skill descriptors, not a verified MCP plane.
- Some operator surfaces remain mixed canonical and derived truth.
- Naming drift remains in code: `Engine`, `Orchestrator`, and `ToolRouter` predate the current model.

## 4. Constraints / Non-Goals

- No LLM output may create or override decision authority.
- No second scoring or policy path may exist outside the deterministic core.
- No documentation may describe a feature as wired unless a concrete code path exists.
- This document does not claim unrestricted live-trading readiness.

## 5. Reuse of Existing Skills / Tools

Verified reusable repo assets used for this architecture map:

- shared-core consumer manifest in `.codex/shared-core-consumer.json`
- consumer overlays in `docs/codex-workflow-consumer.md` and `docs/repo-specific-canonical-sources.md`
- repo-native contract owners under `bot/src/discovery/`, `bot/src/intelligence/`, and `bot/src/core/contracts/`

The architecture rewrite reuses those verified surfaces. It does not invent a new contract layer.

## 6. Proposed Implementation Model

### Deterministic core

Authoritative layer.

```text
SourceObservation
-> DiscoveryEvidence
-> CandidateToken
-> UniverseBuildResult
-> DataQualityV1
-> CQDSnapshotV1
-> ConstructedSignalSetV1
-> ScoreCardV1
-> pattern / policy / decision / execution
```

Rules:

- deterministic
- replayable
- fail-closed
- journal-first
- no LLM influence

Current code truth:

- contracts/builders exist from `SourceObservation` through `ScoreCardV1`
- active runtime authority still uses the older `ingest -> signal -> risk -> chaos -> execute -> verify -> journal -> monitor` engine flow
- convergence is incomplete

### MCP skill plane

Advisory and cognitive layer.

Intended model:

- tools for explicit execution
- resources for bounded context retrieval
- prompts for named workflows

Current code truth:

- local skill manifests and instructions exist in `packages/skills/`
- `ToolRouter` exists as legacy scaffolding
- no verified MCP server or transport is present

Therefore the MCP skill plane is an architectural target with partial local building blocks, not a live authority plane.

### Shadow cognitive sidecars

Advisory-only layer.

Current components:

- LLM watch-candidate discovery parsing
- deterministic `TrendReversalMonitorWorker`
- sidecar worker loop and watch registry
- optional advisory decision explanation route

Prohibited:

- decision creation
- score mutation
- policy override
- execution trigger

## 7. Acceptance Criteria

- one decision authority is explicit
- deterministic core is separated from skill-plane and sidecar surfaces
- advisory surfaces are labeled non-authoritative
- implemented versus unwired surfaces are distinguished
- legacy names do not create false authority

## 8. Verification / Tests

Repository evidence used:

- `bot/src/core/engine.ts`
- `bot/src/runtime/create-runtime.ts`
- `bot/src/runtime/live-runtime.ts`
- `bot/src/discovery/contracts/*.ts`
- `bot/src/intelligence/**/contracts/*.ts`
- `bot/src/runtime/sidecar/worker-loop.ts`
- `bot/src/server/routes/kpi-advisory.ts`
- `packages/skills/**/manifest.json`

## 9. Risks / Rollback

- If future docs claim the MCP plane is live before a real server exists, dual truth returns.
- If future docs treat dashboard projections as canonical metrics without provenance, operator confidence becomes inflated again.
- If pre-authority builders are described as runtime authority before integration, the architecture becomes ambiguous.

## 10. Next Step

Converge the active runtime authority path onto the newer deterministic artifact chain without opening any parallel decision path.
