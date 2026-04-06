# BobbyExecute MCP Skill Plane

Scope: bounded MCP posture and exposure boundaries.
Authority: architecture support doc for MCP scope only.

## Purpose

Document the current MCP boundary without inflating implementation maturity or authority scope.

## Current Status

- MCP is bounded and non-authoritative.
- Current slice remains resource-oriented and read-only in posture.
- No execution approvals, control mutations, or live trading actions are exposed through MCP.

## Target State

Resource-first with an optional small set of explicitly named read-only tools, only when contract-governed and safe.

## Authority Boundary

- MCP cannot create, mutate, or approve execution authority.
- MCP cannot become a second decision-history truth source.
- MCP must be safe to disable without runtime authority impact.

## Inputs

- bounded, typed intelligence and replay-ready read surfaces
- metadata about provenance, timestamps, and limitations
- approved derived memory/casebook summaries only (when exposed), never raw mutable notes

## Outputs

- read-only resources and optionally read-only tool responses
- normalized, typed bundles with explicit boundary metadata

## Canonical Truth Relation

MCP exposes read views only. Canonical decision truth remains runtime cycle-summary `decisionEnvelope`.

## What This Is Not

- Not a generic tool router.
- Not an authority or control plane.
- Not a permission to expand scope beyond allowlisted read surfaces.

## Dependencies

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/05_governance/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/forensics-evidence-plane.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/03_skill_plane/mcp-posture-and-exposure-catalog.md`

## Deferred Scope

- OAuth/session complexity.
- write-capable tool surfaces.
- approval or execution mutation routes.
- mutation of casebook, playbook, or prior validation state.
