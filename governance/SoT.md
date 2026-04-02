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

## Boundary Note

Older governance narratives in repository history are superseded by the canonical docs above.

If a lower-level document conflicts with `docs/05_governance/README.md`, the governance README wins.
