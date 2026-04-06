# Journal-Memory Casebook Architecture

Scope: journal-first memory and casebook layering model for BobbyExecute documentation.
Authority: canonical architecture support doc; does not change runtime authority contracts.

## Purpose

Define a governance-safe memory architecture that preserves raw truth, supports replay and learning, and prevents authority confusion.

## Current Status

- Layer B foundations are present through journal persistence and cycle summaries.
- Legacy `memory` module surfaces are explicitly deprecated and not target architecture.
- Casebook/knowledge/playbook layers are partially planned in docs and mostly deferred in implementation.

## Layer Model (A-F)

### A. Deterministic Authority Plane

- sole decision and execution authority
- canonical decision-history truth: cycle-summary `decisionEnvelope`
- sources: `bot/src/runtime/*`, `bot/src/core/*`, `bot/src/persistence/runtime-cycle-summary-repository.ts`

### B. Raw Journal Truth Plane

- immutable/append-only evidence-bearing event records
- replay and forensic base layer
- sources: `bot/src/persistence/journal-repository.ts`, `bot/src/journal-writer/*`, runtime cycle summaries

### C. Canonical Casebook Plane

- typed compression of related raw events into case containers
- each case links back to raw evidence references
- target case classes:
  - trade case
  - meta shift case
  - signal cluster case
  - KOL influence case
  - trade post-mortem case
  - review case

### D. Derived Knowledge Plane

- recomputable cross-case views and rankings
- explicit `derived` semantics required
- not raw evidence and never canonical decision truth

### E. Playbook / Optimization Plane

- versioned operational guidance
- evidence-linked and review-gated
- no silent overwrite of prior playbooks

### F. Bounded MCP Exposure Plane

- optional read-only exposure only
- can expose approved derived/resource views
- no execution or control mutation

## Current Mapping To Repo Surfaces

| Layer | Current equivalent | Status | Notes |
|---|---|---|---|
| B raw journal | `journal-repository`, journal writer, cycle summary append | present | authoritative evidence base for replay |
| C casebook | ad hoc summaries and module-specific artifacts | partial | no dedicated casebook contract family yet |
| D knowledge | KPI and runtime review projections | partial | derived support surfaces, recomputation semantics need formal lock |
| E playbook | offline learning notes/process only | missing/partial | no versioned playbook memory contract in active docs |

Legacy non-target path:
- `bot/src/memory/memory-db.ts`
- `bot/src/memory/log-append.ts`
- `bot/src/core/orchestrator.ts`

These remain deprecated migration remnants and must not be reintroduced as canonical memory authority.

## Semantic Separation Rules

- preserve `observed`, `inferred`, `learned`, and `operational` tags
- preserve decision-time truth separately from outcome-time truth and review-time learning
- freeform operator notes are never authority artifacts

## Documentation Contract Sketches (Docs-Only)

| Contract | Layer | Required shape |
|---|---|---|
| `RawJournalRecord` | B | observed-only event payload, immutable evidence refs, source/timestamps |
| `CaseRecordV1` | C | case id/type, linked raw record refs, decision/outcome/review partitions |
| `DerivedKnowledgeViewV1` | D | derived flag, recomputation metadata, lineage to case ids |
| `PlaybookVersionV1` | E | version id, evidence lineage, approval state, supersedes relation |
| `MachineSafePriorExportV1` | D/E | validated-only prior set, review gate metadata, authority gating notes |

## Canonical Truth Relation

- Canonical execution decision-history remains `decisionEnvelope`.
- Journal-memory layers enrich analysis, replay, and learning only.
- No layer in this document creates execution authority.

## Deferred Scope

- runtime authority consumption of machine-safe priors
- Postgres schema rollout for casebook/knowledge/playbook
- automated playbook-to-authority promotion
