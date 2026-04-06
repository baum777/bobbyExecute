# Architecture Terms

Scope: repository terminology lock for architecture and governance documentation.
Authority: canonical support for wording consistency; governance rules remain in `C:/workspace/main_projects/dotBot/bobbyExecute/governance/SoT.md`.

## Deterministic Authority Plane
Only plane that can create trade decision/execution authority. Runtime authority is produced through typed authority artifacts and deterministic policy/risk/decision code paths.

## Shared Forensics / Intelligence Evidence Plane
Contract-first, replayable, journal-first, provenance-aware evidence production layer. Non-authoritative by default.

## Workflow Consumer Plane
Non-authoritative consumers of evidence/intelligence outputs.

- `Meta Fetch Engine`: strategic intelligence snapshots and watchlist context.
- `Low Cap Hunter`: optional opportunistic scanner; normally dormant unless explicitly enabled.
- `Shadow Intelligence`: monitoring and state-transition intelligence.

## Bounded MCP Skill Plane
Bounded, read-only posture in current slice. Non-authoritative and safe to disable without runtime authority impact.

## Canonical Decision Truth
`decisionEnvelope` persisted in runtime cycle summaries (`bot/src/persistence/runtime-cycle-summary-repository.ts`).

## Raw Journal Truth
Immutable or append-only evidence-bearing records captured at event time. Raw journal truth is the base evidence layer and must not be rewritten retroactively.

## Canonical Case Record
Typed compression of related raw journal events into a case container (for example trade case or transition case) with explicit links back to raw evidence references.

## Derived Knowledge View
Recomputable interpretation across many cases. Derived knowledge is never raw fact and must carry derived semantics.

## Playbook Memory
Versioned operational guidance linked to supporting evidence and review metadata. Playbooks are operational recommendations, not authority truth.

## Machine-Safe Prior
Validated, review-gated prior exported for optional deterministic consumption through explicit contracts. Not all learned artifacts are machine-safe priors.

## Decision-Time Truth
What was known and available at the time of a deterministic decision, without hindsight contamination.

## Outcome-Time Truth
What became observable after execution or blocked outcome resolution.

## Review-Time Learning
Retrospective learning derived from one or more completed cases. Must be labeled learned/derived and never rewritten into raw decision-time truth.

## Observed / Inferred / Learned / Operational Semantics
- `observed`: directly captured evidence from sources and runtime events.
- `inferred`: reasoned conclusions from observed evidence.
- `learned`: cross-case conclusions or patterns discovered retrospectively.
- `operational`: actionable policy/playbook guidance for operator or governed automation.

## Derived Projection
A view reconstructed from non-canonical artifacts (for example action logs or aggregated dashboard projections). Useful, but not canonical truth.

## Historical Evidence
Dated operational records captured for auditability (for example preflight evidence snapshots). Not architecture source-of-truth.

## Deferred Scope
Declared target behavior that is not yet wired as an active producer/consumer path.

## Fail-Closed
On missing/stale/invalid critical state, block or degrade safely; never silently pass.

## Forbidden Ambiguities

- Do not call advisory outputs "authority".
- Do not call derived projections "canonical".
- Do not claim a path is "wired" without a verified producer and consumer path.
- Do not imply MCP, sidecars, or LLM annotations can mutate execution authority.
- Do not treat inferred/learned/operational artifacts as raw observed truth.
- Do not allow freeform notes to enter deterministic authority paths.
- Do not allow derived knowledge views to masquerade as raw journal evidence.
