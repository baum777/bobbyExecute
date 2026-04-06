# BobbyExecute Architecture

Scope: system architecture boundaries and role separation.
Authority: canonical architecture document.

## Purpose

Define the active architecture using a four-plane model with one deterministic authority path.

## Current Status (Active Today)

- Deterministic runtime authority uses typed authority artifact resolution in live and dry runtimes (`buildRuntimeAuthorityArtifactChain`).
- Runtime cycle summaries persist canonical `decisionEnvelope` decision-history artifacts.
- Sidecar and advisory surfaces exist but are non-authoritative.
- MCP posture is bounded, prompt/resource oriented, and non-authoritative.

## Target State

Maintain one authority plane while expanding a reusable non-authoritative evidence plane consumed by three workflow consumers.

The journal-memory overlay extends this with non-authoritative casebook/knowledge/playbook layers that remain downstream of raw journal truth.

## Architecture Planes

### 1. Deterministic Authority Plane

Responsibilities:
- deterministic decision and execution flow
- risk/policy/decision/execution verification
- canonical cycle summaries and decision artifacts

Constraints:
- fail-closed on missing/invalid critical state
- no LLM authority
- no sidecar or MCP authority leakage

### 2. Shared Forensics / Intelligence Evidence Plane

Responsibilities:
- produce typed, provenance-aware, replayable evidence bundles
- preserve evidence references for downstream consumers
- keep journal-first records for replay and audit

Boundary:
- observational only; does not execute trades or mutate authority decisions

### 3. Workflow Consumer Plane

Consumers:
- `Meta Fetch Engine`: strategic intelligence snapshots/watchlist context
- `Low Cap Hunter`: optional opportunistic scanner
- `Shadow Intelligence`: ongoing monitoring and transition tracking

Boundary:
- consume evidence/intelligence outputs only
- do not become authority

### 4. Bounded MCP Skill Plane

Current slice posture:
- bounded, read-only, non-authoritative
- unchanged for current forensics slice
- safe to disable entirely without authority impact

Future direction:
- resource-first with limited read-only tools only if explicitly governed

## Authority Boundary

- Only the deterministic authority plane may create decision/execution authority.
- No second decision-history truth is permitted.
- Sidecars and MCP surfaces remain non-authoritative.
- Journal-memory layers are non-authoritative unless promoted through explicit deterministic contracts.
- Decision-time truth must remain isolated from outcome-time and review-time interpretations.

## Inputs

- market/wallet/runtime state
- typed discovery/intelligence artifacts
- control-plane runtime posture state

## Outputs

- canonical decision artifacts (`decisionEnvelope`)
- execution and verification evidence
- runtime cycle summaries
- non-authoritative evidence bundles and monitoring views

## Canonical Truth Relation

- Canonical decision-history truth: runtime cycle summary `decisionEnvelope`.
- Derived/operator projections must be labeled derived and non-canonical.

## What This Is Not

- Not a tool catalog or runbook.
- Not a claim that all workflow consumers are fully wired.
- Not permission for MCP/sidecar control or execution mutation.

## Dependencies

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/repo-specific-canonical-sources.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/02_pipeline/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/05_governance/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/forensics-evidence-plane.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/workflow-consumers.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/journal-memory-casebook-architecture.md`

## Deferred Scope

- Any authority changes outside deterministic runtime contracts.
- Any MCP mutation/control surfaces.
- Any second canonical decision-history surface.
