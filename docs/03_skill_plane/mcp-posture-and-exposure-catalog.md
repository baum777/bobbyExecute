# MCP Posture And Exposure Catalog

Scope: allowlisted MCP exposure model for BobbyExecute.
Authority: supporting catalog; governance boundaries remain canonical in `docs/05_governance/README.md`.

## Purpose

Provide a bounded classification for what may be exposed via MCP as `resource`, `tool`, or `none`.

## Current Slice Posture

- Resource-first and read-only.
- Optional read-only tools are deferred unless clearly justified by concrete consumer need.
- No auth/session expansion in this slice.

## Normalized Response Contract (Required)

Every exposed MCP output should include:

- `source`: producer identifier
- `fetchedAt` / `generatedAt`
- `provenance`: references or evidence identifiers
- `limitations`: known gaps and boundary notes
- `partial`: boolean partial-data indicator
- pagination/cursor metadata when relevant
- upstream/rate-limit metadata when relevant

## Exposure Matrix

| Candidate surface | Type now | Notes |
|---|---|---|
| watchlist snapshot view | resource | safe read-only candidate |
| forensic evidence bundle view | resource | safe read-only candidate |
| state-transition summary view | resource | safe read-only candidate |
| replay-ready intelligence view | resource | safe read-only candidate |
| casebook summary view (approved) | resource | derived and read-only only |
| machine-safe prior export manifest | resource | metadata-only and validation-state required |
| generic arbitrary query executor | none | reject |
| execution/approval controls | none | reject |
| trade mutation endpoints | none | reject |
| control-plane mutators | none | reject |
| raw mutable operator notes | none | reject |
| playbook mutation endpoints | none | reject |
| prior mutation endpoints | none | reject |

## Optional Read-Only Tools (Deferred)

If later needed, tools must be:

- explicitly named and single-purpose
- read-only
- typed input/output
- allowlisted and disable-safe

## Boundary Tests

- verify no MCP route can mutate runtime authority
- verify no MCP route emits canonical decision-history mutations
- verify allowlist enforcement for resource/tool catalog
- verify MCP responses preserve observed/inferred/learned/operational semantics where relevant
- verify MCP cannot mutate casebook, playbook, or prior validation state

## Operational Honesty

Expose only what is truly implemented. Mark everything else as deferred.
