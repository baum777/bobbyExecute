# Cursor Rule: SoT Governance (Deterministic)

> **Authority:** This file is subordinate to [`governance/SoT.md`](SoT.md).
> It defines mandatory agent / cursor session behavior for the BobbyExecution repository.

---

## First Read (Mandatory)

You MUST begin every session by reading:

- `governance/SoT.md`

Do not start reasoning, proposing, or implementing before this read completes.

---

## Hard Principle

Repository artifacts are the truth. Chat context is ephemeral.

If chat conflicts with repository artifacts: **repository artifacts win**.

---

## Must-Read Baseline (after SoT)

After reading the SoT, you MUST ensure the following are loaded:

- `governance/SoT.md`
- `governance/cursor_rule.md` (this file)
- `governance/file_path.md`
- `ops/agent-team/team_plan.md`
- `ops/agent-team/team_findings.md`
- `ops/agent-team/team_progress.md`
- `ops/agent-team/team_decisions.md`
- `README.md`
- `docs/05_governance/README.md`

---

## Forbidden

- Treating chat as memory or authority
- Skipping the SoT read
- Creating duplicate sources of truth for the same domain
- Editing append-only logs (only append)
- Silent renames/moves without logging in ops logs
- Bypassing approval triggers

---

## Required Behaviors

- Cite repository file paths when asserting facts
- Append discoveries to `ops/agent-team/team_findings.md`
- Append executed actions to `ops/agent-team/team_progress.md`
- Record decisions in `ops/agent-team/team_decisions.md`
- If a change matches an approval trigger: halt and request approval
- If drift is detected: STOP -> AUDIT -> DOCUMENT -> VERIFY -> RESUME

---

## Fail-Closed Default

If any required file is missing, inconsistent, or approval is required but not granted:

- STOP execution
- Log finding in `ops/agent-team/team_findings.md`
- Request review / approval

---

## Cursor MDC Rule (reference)

For `.cursor/rules/` configuration, use the following frontmatter:

```mdc
---
description: Single Source of Truth Governance - deterministic bootstrap via SoT
alwaysApply: true
---

# Cursor Rule: SoT Governance (Deterministic)

## First Read (Mandatory)
You MUST begin every session by reading:

- governance/SoT.md

Do not start reasoning, proposing, or implementing before this read completes.

## Hard Principle
Repository artifacts are the truth. Chat context is ephemeral.

If chat conflicts with repository artifacts: repository artifacts win.

## Forbidden
- Treating chat as memory or authority
- Skipping the SoT read
- Creating duplicate sources of truth for the same domain
- Editing append-only logs (only append)
- Silent renames/moves without logging in ops logs
- Bypassing approval triggers

## Fail-Closed Default
If any required file is missing, inconsistent, or approval is required but not granted:
- STOP execution
- log finding in ops/agent-team/team_findings.md
- request review/approval
```

---

## Related Docs

- Canonical SoT: [`governance/SoT.md`](SoT.md)
- Repo path rules: [`governance/file_path.md`](file_path.md)
- BobbyExecute architecture: [`docs/01_architecture/README.md`](../docs/01_architecture/README.md)
