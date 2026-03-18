---
name: spec-to-execution
description: Convert an existing specification, implementation plan, readiness plan, or architecture decision into the next concrete execution slice with ordered tasks and verification. Use when a meaningful plan already exists and the next implementation step must be made decision-complete. Do not use when the problem still needs initial discovery or architecture planning.
---

# Spec to Execution

Translate accepted decisions into the next bounded implementation slice without reopening settled scope.

## Objectives

- Preserve prior decisions and hard requirements.
- Select the next smallest meaningful execution slice.
- Convert broad planning into concrete tasks and checks.
- Define done criteria that make review straightforward.

## Workflow

1. Extract non-negotiable requirements from the source plan or spec.
2. Identify what is already complete and what still blocks progress.
3. Pick the next slice that unlocks forward motion with minimal scope.
4. Define the implementation tasks, likely file areas, and checks.
5. State the done criteria and the exact next prompt if helpful.

## Output Format

- Scope slice selected
- Why this slice is next
- Tasks
- Files likely affected
- Verification
- Done criteria
- Ready-to-paste next prompt

## Guardrails

- Do not broaden scope unless the source plan requires it.
- Do not quietly change accepted decisions.
- Keep the slice small enough to implement and verify in one pass when possible.
