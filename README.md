# BobbyExecute

Scope: repository-level architecture summary.  
Authority: authoritative for documentation structure and terminology; detailed governance lives in `docs/05_governance/README.md`.

## Objective

BobbyExecute is a governance-first Solana trading system being converged onto this model:

```text
deterministic core + MCP skill plane + shadow cognitive sidecars
```

## Current Truth

Implemented today:

- a deterministic runtime authority path in `bot/src/core/engine.ts`, `bot/src/runtime/*.ts`, and the control/runtime/server entrypoints
- typed pre-authority contracts for discovery, data quality, CQD, constructed signals, scoring, and trend-reversal observation
- a shadow sidecar loop for watch-candidate discovery and trend-reversal monitoring
- a separate remote signer boundary for live signing

Implemented but not authoritative:

- dashboard and KPI surfaces
- advisory LLM explanation route
- trend-reversal observation worker outputs

Partially implemented or unwired:

- the full deterministic-core convergence from `SourceObservation` through `ScoreCardV1` into runtime authority
- the MCP skill plane as a real MCP server with tools, resources, prompts, routing, and cache policy

Legacy but still present in code:

- `ToolRouter`
- `Orchestrator`
- repo-local `packages/skills/*` manifests and instructions

These legacy surfaces are not treated as decision authority unless explicitly wired into the deterministic runtime path.

## System Model

```text
External sources
  -> pre-authority discovery artifacts
     SourceObservation
     -> DiscoveryEvidence
     -> CandidateToken
     -> UniverseBuildResult
     -> DataQualityV1
     -> CQDSnapshotV1
     -> ConstructedSignalSetV1
     -> ScoreCardV1
  -> deterministic decision authority
     policy / risk / decision envelope / execution / verify / journal

Parallel non-authority lanes
  -> MCP skill plane
  -> shadow cognitive sidecars
  -> dashboard and advisory views
```

## Layer Summary

### 1. Deterministic core

- Only decision authority.
- Must stay replayable, fail-closed, and free of LLM influence.
- Current authority path is the runtime engine flow in `bot/src/core/engine.ts` and `bot/src/runtime/live-runtime.ts`.
- The newer pre-authority contracts under `bot/src/discovery/` and `bot/src/intelligence/` are implemented but not yet the active authority pipeline.

### 2. MCP skill plane

- Intended cognitive layer for typed tools, resources, and prompts.
- Current repo truth is narrower: local skill manifests exist in `packages/skills/`, and a legacy `ToolRouter` exists in `bot/src/core/tool-router.ts`.
- No verified MCP server, transport, resource registry, prompt registry, or cache/routing layer is wired today.

### 3. Shadow cognitive sidecars

- Advisory only.
- Includes LLM watch-candidate discovery parsing, deterministic trend-reversal monitoring, replay-oriented observation building, and optional decision annotation.
- Sidecar outputs cannot create decisions, override scores, or trigger execution.

## Authority Rules

- Only the deterministic runtime path may create decision authority.
- Dashboard, control, skill, sidecar, and advisory surfaces are never trade-decision authority.
- Missing, stale, rejected, or inconsistent critical data must block or degrade; it must not silently pass.
- Critical artifacts must be serializable, replayable, and journalable.
- Legacy surfaces may exist in code, but they are not canonical merely because they are exported.

## Pipeline Summary

Current authority pipeline:

```text
ingest -> signal -> risk -> chaos -> execute -> verify -> journal -> monitor
```

Target deterministic-core convergence:

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

Truthful status:

- `SourceObservation` through `ScoreCardV1` builders exist
- the engine/runtime authority path is still driven by the older ingest/signal/risk flow
- convergence between those two paths is not complete

## Canonical Docs

- `docs/01_architecture/README.md`
- `docs/02_pipeline/README.md`
- `docs/03_skill_plane/README.md`
- `docs/04_sidecars/README.md`
- `docs/05_governance/README.md`
- `docs/06_journal_replay/README.md`
- `docs/codex-workflow-consumer.md`
- `docs/repo-specific-canonical-sources.md`

## Repo Layout

```text
bot/        deterministic runtime, control plane, server, contracts
dashboard/  operator UI and server-side control proxy
signer/     remote signing boundary for live trading
packages/   local skill manifests and instructions
docs/       canonical repository documentation
governance/ local governance overlays and agent rules
dor-bot/    legacy Python subtree
```

## Verification

Run from `bot/`:

```bash
npm install
npm run lint
npm test
npm run premerge
npm run build
```

Verified command truth:

- `npm run premerge` currently resolves to `npm run lint && npm test`
- live mode additionally depends on remote-signer, real RPC, and control posture gates

## Next Read

- architecture: `docs/01_architecture/README.md`
- authority and fail-closed rules: `docs/05_governance/README.md`
- replay and artifact chain: `docs/06_journal_replay/README.md`
