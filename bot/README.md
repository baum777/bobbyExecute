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

## Runbook Pointers

- [`docs/06_journal_replay/staging-live-preflight-runbook.md`](C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-runbook.md)
- [`docs/06_journal_replay/staging-live-preflight-evidence-template.md`](C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-evidence-template.md)
- [`docs/06_journal_replay/boot-critical-artifact-preparation.md`](C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/boot-critical-artifact-preparation.md) is a pointer only; the boot-critical file list now lives in the live preflight runbook.
