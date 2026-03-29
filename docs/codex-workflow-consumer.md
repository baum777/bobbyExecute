# Codex Workflow Consumer Overlay

This repository consumes the standalone shared-core Codex workflow package from:

`C:/workspace/main_projects/codex-workflow-core/`

## Linked Version

- shared-core version: `0.1.4`
- package fingerprint: `8f93e32a633d9601f609beca48cb8df913e476fef495789c9aee8a4e0f41ed42`
- linkage mode: versioned local repository reference

## What Is Adopted

- `repo-intake-sot-mapper` via `.codex/repo-intake-inputs.json`
- `runtime-policy-auditor` via `.codex/runtime-policy-inputs.json`
- planning slice building
- implementation contract extraction
- test matrix building
- post-implementation review writing
- patch strategy selection
- failure mode enumeration
- release narrative building

## What Stays Local

- `AGENTS.md`
- `.codex/repo-intake-inputs.json`
- `.codex/runtime-policy-inputs.json`
- local governance artifacts
- repo-specific canonical docs
- approval and scorecard rules

## Operator Rule

Read the consumer manifest before using shared-core assets.
Do not edit the standalone shared-core source from this repository.
Keep both `.codex/repo-intake-inputs.json` and `.codex/runtime-policy-inputs.json` current when using the matching shared-with-local-inputs skills.

## Validation

Run the consumer validator after changing overlay files or changing the shared-core source reference.
