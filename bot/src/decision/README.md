# Decision Module

Scope: deterministic downstream decision artifacts and authority boundaries.
Authority: module support doc only.

## Purpose

Anchor decision-layer documentation to canonical runtime authority and decision-history truth.

## Canonical Truth Relation

- Canonical decision-history source: runtime cycle-summary `decisionEnvelope`.
- This module must not introduce an alternate decision-history artifact.

## Boundary

- no sidecar authority import
- no MCP authority import
- no advisory authority import
- no direct import of unvalidated learned priors

Any future non-authoritative signal usage must pass through approved typed deterministic bridges.

Decision-time truth is owned by deterministic runtime artifacts; outcome-time and review-time learning cannot rewrite historical decision truth.

## Dependencies

- `C:/workspace/main_projects/dotBot/bobbyExecute/governance/SoT.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/05_governance/README.md`
