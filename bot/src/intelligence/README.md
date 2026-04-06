# Intelligence Module

Scope: typed intelligence and pre-authority/evidence builders.
Authority: module support doc only; architecture source lives under `docs/`.

## Purpose

Describe intelligence-layer responsibilities and boundaries against deterministic runtime authority.

## Current Status

- Typed intelligence builders and contracts are active and consumed by runtime authority artifact resolution.
- This module remains pre-authority/evidence focused.
- Outputs are deterministic inputs and observational artifacts, not direct execution authority.

## Shared Evidence-Plane Role

This module contributes reusable evidence/intelligence artifacts for the shared evidence plane, including forensics and scoring-adjacent inputs.

## Journal-Memory Relation

- provides observed evidence inputs that may later be compressed into case records
- does not own casebook truth, derived knowledge truth, or playbook authority
- inferred/learned artifacts must remain labeled and non-authoritative

## Authority Boundary

- no direct execution trigger
- no hidden policy override
- no second decision truth

Canonical decision truth remains runtime cycle-summary `decisionEnvelope`.

## Dependencies

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/02_pipeline/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/forensics-evidence-plane.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/05_governance/README.md`
