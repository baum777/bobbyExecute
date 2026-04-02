# BobbyExecute Shadow Cognitive Sidecars

Scope: advisory sidecars, watchlist discovery, trend monitoring, and optional analysis overlays.  
Authority: advisory only. Not decision authority.

## 1. Objective

Define the shadow sidecar layer and keep its authority boundary explicit.

## 2. Current Truth

### Implemented

- `parseDowntrendWatchWorkerOutput()` in `bot/src/advisory/downtrend-watch-worker.ts`
- `TrendReversalMonitorWorker` and runner in `bot/src/intelligence/forensics/`
- sidecar loop and watch registry in `bot/src/runtime/sidecar/worker-loop.ts`
- optional advisory decision explanation route in `bot/src/server/routes/kpi-advisory.ts`

### Implemented but default-off or injection-based

- sidecar discovery worker provider input is injected; the default worker returns no candidates
- advisory LLM only loads when the advisory KPI route is called

### Not authoritative

- watch candidates
- trend-reversal observations
- advisory explanations
- dashboard annotations

## 3. Gaps

- There is no verified default live LLM discovery provider wired into runtime boot.
- Sidecar outputs are journaled, but they are not yet bridged into the deterministic-core artifact chain.
- Sidecars help observation and enrichment, not decision closure.

## 4. Constraints / Non-Goals

- no execution trigger
- no policy override
- no scoring override
- no decision-token creation
- no implicit live-trading enablement

## 5. Reuse of Existing Skills / Tools

Verified repo assets used here:

- `bot/src/advisory/downtrend-watch-worker.ts`
- `bot/src/runtime/sidecar/worker-loop.ts`
- `bot/src/intelligence/forensics/trend-reversal-monitor-runner.ts`
- `bot/src/intelligence/forensics/trend-reversal-monitor-worker.ts`
- `bot/src/server/routes/kpi-advisory.ts`

## 6. Proposed Implementation

## Sidecar model

```text
raw advisory input
-> watch candidates
-> watch registry
-> deterministic trend-reversal monitoring
-> shadow observations
-> journal / alert / advisory display
```

## Current component map

| Component | Inputs | Outputs | Boundary | Status |
|---|---|---|---|---|
| downtrend watch parser | raw discovery payload | `WatchCandidate[]` | advisory | implemented |
| watch registry | watch candidates | active/pruned candidate set | advisory | implemented |
| trend monitor runner | watch candidates + optional `DataQualityV1` | `TrendReversalObservationV1[]` | advisory | implemented |
| sidecar worker loop | discovery worker + monitor runner | sidecar journals and observations | advisory | implemented |
| decision advisory route | canonical v3 decision envelope | advisory explanation | advisory | implemented, optional |

## Output types

Allowed outputs:

- observations
- enrichment
- watchlists
- context blocks
- journal entries

Forbidden outputs:

- trade intents
- score mutations
- policy outcomes
- execution approvals

## 7. Acceptance Criteria

- every sidecar output is explicitly labeled advisory
- no path from sidecar output to execution authority is implied
- default-off and injected components are described truthfully

## 8. Verification / Tests

Verified files:

- `bot/src/advisory/downtrend-watch-worker.ts`
- `bot/src/runtime/sidecar/worker-loop.ts`
- `bot/src/intelligence/forensics/trend-reversal-monitor-runner.ts`
- `bot/src/intelligence/forensics/trend-reversal-monitor-worker.ts`
- `bot/src/server/routes/kpi-advisory.ts`

## 9. Risks / Rollback

- Treating sidecar observations as decision signals would create hidden authority.
- Treating the advisory route as a runtime dependency would overstate its importance; it is route-loaded and optional.

## 10. Next Step

If sidecar outputs are ever consumed downstream, the bridge must be typed, deterministic where applicable, and still non-authoritative unless explicitly promoted through the deterministic core.
