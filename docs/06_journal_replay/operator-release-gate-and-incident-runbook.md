# Operator Release Gate And Incident Runbook

Scope: production rollout decision support for staging, micro-live, and constrained-live transitions.
Authority: evidence guidance only. This document does not authorize runtime changes or replace control-plane checks.

## 1. Objective

Map the release decision to real repository surfaces:

- `GET /control/release-gate`
- `GET /control/status`
- `GET /health`
- `npm --prefix bot run live:preflight`
- `npm --prefix bot run recovery:worker-state`

## 2. Release Gate Stages

- `paper_safe` - paper-safe operation only; do not arm live.
- `micro_live` - micro-live can be armed, but only when readiness and evidence are explicit.
- `constrained_live` - staged live candidate is eligible and remains bounded.
- `blocked` - do not proceed; preserve evidence and hold rollout.

## 3. Operator Evidence Checklist

Before any release decision, capture:

1. `npm --prefix bot run live:preflight`
1. `npm --prefix bot run recovery:worker-state`
1. `GET /health`
1. `GET /control/status`
1. `GET /control/release-gate`

The release decision is evidence-backed only when these checks are present and the gate response is not `blocked`.

## 4. Incident Procedures

### Provider outage

- Hold rollout.
- Inspect `GET /health` and `GET /kpi/adapters`.
- Use `POST /control/pause` or `POST /control/emergency-stop` depending severity.

### Signer failure

- Fail closed.
- Use `POST /control/emergency-stop` or `POST /control/halt`.
- Re-run `npm --prefix bot run live:preflight` after the signer boundary is restored.

### Degraded mode

- Keep the system paper-safe.
- Use `POST /control/pause`.
- Review `GET /control/status` and the release gate checklist before any live progression.

### Rollback

- Use `POST /control/live-promotion/:id/rollback`.
- Preserve the request id and rollback reason in the operator record.

### Kill switch

- Use `POST /control/emergency-stop` first.
- Do not re-arm until evidence review completes.

## 5. Boundary Note

This runbook is operator guidance only. The real rollout gate is the control surface response and the captured evidence, not this document.
