# Staging Database Rehearsal Evidence — 2026-04-07

Scope: readiness proof for the fresh Postgres rehearsal run of the target staging environment.
Authority: historical evidence only; does not alter canonical runtime authority.

## Job Metadata
- Cron service: `bobbyexecute-rehearsal-refresh-staging`
- Cron service ID: `crn-d7526dea2pns73ara6rg`
- Schedule: `0 3 * * *` (daily maintenance window)
- Command executed by Render: `npm run recovery:db-rehearse:render`

## Evidence Capture
- Action: polled Render API `GET https://api.render.com/v1/logs` with `ownerId=tea-d6is18p5pdvs73c4i4sg` and `resource=crn-d7526dea2pns73ara6rg` to retrieve the log snippet of the April 7 run.
- Key observed log lines (timestamp `2026-04-07T03:01:16.5165Z`):
  - `"summary": "Disposable database rehearsal passed. Source ready:ready, target ready:ready, restore status=exact_match."`
  - The log also recorded `workerRestarts: 0`, `restartAlerts: 0`, `governanceAudits: 0`, `livePromotions: 0`, confirming a clean rehearsal run and exact-match verification.
- `hasMore:true` indicates pagination is available, but the captured chunk contains the success summary.

## Result
- Status: success; the rehearsal completed with an `exact_match` restore status and no mismatches.
- Interpretation: the staging Postgres transfer/restoration tooling is currently capable of producing a fresh disposable rehearsal state, satisfying the “fresh database restore/rehearsal evidence” requirement for the target environment.
