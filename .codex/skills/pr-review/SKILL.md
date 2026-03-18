---
name: pr-review
description: Review a pull request, diff, or change set for correctness, regression risk, architecture fit, test sufficiency, and maintainability. Use for PR reviews, diff reviews, checklist-based code review, or high-signal feedback on proposed changes. Do not use for greenfield planning or narrow security-only review when security-review is the better fit.
---

# PR Review

Review changes with a high-signal engineering lens and prioritize defects, risks, and missing verification over style commentary.

## Review Priorities

- Correctness
- Regression risk
- Architecture fit
- Test sufficiency
- Security implications
- Maintainability

## Workflow

1. Understand the purpose of the change.
2. Read the changed files in context.
3. Distinguish confirmed issues, likely risks, and optional recommendations.
4. Prioritize feedback by impact.
5. Call out missing tests or missing verification explicitly.

## Output Format

- Summary verdict
- Confirmed issues
- Risks and edge cases
- Missing tests or verification
- Recommendations
- Merge confidence

## Guardrails

- Avoid generic lint-like commentary.
- Separate objective defects from subjective improvements.
- Escalate concrete regressions before polish concerns.
