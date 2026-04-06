# Target Architecture: 4 Planes

Scope: concise architecture map for BobbyExecute documentation convergence.
Authority: canonical architecture support doc.

## Purpose

Provide one shared model that all architecture/runbook/module docs can reference.

## Current Status

- Authority plane is active and deterministic.
- Evidence and sidecar surfaces exist and are non-authoritative.
- MCP remains bounded/non-authoritative and unchanged for this slice.
- Workflow consumer names are now standardized; implementation depth varies by consumer.

## Plane Model

1. Deterministic Authority Plane
- runtime authority artifacts
- deterministic policy/risk/decision
- execution and verification
- canonical cycle summary `decisionEnvelope`

2. Shared Forensics / Intelligence Evidence Plane
- typed evidence bundles
- provenance metadata
- replay references and journal linkage
- non-authoritative

3. Workflow Consumer Plane
- Meta Fetch Engine
- Low Cap Hunter (optional)
- Shadow Intelligence
- all non-authoritative consumers of evidence

4. Bounded MCP Skill Plane
- bounded read-only posture
- non-authoritative
- safe to disable without runtime authority change

## Journal-Memory Overlay (A-F Mapping)

This repository now documents journal-memory as a layered overlay on top of the four-plane model:

- A Deterministic Authority Plane: execution authority and canonical `decisionEnvelope`
- B Raw Journal Truth Plane: append-only evidence-bearing journal records
- C Canonical Casebook Plane: typed case compression linked to raw evidence
- D Derived Knowledge Plane: recomputable cross-case learned views
- E Playbook / Optimization Plane: versioned evidence-linked operational guidance
- F Bounded MCP Exposure Plane: optional read-only exposure of approved views

Decision-time, outcome-time, and review-time learning must remain explicitly separated across this overlay.

## Canonical Truth Relation

Only plane 1 owns canonical decision truth.

## What This Is Not

- Not a runtime runbook.
- Not a claim of full implementation parity for every consumer.
- Not permission to treat casebook, derived knowledge, or playbooks as execution authority.
