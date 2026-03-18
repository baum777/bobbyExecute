---
name: security-review
description: Review code or architecture for concrete security risk, exploitability, unsafe trust assumptions, and missing safeguards. Use for security audits, auth or permission-boundary review, secrets exposure review, tenant isolation review, or fail-open analysis. Do not use for general style feedback or broad non-security PR review.
---

# Security Review

Assess security posture with a bias toward plausible exploit paths and material impact.

## Focus Areas

- Exploitability
- Permission boundaries
- Secrets exposure
- Injection vectors
- Unsafe automation
- Auth and authz gaps
- Tenant isolation failures
- Fail-open behavior

## Workflow

1. Understand the trust boundaries and sensitive assets.
2. Review changed code or relevant architecture in context.
3. Distinguish confirmed issues from weaker hypotheses.
4. Explain the exploit path, impact, and likely fix.
5. Prioritize findings by severity and confidence.

## Output Format

- Findings
- Severity
- Exploit path
- Impact
- Suggested fix
- Confidence

## Guardrails

- Avoid low-value lint-like commentary.
- Avoid speculative claims without a plausible attack path.
- Prefer fewer high-confidence findings over noisy issue lists.
