# BobbyExecute Bot Runtime

Scope: operational runtime/service reference for `bot/`.
Authority: operational reference only. Architecture source-of-truth lives in top-level docs.

## Purpose

Describe runnable commands, runtime surfaces, and operator boundaries for the bot services.

## Current Runtime Truth

- Deterministic authority runtime is active.
- Live/dry runtime paths build authority artifacts and persist cycle summaries with canonical `decisionEnvelope`.
- Public server surfaces are read-oriented.
- Private control surfaces mutate runtime posture and safety controls; they are not strategy authority.

## Canonical Architecture References

- `C:/workspace/main_projects/dotBot/bobbyExecute/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/01_architecture/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/02_pipeline/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/05_governance/README.md`

## Commands (run from `bot/`)

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

`npm run premerge` currently resolves to lint plus full unit test suite (`npm run lint && npm test`).

## Runtime Surfaces

Public read surfaces:
- `GET /health`
- `GET /kpi/summary`
- `GET /kpi/decisions`
- `GET /kpi/decisions/:traceId/advisory` (optional advisory, non-authoritative)
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

## Authority And Safety Notes

- Canonical decision-history source is cycle-summary `decisionEnvelope`.
- Advisory LLM routes are optional and non-authoritative.
- If control tokens are missing, protected routes fail closed.
- If schema readiness is missing or mismatched, services fail closed.

## Runbook References

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-runbook.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/boot-critical-artifact-preparation.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-evidence-template.md`
