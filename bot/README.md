# BobbyExecute Bot Runtime

Scope: operational reference for `bot/` only.
For papertrade onboarding, use [`docs/local-run.md`](C:/workspace/main_projects/dotBot/bobbyExecute/docs/local-run.md).
For live-limited onboarding, use [`docs/06_journal_replay/staging-live-preflight-runbook.md`](C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-runbook.md).

## Purpose

Describe runnable commands, runtime surfaces, and operator boundaries for the bot services.

## Commands

Run from `bot/`:

```bash
npm install
npm run lint
npm test
npm run test:golden
npm run test:chaos
npm run test:integration
npm run test:e2e
npm run test:config
npm run db:status
npm run db:bootstrap
npm run db:migrate
npm run recovery:db-backup
npm run recovery:db-restore
npm run recovery:db-validate
npm run recovery:db-rehearse
npm run recovery:db-rehearse:render
npm run recovery:worker-state
npm run build
npm run premerge
npm run start:server
npm run start:control
npm run start:worker
npm run live:preflight
npm run live:test
```

`npm run premerge` resolves to lint plus the full unit test suite.

## Local Verification

Use this checklist for full-pipeline papertrade or local live-limited validation:

1. `npm run build`
2. `npm run db:status`
3. `npm run db:migrate`
4. `npm run start:server`, then confirm `GET /health`
5. `npm run start:worker`
6. In PowerShell, run `$env:PORT="3334"; npm run start:control`, then confirm `GET /health`
7. From `dashboard/`, run `npm run dev` for interactive local work or `npm run start` after build, then confirm `http://127.0.0.1:3000`
8. Expect possible `403` responses on control and dashboard flows until `CONTROL_TOKEN`, `OPERATOR_READ_TOKEN`, and dashboard operator config are aligned

Boot-only / dry / stub validation does not need the full pipeline above.

## Runtime Surfaces

Public read surfaces:

- `GET /health`
- `GET /kpi/summary`
- `GET /kpi/decisions`
- `GET /kpi/decisions/:traceId/advisory`
- `GET /kpi/adapters`
- `GET /kpi/metrics`

Private control read surfaces:

- `GET /control/status`
- `GET /control/runtime-config`
- `GET /control/runtime-status`
- `GET /control/restart-alerts`
- `GET /control/history`

Private control mutation surfaces:

- `POST /emergency-stop`
- `POST /control/pause`
- `POST /control/resume`
- `POST /control/halt`
- `POST /control/reset`
- `POST /control/mode`
- `POST /control/runtime-config`
- `POST /control/reload`
- `POST /control/restart-worker`
- `POST /control/restart-alerts/:id/acknowledge`
- `POST /control/restart-alerts/:id/resolve`

## Safety Notes

- Canonical decision-history source is cycle-summary `decisionEnvelope`.
- Advisory LLM routes are optional and non-authoritative.
- Missing control tokens cause protected routes to fail closed.
- Schema mismatches and missing readiness state also fail closed.
- The Postgres surfaces are shared operational state, not canonical runtime truth.
- `DATABASE_URL` may point at Supabase PostgreSQL or Neon PostgreSQL; the repo normalizes managed hosts to TLS-required pool configuration.
- `REDIS_URL` remains separately required for the runtime-config store; blank values fall back to local memory/file stores and are not truthful multi-process runtime.

## Neon Bootstrap

`npm run db:bootstrap` is the fail-closed connection-preparation path.

- If `DATABASE_URL` already exists, the command leaves it unchanged and runs the existing migration command.
- If `DATABASE_URL` is missing, the command requires `NEON_API_KEY` and resolves a connection from Neon API resources.
- Optional disambiguation envs are `NEON_ORG_ID`, `NEON_PROJECT_ID`, `NEON_PROJECT_NAME`, `NEON_BRANCH_ID`, `NEON_BRANCH_NAME`, `NEON_DATABASE_NAME`, `NEON_ROLE_NAME`, and `NEON_ENDPOINT_ID`.
- The bootstrap step emits `DATABASE_URL` and `DIRECT_URL` for the next step when `--emit-env` is used.
- `DATABASE_URL` is the app/runtime URL; `DIRECT_URL` is only for migrations when present.

## Runbook Pointers

- [`docs/06_journal_replay/staging-live-preflight-runbook.md`](C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-runbook.md)
- [`docs/06_journal_replay/staging-live-preflight-evidence-template.md`](C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-evidence-template.md)
- [`docs/06_journal_replay/boot-critical-artifact-preparation.md`](C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/boot-critical-artifact-preparation.md) is a pointer only; the boot-critical file list now lives in the live preflight runbook.
