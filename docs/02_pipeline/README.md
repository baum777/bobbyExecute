# BobbyExecute Pipeline

Scope: stage-by-stage data flow and contract ownership.  
Authority: authoritative for pipeline boundaries; not itself a runtime control surface.

## 1. Objective

Describe the actual BobbyExecute pipeline in a way that separates:

- current authority flow
- implemented pre-authority contracts
- planned convergence work

## 2. Current Truth

### Current authority pipeline

Implemented in `bot/src/core/engine.ts` and the runtime controllers:

```text
ingest -> signal -> risk -> chaos -> execute -> verify -> journal -> monitor
```

### Current pre-authority deterministic-core pipeline

Implemented as contracts/builders, not yet the active authority flow:

```text
SourceObservation
-> DiscoveryEvidence
-> CandidateToken
-> UniverseBuildResult
-> DataQualityV1
-> CQDSnapshotV1
-> ConstructedSignalSetV1
-> ScoreCardV1
```

## 3. Gaps

- The new contract chain is real but not yet the runtime decision input.
- Pattern, policy, and execution still attach to the older runtime flow.
- Replay artifacts exist, but there is no verified public replay API route.

## 4. Constraints / Non-Goals

- No new parallel decision path.
- No sidecar or LLM artifact may skip directly into decision/execution.
- No contract duplication between `core/contracts` and higher-level wrappers.

## 5. Reuse of Existing Skills / Tools

This pipeline map reuses verified contract owners instead of redefining them:

- `bot/src/discovery/contracts/`
- `bot/src/intelligence/universe/contracts/`
- `bot/src/intelligence/quality/contracts/`
- `bot/src/intelligence/cqd/contracts/`
- `bot/src/intelligence/signals/contracts/`
- `bot/src/intelligence/scoring/contracts/`
- `bot/src/core/contracts/decision-envelope.ts`

## 6. Proposed Implementation

## Stage Map

| Stage | Inputs | Outputs | Authority | Current status |
|---|---|---|---|---|
| `SourceObservation` | source payloads | typed source observations | pre-authority | implemented |
| `DiscoveryEvidence` | observations | grouped evidence bundle | pre-authority | implemented |
| `CandidateToken` | evidence, discovery reasons | candidate token record | pre-authority | implemented |
| `UniverseBuildResult` | candidate + normalized features | inclusion/exclusion result | pre-authority | implemented |
| `DataQualityV1` | evidence + candidates + universe | fail-closed quality gate | pre-authority | implemented |
| `CQDSnapshotV1` | quality-passing evidence chain | compact deterministic reasoning boundary | pre-authority | implemented |
| `ConstructedSignalSetV1` | CQD + forensics inputs | constructed signals | pre-authority | implemented |
| `ScoreCardV1` | constructed signals | score card | pre-decision | implemented |
| pattern / policy / decision | score card and downstream rules | decision authority | authority | partially implemented through older runtime path |
| execution / verify / journal | decision envelope + trade intent | execution evidence and journal | authority | implemented |

## Current authority path detail

| Runtime stage | Primary code path | Inputs | Outputs | Notes |
|---|---|---|---|---|
| ingest | `Engine.run()` + ingest handler | market snapshot, wallet snapshot | validated ingest state | authority |
| signal | `runScoringEngine`, `recognizePatterns`, `runSignalEngine` in `live-runtime.ts` | market-derived signal pack | trade intent or block | authority |
| risk | `runRiskEngine` | intent, market, wallet | allow/block | authority |
| chaos | `runChaosGate` | intent + market | allow/block | authority |
| execute | execution handler | trade intent | execution report | authority |
| verify | RPC verification | intent + execution report | verification report | authority |
| journal | journal writer | cycle artifacts | append-only journal | authority |
| monitor | runtime snapshot writers | runtime state | visibility snapshot | authority-adjacent, not decision-creating |

## 7. Acceptance Criteria

- every stage has explicit inputs and outputs
- pre-authority and authority stages are separated
- no stage implies hidden LLM or sidecar decision power
- convergence gaps are explicit

## 8. Verification / Tests

Verified files:

- `bot/src/core/engine.ts`
- `bot/src/runtime/live-runtime.ts`
- `bot/src/runtime/paper-runtime.ts`
- `bot/src/intelligence/quality/build-data-quality.ts`
- `bot/src/intelligence/cqd/build-cqd.ts`
- `bot/src/intelligence/signals/build-constructed-signal-set.ts`
- `bot/src/intelligence/scoring/build-score-card.ts`

## 9. Risks / Rollback

- Referring to `ScoreCardV1` as decision authority before policy/decision integration would create false authority.
- Referring to dashboard decision views as canonical decision journals would create dual truth.

## 10. Next Step

Replace the older runtime signal/risk input chain with the typed deterministic-core artifacts incrementally, preserving one decision authority throughout.
