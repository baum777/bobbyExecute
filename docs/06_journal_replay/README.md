# BobbyExecute Journal And Replay

Scope: artifact classes, replay boundaries, and provenance discipline.
Authority: canonical replay/journal terminology document.

## Purpose

Define canonical versus derived artifacts and replay obligations across authority and evidence planes.

## Current Status

- Runtime and persistence produce canonical authority artifacts, including cycle summaries with `decisionEnvelope`.
- Sidecar and evidence outputs are journaled as non-authoritative records.
- Historical preflight evidence docs exist and are indexed separately.
- Dashboard V1 consumes these artifacts as derived presentation layers only; it does not define a second canonical decision-history truth.

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
- V1 dashboard journal and recovery surfaces are derived views over raw journal/evidence records and control action history; they must keep trade history, control actions, and canonical decision history separate.

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
The dashboard may display canonical decision history, but it does not own or redefine it.

## Operational And Historical Records

- Runbooks/templates are operational guidance only.
- Dated evidence snapshots are historical records.
- Historical index: `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/evidence-records-index.md`.

## What This Is Not

- Not a runtime mutation interface.
- Not a claim that all replay views are public API surfaces.
- Not a claim that the legacy mixed dashboard remains the intended target surface.

## Dependencies

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/01_architecture/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/02_pipeline/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/forensics-evidence-plane.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/journal-memory-casebook-architecture.md`

## Deferred Scope

- Broad public replay API expansion.
- Any live learning loop that mutates authority without governed contracts.
