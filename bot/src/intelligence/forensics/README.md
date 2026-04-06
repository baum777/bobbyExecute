# Forensics Module

Scope: shared forensics evidence contracts and builders.
Authority: module support doc only.

## Purpose

Provide shared non-authoritative evidence artifacts that can be reused by multiple workflow consumers.

## Current Status

Forensics owns typed observational contracts/builders and monitoring inputs. Outputs remain non-authoritative.

## Evidence Domains

- provenance and source lineage
- holder and liquidity integrity
- toxicity/manipulation patterns
- migration/launch/deployer-linked transitions
- attention and state-transition signals

## Workflow Consumer Relation

Forensics outputs are intended for:
- `Meta Fetch Engine` context
- `Low Cap Hunter` optional scans
- `Shadow Intelligence` monitoring

All consumption remains non-authoritative.

## Replay And Evidence References

Forensics outputs must preserve evidence references, timestamps, and source coverage for replay.

## Journal-Memory Relation

- forensics is a Layer B/Layer C input source (raw evidence -> potential case compression)
- forensics outputs do not become canonical case truth without explicit casebook contracts
- forensics outputs do not become derived knowledge or playbook authority by default

## Boundary

- no scoring/policy/execution authority creation
- no direct execution bridge

## Dependencies

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/forensics-evidence-plane.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/workflow-consumers.md`
