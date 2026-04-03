# BobbyExecute Governance Source Of Truth

Scope: repository-local governance entrypoint.  
Authority: authoritative for governance entrypoint selection; detailed governance rules live in `docs/05_governance/README.md`.

## Purpose

This file prevents dual truth between older governance notes and the current documentation set.

## Canonical Governance Documents

- `docs/05_governance/README.md`
- `docs/01_architecture/README.md`
- `docs/02_pipeline/README.md`
- `docs/06_journal_replay/README.md`

## Hard Governance Summary

- only the deterministic core may create decision authority
- MCP skill-plane surfaces are advisory only
- shadow sidecars are advisory only
- fail-closed behavior is mandatory on ambiguous or stale critical state
- critical artifacts must be serializable, replayable, and traceable

## Migration Freeze (PR-M0-01)

### Surviving deterministic lineages

- scoring lineage (survives): `bot/src/intelligence/signals`, `bot/src/intelligence/scoring`
- universe/quality/CQD lineage (survives): `bot/src/intelligence/universe`, `bot/src/intelligence/quality`, `bot/src/intelligence/cqd`
- execution authority shell (survives): `bot/src/core/engine.ts`, `bot/src/runtime/*`

### Contract ownership freeze

- `bot/src/core/contracts/*` owns shared authority and cross-cutting contracts
- `bot/src/intelligence/*/contracts/*` owns pre-authority domain contracts
- transitional wrapper/re-export surfaces are allowed only when explicitly marked as transitional wrappers
- one true owner per concept is mandatory

### Decision-history truth freeze

- canonical decision-history source: `decisionEnvelope` persisted in runtime cycle summaries (`bot/src/persistence/runtime-cycle-summary-repository.ts`)
- action logs remain derived support only and are never canonical decision history

### Deferred extraction boundaries

- no early MCP extraction from execution, policy, scoring authority path, decision, control, or signer surfaces

## Boundary Note

Older governance narratives in repository history are superseded by the canonical docs above.

If a lower-level document conflicts with `docs/05_governance/README.md`, the governance README wins.
