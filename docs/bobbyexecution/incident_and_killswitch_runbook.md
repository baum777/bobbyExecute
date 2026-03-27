# Incident and Kill-Switch Runbook

Use this runbook for any blocked live-test, emergency stop, or post-incident recovery.

## Trigger Conditions

Trigger an emergency stop when any of these occur:

- live-test round enters `failed` or `stopped`
- RPC verification fails on a live attempt
- adapter health degrades in a live posture
- daily loss limit is reached
- the kill switch is already active
- a control route refuses a live action in a way that requires operator review
- a catastrophic chaos or risk outcome indicates the runtime should halt

## Immediate Actions

1. Stop new trade initiation.
2. Call `POST /emergency-stop`.
3. Confirm `GET /control/status` shows the expected halted or paused posture and worker heartbeat.
4. Confirm the control history contains the stop event.
5. Confirm the kill switch state is persisted and visible.

## Control Surfaces

- `POST /emergency-stop`
- `POST /control/pause`
- `POST /control/resume`
- `POST /control/halt`
- `POST /control/reset`

Read surfaces:

- `GET /health`
- `GET /kpi/summary`
- `GET /kpi/decisions`
- `GET /kpi/adapters`
- `GET /control/status`
- `GET /control/runtime-config`
- `GET /control/history`

## Recovery Sequence

1. Inspect the latest control history entry and worker visibility snapshot.
2. Confirm whether the failure was data, adapter, quote, verification, or control related.
3. Reset only after the cause is understood.
4. Use `POST /control/reset` to clear the kill switch.
5. Re-check readiness before re-arming live.

## Post-Incident Review

- Capture timestamp, affected components, operator actions, and stop reason.
- Record whether the failure was preventable or expected.
- Note any missing telemetry, stale state, or ambiguous behavior.
- Keep the incident trail aligned with the journal, worker visibility snapshot, and control history.
