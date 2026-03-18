---
name: architecture-planner
description: Analyze repository or subsystem architecture, infer a target state, and produce a phased implementation plan with risks, dependencies, and verification points. Use for architecture analysis, migration planning, multi-module refactors, target-state design, or readiness waves. Do not use for small isolated bug fixes, simple file edits, or final code review.
---

# Architecture Planner

Analyze enough surrounding code and docs to understand the real system shape before planning.

## Objectives

- Identify the current architecture and the important boundaries.
- Infer the target state from the request and repository context.
- Separate hard blockers from optional improvements.
- Prefer ordered, low-regret execution waves over broad rewrites.

## Workflow

1. Read the relevant entrypoints, boundaries, and docs.
2. Describe the current state in concrete subsystem terms.
3. Infer the target state and note constraints that must hold.
4. Identify the gaps, dependencies, and likely migration risks.
5. Propose execution waves that keep scope bounded and reviewable.
6. Call out assumptions instead of guessing silently.

## Output Format

- Objective
- Current state
- Target state
- Gaps
- Recommended execution waves
- Risks and blockers
- Verification points
- Recommended next step

## Guardrails

- Preserve visible architecture intent unless the user explicitly wants redesign.
- Distinguish must-have work from nice-to-have cleanup.
- Do not anchor conclusions on one file when the change crosses boundaries.
- Do not drift into implementation unless the user asks for execution.
