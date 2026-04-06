# Shared Forensics / Intelligence Evidence Plane

Scope: contract and boundary model for non-authoritative evidence production.
Authority: architecture support doc; references canonical pipeline/governance docs.

## Purpose

Define a reusable evidence plane that supports multiple workflows without becoming execution authority.

## Current Status

Implemented foundations exist in forensics/intelligence and sidecar modules, but workflow consumer formalization is still being normalized in documentation.

## Target State

A shared evidence plane that is:

- contract-first
- replayable
- journal-first
- provenance-aware
- non-authoritative

## Evidence Domains

- provenance and source lineage
- contract-risk and deployer-linked signals
- holder integrity and liquidity integrity
- wallet toxicity/manipulation patterns
- migration/launch/rug-transition signals
- attention validation
- state transitions over time

## Inputs

- typed discovery/intelligence artifacts
- market/adapter observations
- deterministic sidecar monitoring outputs

## Outputs

- forensic evidence bundles (typed)
- watchlist/state-transition evidence views
- evidence references for replay
- case-compression-ready evidence linkage for downstream casebook formation

All outputs are observational and non-authoritative.

## Canonical Truth Relation

- Evidence bundles can inform analysis/monitoring context.
- They do not create canonical decision truth.
- Canonical decision truth remains runtime cycle-summary `decisionEnvelope`.

## Boundary Rules

- no execution mutation
- no policy override
- no second decision-history artifact
- no untyped evidence-to-authority bridge
- no inferred/learned artifacts rewritten as raw observed evidence

## Dependencies

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/01_architecture/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/02_pipeline/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/bot/src/intelligence/forensics/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/journal-memory-casebook-architecture.md`

## Deferred Scope

- authority-path promotion of any evidence output.
- broad MCP exposure beyond bounded read-only surfaces.
