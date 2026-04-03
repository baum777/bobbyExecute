# BobbyExecute Journal And Replay

Scope: artifact chain, replay posture, provenance rules, and learning constraints.  
Authority: authoritative for journal/replay terminology. Not a runtime mutation surface.

## 1. Objective

Describe the canonical artifact chain that preserves replayability and auditability.

## 2. Current Truth

Implemented durable or append-only artifacts include:

- journal entries
- action logs
- runtime cycle summaries
- incident records
- execution evidence
- runtime visibility snapshots
- sidecar journals

Implemented replay-related code exists in runtime controllers and repositories.

Not verified:

- a public replay API route currently exposed from the server
- any online learning loop that feeds live behavior back into authority logic

## 3. Gaps

- replay capability exists in code, but public replay exposure is not a documented server surface today
- some historical docs described richer replay/learning posture than the verified server routes support

## 4. Constraints / Non-Goals

- no artifact mutation masquerading as replay
- no live learning authority
- no unjournaled critical decision step

## 5. Reuse of Existing Skills / Tools

Verified repo assets:

- `bot/src/journal-writer/`
- `bot/src/persistence/journal-repository.ts`
- `bot/src/persistence/runtime-cycle-summary-repository.ts`
- `bot/src/persistence/execution-repository.ts`
- `bot/src/persistence/incident-repository.ts`
- `bot/src/persistence/runtime-visibility-repository.ts`
- `bot/src/runtime/live-runtime.ts`
- `bot/src/runtime/sidecar/worker-loop.ts`

## 6. Proposed Implementation

## Artifact chain

```text
authority cycle
-> decision envelope
-> execution / verification artifacts
-> journal entry
-> cycle summary
-> incident and visibility projections

sidecar lane
-> watch candidate journal
-> trend observation journal
```

## Replay posture

| Artifact | Producer | Authority class | Replay value |
|---|---|---|---|
| journal entry | engine/runtime/sidecar writers | canonical for recorded step output | high |
| action log | observability layer | derived support surface | medium |
| runtime cycle summary | runtime persistence | canonical runtime summary | high |
| incident record | observability/persistence | canonical incident evidence | high |
| execution evidence | execution repository | canonical execution evidence | high |
| runtime visibility snapshot | worker visibility persistence | canonical worker visibility | high |

## Learning constraints

Allowed:

- offline analysis
- replay-based review
- post-run research
- advisory synthesis outside authority paths

Not allowed:

- live auto-learning that changes runtime authority without explicit governed implementation
- sidecar or advisory feedback injected directly into execution decisions

## 7. Acceptance Criteria

- artifact types are explicit
- canonical versus derived artifacts are separated
- replay and learning claims stay bounded to verified code

## 8. Verification / Tests

Verified files:

- `bot/src/journal-writer/writer.ts`
- `bot/src/persistence/journal-repository.ts`
- `bot/src/persistence/runtime-cycle-summary-repository.ts`
- `bot/src/persistence/execution-repository.ts`
- `bot/src/persistence/runtime-visibility-repository.ts`
- `bot/src/runtime/live-runtime.ts`
- `bot/src/intelligence/forensics/trend-reversal-monitor-runner.ts`

## 9. Risks / Rollback

- using action-log projections as canonical decision history would overstate replay fidelity
- describing offline analysis as live learning would violate governance boundaries

## 10. Next Step

Expose replay surfaces only when the canonical artifact source, route contract, and provenance labels are explicit.
