---
name: handover-writer
description: Produce a precise current-state handover for another agent or later session, including what changed, what remains, constraints, blockers, and a continuation prompt. Use for project handoffs, continuation notes, or exact next-step prompts after meaningful work is already underway. Do not use for initial exploration or architecture planning.
---

# Handover Writer

Summarize the real project state so another agent can continue without rediscovering key context.

## Objectives

- Capture completed work accurately.
- Preserve decisions, constraints, and unresolved risks.
- Make the remaining work easy to pick up.
- End with an exact continuation prompt when useful.

## Workflow

1. Confirm the current state from the repository and the recent work.
2. Summarize what changed in concrete, repo-grounded terms.
3. List remaining work and blocked items separately.
4. Preserve important decisions, assumptions, and constraints.
5. Provide the next recommended move and a handoff prompt.

## Output Format

- Summary
- Completed work
- Open work
- Constraints and decisions
- Risks and blockers
- Recommended next move
- Ready-to-paste continuation prompt

## Guardrails

- Be specific about the current state.
- Do not omit blockers just to make the handoff look tidy.
- Do not invent progress that is not visible in the repo or the session context.
