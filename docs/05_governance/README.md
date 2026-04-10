# BobbyExecute Governance

Scope: authority rules, fail-closed boundaries, and documentation truth discipline.
Authority: canonical governance language for this repository.

## Purpose

Enforce one deterministic authority plane and explicit non-authoritative boundaries for evidence, workflow consumers, sidecars, and MCP surfaces.

## Current Status

- Deterministic runtime authority is active.
- Canonical decision-history truth is cycle-summary `decisionEnvelope`.
- MCP remains bounded and non-authoritative.
- Sidecars remain non-authoritative.
- Dashboard V1 is the intended operator UI target and remains non-authoritative. The V1 route set is `/overview`, `/control`, `/journal`, `/recovery`, and `/advanced`.
- The responsive/mobile addendum is part of the target UI truth: the five-screen model does not collapse on small screens, truth labels and effect labels remain visible, and mobile must not create hidden primary state or duplicate truth surfaces.

## Repository Branch Lineage

- Active working branch: `codex/decision-provenance-hardening`
- Preserved historical reference branch: `codex/m1-03-legacy-signal-scoring-freeze`
- The historical branch is retained for reference only and must not be deleted without explicit content review.
- It must not be blindly merged or cherry-picked.
- It contains mixed legacy-cleanup and migration themes: some ideas are conceptually absorbed elsewhere, but the branch is not portable as-is.
- Branch cleanup is conservatively complete for now.

## Target State

- Keep authority singular and deterministic.
- Formalize shared forensics/intelligence evidence contracts without granting authority.
- Keep workflow consumers and MCP as bounded read/intelligence surfaces.
- Keep the V1 dashboard as a derived presentation layer only, with `Overview` canonical at `/overview` and `/` retained only as a temporary shim if needed.

## Four-Plane Governance Boundaries

1. Deterministic Authority Plane
- only source of decision/execution authority

2. Shared Forensics / Intelligence Evidence Plane
- replayable/provenance-aware evidence outputs
- non-authoritative

3. Workflow Consumer Plane
- Meta Fetch Engine, Low Cap Hunter, Shadow Intelligence
- non-authoritative

4. Bounded MCP Skill Plane
- read-only posture in this slice
- no control/execution mutation
- unchanged now

## Hard Rules

- no LLM authority
- no second decision truth
- no sidecar-to-authority bridge
- no MCP authority leakage
- fail-closed on ambiguous, stale, or invalid critical state
- every critical authority artifact must be journalable and replayable
- no freeform operator notes in authority paths
- no derived knowledge or playbook artifacts masquerading as raw truth
- no machine-safe prior export without explicit review and validation gates

## Canonical Truth Relation

- Canonical decision-history source: runtime cycle summary `decisionEnvelope`.
- Action logs, dashboards, and advisory outputs are derived/supporting surfaces unless explicitly marked canonical by producer contract.
- Legacy mixed dashboard routes and surfaces are transitional and must not be treated as the target truth surface.
- Decision-time truth must remain immutable relative to outcome-time and review-time learning layers.

## What This Is Not

- Not an implementation checklist.
- Not an approval mechanism for live production trading.
- Not permission to broaden MCP scope in the current slice.

## Planning Artifacts

- [control-matrix.md](./control-matrix.md) - Tag-8 planning/governance control artifact; derived from the Decision Lock, not a new SSOT.

## Dependencies

- `C:/workspace/main_projects/dotBot/bobbyExecute/governance/SoT.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/repo-specific-canonical-sources.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/glossary/architecture-terms.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/journal-memory-validation-gates.md`

## Deferred Scope

- MCP auth/session expansion.
- Any authority-path refactor outside governed runtime contracts.
- Casebook/knowledge/playbook schema rollout and automated prior promotion logic.
- V1-deferred dashboard topics: `casebook`, `knowledge`, `priors`, `playbooks`, `optimization_memory`, `deep_infra_controls`, `deployment_internal_control_surfaces`, `large_model_orchestration_workbench`.
