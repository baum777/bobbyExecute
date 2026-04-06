# BobbyExecute Governance Source Of Truth

Scope: repository-local governance entrypoint.
Authority: authoritative for governance source selection and hard boundary language.

## Purpose

Prevent dual truth and keep one deterministic authority path with explicit non-authoritative companion planes.

## Canonical Governance Documents

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/05_governance/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/01_architecture/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/02_pipeline/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/repo-specific-canonical-sources.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/journal-memory-casebook-architecture.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/journal-memory-validation-gates.md`

## Four-Plane Governance Lock

- Deterministic Authority Plane: only decision and execution authority.
- Shared Forensics / Intelligence Evidence Plane: contract-first and non-authoritative.
- Workflow Consumer Plane: Meta Fetch Engine, Low Cap Hunter (optional), Shadow Intelligence; all non-authoritative.
- Bounded MCP Skill Plane: read-only posture, non-authoritative, unchanged in this slice.

## Hard Governance Summary

- only the deterministic authority plane may create decision authority
- canonical decision-history truth is runtime cycle summary `decisionEnvelope`
- MCP and sidecars are non-authoritative
- fail-closed behavior is mandatory on ambiguous or stale critical state
- critical artifacts must be serializable, replayable, and traceable
- no second decision truth may be introduced
- decision-time truth must remain separated from outcome-time and review-time learning
- learned priors require explicit validation/review gating before deterministic use

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
