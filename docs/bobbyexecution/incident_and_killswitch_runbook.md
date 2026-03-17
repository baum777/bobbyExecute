# Incident and Kill-Switch Runbook

Use this runbook for controlled testing and incident response.

## Emergency stop triggers

Trigger emergency stop when any of the following occurs:

- Cat-5 chaos scenario fails
- chaos pass status drops below required threshold
- RPC verification fails on a live attempt
- circuit breaker opens on critical providers
- repeated consecutive execution failures exceed threshold
- max daily loss is exceeded
- dashboard loses bot truth connectivity during live execution

## Required operator actions

### Level 1 — Soft block
- stop new trade initiation
- continue observability collection
- investigate adapter / RPC health

### Level 2 — Hard block
- disable live trading
- block all new execution requests
- notify operator through dashboard / logs

### Level 3 — Emergency stop
- trigger bot-side kill switch
- stop all handlers that can submit trades
- confirm no pending live execution remains
- evaluate sell-all only if explicitly supported and policy-approved

## Minimum kill-switch requirements

- bot-side API or control path exists
- kill-switch state is persistent
- dashboard can show kill-switch state
- kill-switch blocks new execution immediately
- activation is journaled and logged


## Runtime control + read surfaces (paper runtime)

Current operator surfaces in `bot/`:

- `POST /emergency-stop` → activates kill-switch and pauses runtime
- `POST /control/reset` → clears kill-switch only (does not auto-resume)
- `POST /control/pause` / `POST /control/resume` / `POST /control/halt` → explicit runtime controls
- `GET /health`, `GET /kpi/summary`, `GET /runtime/status` → grounded runtime control-state visibility
- `GET /runtime/cycles` → recent persisted cycle summaries
- `GET /incidents` → recent persisted incidents

These surfaces are for dry/paper operational control and review; they are not a live-trading authorization surface.

## Post-incident review

After any incident record:

- timeline
- affected components
- financial impact
- operator actions taken
- rollback behavior
- missing telemetry
- remediation tasks

---

## Authority / Related Docs

- Canonical governance (incident section): [`governance/SoT.md §21`](../../governance/SoT.md)
- Kill switch authority: [`governance/SoT.md §16`](../../governance/SoT.md)
- Production checklist: [`production_readiness_checklist.md`](production_readiness_checklist.md)
- Domain index: [`docs/bobbyexecution/README.md`](README.md)
