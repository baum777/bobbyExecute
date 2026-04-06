# BobbyExecute Pipeline

Scope: stage ownership, artifact flow, and authority boundaries.
Authority: canonical pipeline boundary document.

## Purpose

Describe the active authority pipeline and its relation to non-authoritative evidence and workflow-consumer flows.

## Current Status (Active Today)

- Live and dry runtimes build typed authority artifacts through `buildRuntimeAuthorityArtifactChain` before deterministic decision flow.
- Runtime persists canonical `decisionEnvelope` in cycle summaries.
- Forensics/sidecar outputs exist as observational artifacts and are not authority inputs unless explicitly typed and promoted by deterministic contracts.

## Target State

- Keep deterministic authority path singular.
- Formalize shared evidence-plane producers and consumer-specific views.
- Preserve replayability/provenance across authority and non-authority outputs.

## Authority Stage Map

| Stage | Class | Notes |
|---|---|---|
| Input normalization and authority artifact build | authority-prep | typed artifact resolution used by runtime authority path |
| Deterministic policy/risk/decision | authority | only decision authority path |
| execution / verify | authority | execution evidence and verification records |
| cycle summary persistence | authority | canonical `decisionEnvelope` history location |

## Evidence Stage Map (Non-Authoritative)

| Stage | Class | Notes |
|---|---|---|
| forensics evidence assembly | evidence | provenance-aware, replayable evidence bundles |
| sidecar monitoring outputs | evidence | observational state-transition signals |
| workflow consumer snapshots | consumer-derived | strategic/opportunistic/monitoring views |

## Workflow Consumer Mapping

- `Meta Fetch Engine`: consumes evidence bundles to build strategic context and watchlist snapshots.
- `Low Cap Hunter`: optional consumer of evidence for opportunistic scans.
- `Shadow Intelligence`: consumes monitoring/evidence for transition tracking and watchlist health.

All consumer outputs remain non-authoritative.

## Authority Boundary

- Evidence and consumer flows cannot bypass deterministic policy/risk/decision.
- MCP and sidecars cannot introduce execution authority.
- No second canonical decision-history producer is allowed.

## Replay And Provenance Requirements

- Evidence bundles must carry provenance/source metadata and timestamps.
- State-transition summaries must be traceable to underlying evidence references.
- Canonical decision truth stays in cycle-summary `decisionEnvelope`; consumer summaries are derived.
- Decision-time truth must be preserved as captured at runtime, separate from outcome-time updates and review-time learning layers.

## Journal-Memory Layer Relation

- Raw journal truth (Layer B) is the immutable replay base.
- Canonical casebook (Layer C), derived knowledge (Layer D), and playbook memory (Layer E) are downstream and non-authoritative in this slice.
- Any future machine-safe priors must pass explicit validation gates before deterministic consumption.

## What This Is Not

- Not a claim that all planned consumer modules are fully implemented.
- Not permission to treat advisory or monitoring outputs as authority.

## Dependencies

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/01_architecture/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/forensics-evidence-plane.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/workflow-consumers.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/journal-memory-casebook-architecture.md`

## Deferred Scope

- Any non-deterministic direct authority path.
- Any untyped bridge from evidence or MCP surfaces into decision execution.
