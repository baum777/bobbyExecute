# BobbyExecute Sidecars

Scope: non-authoritative sidecar behavior and evidence-plane integration.
Authority: architecture support doc.

## Purpose

Define sidecars as observational producers/consumers that enrich intelligence without creating execution authority.

## Current Status

- Sidecar monitoring and watchlist-related components exist.
- Outputs are observational and journaled.
- Sidecars remain non-authoritative.

## Target State

Sidecars feed the shared evidence plane and workflow consumer views with typed, provenance-aware outputs.

## Authority Boundary

- no trade intent creation
- no score/policy override
- no execution trigger
- no hidden bridge into deterministic authority path

## Inputs

- advisory/discovery observations
- market structure and watchlist state
- typed non-authoritative evidence references

## Outputs

- watch candidates
- trend/state-transition observations
- context annotations
- journaled sidecar evidence

## Workflow Consumer Integration

- `Shadow Intelligence`: primary consumer of sidecar monitoring outputs.
- `Meta Fetch Engine`: may consume sidecar evidence as contextual enrichment.
- `Low Cap Hunter`: may consume sidecar-derived transition hints as optional context.

All outputs remain non-authoritative.

## Canonical Truth Relation

Sidecar outputs are evidence/context only. Canonical decision-history truth remains cycle-summary `decisionEnvelope`.

## What This Is Not

- Not a second decision engine.
- Not an MCP control surface.

## Dependencies

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/forensics-evidence-plane.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/workflow-consumers.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/README.md`

## Deferred Scope

- Any direct sidecar-to-authority integration.
