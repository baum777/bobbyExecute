# BobbyExecute Journal And Replay

Scope: artifact classes, replay boundaries, and provenance discipline.
Authority: canonical replay/journal terminology document.

## Purpose

Define canonical versus derived artifacts and replay obligations across authority and evidence planes.

## Current Status

- Runtime and persistence produce canonical authority artifacts, including cycle summaries with `decisionEnvelope`.
- Sidecar and evidence outputs are journaled as non-authoritative records.
- Historical preflight evidence docs exist and are indexed separately.

## Target State

Maintain a journal-first model where canonical authority artifacts and non-authoritative evidence artifacts remain distinct but traceable.

## Artifact Classes

### Canonical Authority Artifacts

- decision envelope in runtime cycle summaries
- execution and verification evidence
- incident and runtime-critical persistence artifacts

### Non-Authoritative Evidence Artifacts

- forensic evidence bundles
- watchlist/state-transition summaries
- sidecar observation journals

### Derived Views

- dashboard projections
- convenience summaries built from canonical/evidence artifacts

### Casebook / Knowledge / Playbook Layers (Non-Authoritative)

- canonical case records (typed compression linked to raw evidence)
- derived knowledge views (recomputable cross-case interpretations)
- versioned playbook memory (evidence-linked operational guidance)

## Replay Requirements

- Every evidence record must keep provenance and timestamps.
- Replay views must reference underlying evidence or canonical artifact ids.
- Derived views must be labeled derived and non-canonical.
- Decision-time truth, outcome-time truth, and review-time learning must be explicitly partitioned.
- Freeform notes cannot be promoted as raw replay truth.

## Canonical Truth Relation

Canonical decision-history truth is runtime cycle-summary `decisionEnvelope`.

## Operational And Historical Records

- Runbooks/templates are operational guidance only.
- Dated evidence snapshots are historical records.
- Historical index: `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/evidence-records-index.md`.

## What This Is Not

- Not a runtime mutation interface.
- Not a claim that all replay views are public API surfaces.

## Dependencies

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/01_architecture/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/02_pipeline/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/forensics-evidence-plane.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/journal-memory-casebook-architecture.md`

## Deferred Scope

- Broad public replay API expansion.
- Any live learning loop that mutates authority without governed contracts.
