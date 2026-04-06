# Discovery Module

Scope: typed discovery observations, evidence, and candidate shaping.
Authority: module support doc only.

## Purpose

Produce replayable, provenance-aware discovery artifacts for downstream deterministic and evidence-plane use.

## Current Status

Discovery builders are active producers of typed upstream artifacts (`SourceObservation`, `DiscoveryEvidence`, `CandidateToken`) and remain non-authoritative.

## Boundary

- Discovery is an evidence-plane producer.
- Discovery outputs can be consumed by deterministic authority preparation and intelligence workflows.
- Discovery must not consume sidecar outputs as authority control inputs.

## Replay / Provenance

Outputs should preserve source provenance and evidence references for downstream replay.

## Journal-Memory Relation

- discovery outputs are observed evidence inputs, not learned priors
- downstream casebook or derived knowledge layers must preserve linkages back to discovery evidence refs

## Canonical Truth Relation

Discovery does not own decision truth. Canonical decision-history remains cycle-summary `decisionEnvelope`.

## Dependencies

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/02_pipeline/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/forensics-evidence-plane.md`
