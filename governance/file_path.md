# Repository File Path and Structure Rules

> **Authority:** This file is subordinate to [`governance/SoT.md`](SoT.md).
> It defines the canonical directory layout, protected files, append-only rules,
> autonomy ladder, drift detection, approval triggers, and agent runtime contract.

---

## Canonical Directory Layout

```text
/
├─ governance/              canonical governance layer (SoT, cursor rule, path rules)
├─ docs/
│  ├─ 01_architecture/      system architecture and layer boundaries
│  ├─ 02_pipeline/          stage-by-stage pipeline truth
│  ├─ 03_skill_plane/       MCP skill-plane definition and current wiring status
│  ├─ 04_sidecars/          shadow sidecar boundaries
│  ├─ 05_governance/        authority and fail-closed rules
│  ├─ 06_journal_replay/    artifact, replay, and provenance model
│  ├─ architecture/         shared architecture support docs (4-plane, evidence, workflows)
│  └─ glossary/             terminology lock docs
├─ bot/                     TypeScript production codebase (src/, tests/)
├─ ops/agent-team/          governance and team artifacts (plan, findings, progress, decisions)
├─ packages/skills/         skill manifests and instructions
└─ dor-bot/                 Python legacy components
```

---

## Governance File Authority Order

1. `governance/SoT.md` — highest written authority
2. `governance/cursor_rule.md` — agent / cursor working rules
3. `governance/file_path.md` — this file (repo structure and path rules)

---

## Protected Files

Files that must not be modified without review:

- `governance/SoT.md`
- `governance/cursor_rule.md`
- `governance/file_path.md`

---

## Append-Only Files

Files that must only be appended to, never modified or truncated:

- `ops/agent-team/team_findings.md`
- `ops/agent-team/team_progress.md`

---

## Autonomy Ladder

| Tier | Name | Description |
|------|------|-------------|
| 1 | read-only | inspection only |
| 2 | suggest-only | propose changes |
| 3 | execute-with-approval | implement after review |
| 4 | autonomous-with-limits | autonomous but approval gated |

Hard rules:

- No static secrets
- No destructive operations without approval
- Architecture changes require documentation update

---

## Drift Detection Rules

- `no_duplicate_sot`: true — no competing SoT files allowed
- `silent_moves_forbidden`: true — no renames/moves without logging
- `undocumented_decisions_forbidden`: true — all decisions must be recorded
- CI enforcement `failure_policy`: block_merge

---

## Approval Triggers

Mandatory approval required for:

- architecture changes
- destructive operations
- CI / build changes
- secret rotation
- security policy changes
- database schema changes
- governance artifact changes

---

## Agent Runtime Contract

Core principle: **Repository artifacts are the truth. Chat context is ephemeral.**

Allowed operations:

- `read_repository`
- `create_pr`
- `append_logs`

Restricted operations:

- `modify_append_only_logs`
- `bypass_approval_rules`

Bootstrap sequence:

1. `governance/SoT.md`
2. `governance/cursor_rule.md`
3. `governance/file_path.md`

---

## Pull Request Template

Every PR must include:

1. Summary
2. Changed Artifacts
3. Architecture Impact
4. Risk Assessment
5. Documentation Updates
6. Validation

---

## Related Docs

- Canonical SoT: [`governance/SoT.md`](SoT.md)
- Agent rules: [`governance/cursor_rule.md`](cursor_rule.md)
- BobbyExecute architecture: [`docs/01_architecture/README.md`](../docs/01_architecture/README.md)
- Canonical source map: [`docs/repo-specific-canonical-sources.md`](../docs/repo-specific-canonical-sources.md)
