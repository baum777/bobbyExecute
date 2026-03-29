# Operator Deploy Runbook

## 1. Purpose
- This runbook is the single short path for controlled staging-to-production rollout of BobbyExecute.
- It supports a tightly controlled launch, not unconstrained broad production.
- Use this alongside `RENDER_DEPLOYMENT.md` and `render.yaml` as the deployment source of truth.

## 2. Preconditions
- Required secrets are set in Render: `CONTROL_TOKEN`, `OPERATOR_READ_TOKEN`, `DASHBOARD_SESSION_SECRET`, `DASHBOARD_OPERATOR_DIRECTORY_JSON`, `MORALIS_API_KEY`, `JUPITER_API_KEY`, `WORKER_DEPLOY_HOOK_URL`, `CONTROL_RESTART_ALERT_WEBHOOK_URL`, `CONTROL_RESTART_ALERT_WEBHOOK_TOKEN`, `DATABASE_URL`, and `REDIS_URL`.
- At least one active dashboard operator exists in `DASHBOARD_OPERATOR_DIRECTORY_JSON`, and that operator has admin access for privileged launch actions.
- Required Render services exist for both staging and production: bot, control, runtime worker, dashboard, rehearsal refresh cron, primary Postgres, rehearsal Postgres, and Key Value.
- Database prerequisites are satisfied: `cd bot && npm run db:status` is `ready`, any required migrations have been applied, and the latest rehearsal evidence is available or can be refreshed.
- If the worker disk changed, `cd bot && npm run recovery:worker-state -- --journal-path=/var/data/journal.jsonl` has been checked before launch.

## 3. Staging Deploy
1. Deploy or push the commit that contains `render.yaml` to staging.
2. Wait for the staging bot, control, worker, dashboard, and rehearsal refresh cron to become healthy.
3. Verify the public bot endpoints: `GET /health` and `GET /kpi/summary`.
4. Verify the control endpoints: `GET /control/status`, `GET /control/runtime-status`, `GET /control/runtime-config`, and `GET /control/history`.

## 4. Staging Validation
- Log in to the staging dashboard with a configured operator account and confirm the session is active.
- Confirm a privileged dashboard action goes through the server-side proxy boundary and reaches the control service with the operator identity attached.
- Check worker and control freshness: `GET /control/status` or `GET /control/runtime-status` should show a fresh or understood rehearsal status, a healthy worker heartbeat, and the expected restart state.
- Confirm rehearsal evidence is present and current. If needed, run `cd bot && npm run recovery:db-rehearse:render`; use `cd bot && npm run recovery:db-rehearse` only to rebuild evidence after the Render-native path is unavailable, and keep automation health marked degraded until the next automated refresh lands.
- For restore validation, run `cd bot && npm run recovery:db-validate -- --input=<known-good-snapshot.json> --journal-path=/var/data/journal.jsonl` and open [`recovery_and_upgrade_runbook.md`](recovery_and_upgrade_runbook.md) for the full drill sequence.

## 5. Production Go/No-Go Checklist
- [ ] Dashboard auth is configured and a real admin login works.
- [ ] Staging endpoints are healthy.
- [ ] `cd bot && npm run db:status` is `ready`.
- [ ] The latest rehearsal evidence is fresh from the Render-native automation path.
- [ ] No open restart alerts or stale worker heartbeat block promotion.
- [ ] Backup / restore validation has been completed against a known-good snapshot or staging clone.
- [ ] The production Render secrets and service wiring are present and reviewed.

## 6. Production Promotion Steps
1. Freeze further changes for the launch window.
2. Re-check the go/no-go checklist and confirm the dashboard session plus control proxy still work.
3. Promote the same commit from staging to production manually in the Render UI.
4. If a governed live promotion is part of the launch, get the required operator approval in the dashboard or control flow before applying it.
5. Watch `GET /control/status`, `GET /control/runtime-status`, and `GET /control/restart-alerts` until the worker heartbeat, freshness gate, and restart state are stable.

## 7. Rollback / Downgrade
- Stop immediately if control status turns `error`, rehearsal freshness turns `stale` or `failed`, dashboard auth breaks, or restart alerts remain unresolved.
- For a governed live promotion rollback, use `POST /control/live-promotion/:id/rollback`.
- For a release rollback, redeploy the last known good commit in Render and then confirm the control and rehearsal states again.
- Open [`incident_and_killswitch_runbook.md`](incident_and_killswitch_runbook.md) and [`recovery_and_upgrade_runbook.md`](recovery_and_upgrade_runbook.md) if the rollback is triggered by a safety or schema issue.

## 8. Fast Links
- [`RENDER_DEPLOYMENT.md`](../../RENDER_DEPLOYMENT.md)
- [`production_readiness_checklist.md`](production_readiness_checklist.md)
- [`recovery_and_upgrade_runbook.md`](recovery_and_upgrade_runbook.md)
- [`live_test_runbook.md`](live_test_runbook.md)
- [`render.yaml`](../../render.yaml)
