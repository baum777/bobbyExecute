# Journal-Memory Validation Gates

Scope: governance checks required before any learned memory artifact can influence machine-safe prior exports.
Authority: canonical architecture support doc for validation workflow only.

## Purpose

Define fail-closed validation and review gates for journal-memory artifacts while preserving deterministic authority boundaries.

## Gate Model

## Gate 1: Raw Truth Integrity

- raw records are append-only and evidence-linked
- record timestamps and source metadata are present
- no retrospective rewrite of raw payloads

## Gate 2: Case Compression Integrity

- each case links to one or more raw evidence refs
- case semantics (`observed` vs `inferred`) are explicit
- decision-time, outcome-time, and review-time partitions are preserved

## Gate 3: Derived Knowledge Integrity

- derived views remain recomputable from case/raw lineage
- derived/learned labels are mandatory
- derived knowledge cannot be stamped as canonical decision truth

## Gate 4: Playbook Governance Integrity

- playbooks are versioned
- supersession history is explicit
- evidence lineage and reviewer metadata are required

## Gate 5: Machine-Safe Prior Export Integrity

- only reviewed/validated outputs may be marked machine-safe
- freeform notes and unvalidated inferences are blocked
- authority consumption requires explicit deterministic contract integration

## Minimum Review Workflow

1. Per-case review: validate case completeness and evidence lineage.
2. Periodic review: weekly/monthly cross-case learning synthesis.
3. Prior approval review: explicit governance signoff before export state changes.
4. Replay audit: confirm lineage reproducibility for sampled artifacts.

## Fail-Closed Rules

- missing lineage metadata blocks promotion
- missing semantic tags blocks promotion
- unresolved evidence conflicts block promotion
- no MCP or sidecar path can bypass gate outcomes

## MCP Boundary Note

In this slice MCP may expose read-only derived/resource views only. It may not mutate validation state, playbooks, or priors.

## Deferred Scope

- persisted gate execution engine
- automated approval workflow state machine
- schema-level enforcement in Postgres
