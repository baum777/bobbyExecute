---
name: repo-audit
description: Audit a repository for product-core clarity, architecture coherence, production readiness, risk, and missing operational safeguards. Use for codebase audits, readiness reviews, architecture assessments, or concise product-core summaries. Do not use for implementing features or for narrow single-file fixes.
---

# Repo Audit

Audit the repository with a production-minded lens and prioritize system-level issues over polish.

## Audit Dimensions

- Product core clarity
- Architecture coherence
- Module boundaries
- Runtime safety
- Observability
- Testability
- Deployment readiness
- Governance or compliance surface
- Documentation quality

## Workflow

1. Identify the main product purpose and the primary execution path.
2. Evaluate whether the repository structure supports that purpose.
3. Find blockers, fragility points, and missing safeguards.
4. Grade operational readiness, not styling polish.
5. Recommend the shortest path to meaningful risk reduction.

## Output Format

- Executive summary
- Product core and distinguishing traits
- Strengths
- Weaknesses
- Critical risks
- Readiness score
- Immediate fixes
- Step-by-step transformation path

## Guardrails

- Focus on high-impact issues first.
- Avoid low-value style commentary unless it creates operational risk.
- Keep findings grounded in repository evidence.
