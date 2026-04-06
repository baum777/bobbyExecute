# Workflow Consumers

Scope: non-authoritative consumer role separation.
Authority: architecture support doc.

## Purpose

Define distinct consumer responsibilities so evidence analysis does not collapse into a single ambiguous plane.

## Current Status

- Consumer names are standardized in documentation.
- Shadow monitoring foundations exist today in sidecar/forensics modules.
- Meta Fetch and Low Cap consumer boundaries are documented as explicit contracts, with implementation depth to be wired incrementally.

## Consumers

## Meta Fetch Engine

Purpose:
- strategic snapshot building
- watchlist context assembly
- sectioned intelligence outputs

Inputs:
- shared evidence bundles
- provenance metadata

Outputs:
- non-authoritative strategic intelligence snapshots
- optional non-authoritative casebook inputs for review workflows

## Low Cap Hunter

Purpose:
- optional opportunistic early-phase scan
- dormant by default unless explicitly enabled

Inputs:
- evidence-plane risk/integrity signals
- watchlist and attention snapshots

Outputs:
- non-authoritative opportunity candidates
- optional derived learning candidates (never authority)

## Shadow Intelligence

Purpose:
- monitoring and state-transition intelligence
- watchlist lifecycle tracking

Inputs:
- evidence-plane transition signals
- sidecar observation streams

Outputs:
- non-authoritative monitoring summaries and alerts
- state-transition case candidates for review-time compression

## Canonical Truth Relation

None of these consumers own decision authority or decision-history truth.

## Boundary Rules

- no direct execution triggers
- no policy/risk overrides
- no hidden bridge to deterministic authority
- no consumer may relabel inferred/learned output as raw observed truth

## Dependencies

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/forensics-evidence-plane.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/04_sidecars/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/05_governance/README.md`

## Deferred Scope

- broad operationalization details per workflow.
- any authority-path integration for consumer outputs.
