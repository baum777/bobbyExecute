# dotBot / BobbyExecute

Governance-first Solana trading bot with deterministic execution, hash-chained memory, chaos gates, and a Fastify runtime status API.

This repository is safe-by-default. It supports offline testing, paper-style runtime cycles, and authenticated control/monitoring endpoints. It is not ready for uncontrolled live trading.

---

## Start Here

| Purpose | Document |
|---|---|
| Governance / Source of Truth | [`governance/SoT.md`](governance/SoT.md) |
| Agent / Cursor rules | [`governance/cursor_rule.md`](governance/cursor_rule.md) |
| Repo path rules | [`governance/file_path.md`](governance/file_path.md) |
| BobbyExecution navigation index | [`docs/bobbyexecution/README.md`](docs/bobbyexecution/README.md) |
| Production readiness checklist | [`docs/bobbyexecution/production_readiness_checklist.md`](docs/bobbyexecution/production_readiness_checklist.md) |
| Live test runbook | [`docs/bobbyexecution/live_test_runbook.md`](docs/bobbyexecution/live_test_runbook.md) |
| Kill-switch runbook | [`docs/bobbyexecution/incident_and_killswitch_runbook.md`](docs/bobbyexecution/incident_and_killswitch_runbook.md) |
| Trading chaos reference | [`docs/trading/trading-edge_chaos-scenarios.md`](docs/trading/trading-edge_chaos-scenarios.md) |

### Best entry point by role

| Role | Start here |
|---|---|
| Contributor | `README.md` -> [`governance/SoT.md`](governance/SoT.md) -> [`docs/bobbyexecution/README.md`](docs/bobbyexecution/README.md) |
| Operator / end user | `README.md` -> [`bot/CONFIG_GUIDE.md`](bot/CONFIG_GUIDE.md) -> [`docs/bobbyexecution/live_test_runbook.md`](docs/bobbyexecution/live_test_runbook.md) |
| Auditor | [`governance/SoT.md`](governance/SoT.md) -> [`docs/bobbyexecution/production_readiness_audit_report.md`](docs/bobbyexecution/production_readiness_audit_report.md) |
| Implementer | [`governance/SoT.md`](governance/SoT.md) -> [`docs/bobbyexecution/navigation_protocol.md`](docs/bobbyexecution/navigation_protocol.md) -> [`docs/bobbyexecution/spec_generation_protocol.md`](docs/bobbyexecution/spec_generation_protocol.md) |
| Incident responder | [`docs/bobbyexecution/incident_and_killswitch_runbook.md`](docs/bobbyexecution/incident_and_killswitch_runbook.md) |

---

## Repository Context

This repo bundles two runtimes:

- `bot/` - active TypeScript implementation for the current runtime, governance, tests, and HTTP visibility API
- `dor-bot/` - legacy Python reference components

The TypeScript runtime is the primary path for current work. The Python tree is kept for reference only.

---

## Quick Start

If you are new to the project, use this sequence:

1. Read [`governance/SoT.md`](governance/SoT.md) first.
2. Open [`bot/CONFIG_GUIDE.md`](bot/CONFIG_GUIDE.md) to understand modes and environment variables.
3. Install dependencies from `bot/`.
4. Run the local quality checks.
5. Start the runtime server.
6. Use the health and KPI endpoints before trying control actions.

### Required basics

- Node 22
- A terminal
- A local checkout of this repository
- For control or operator actions, the relevant environment tokens

### Safe default mode

The usual learning and development setup is:

```bash
LIVE_TRADING=false
DRY_RUN=true
RPC_MODE=stub
TRADING_ENABLED=false
```

This keeps the runtime offline and avoids real wallet risk.

---

## Setup And Verification

All commands below run from `bot/`.

```bash
cd bot
npm install
npm run lint
npm test
npm run build
npm run premerge
```

Recommended order for a new machine:

1. `npm install`
2. `npm run lint`
3. `npm test`
4. `npm run build`
5. `npm run premerge`

The `premerge` script is the canonical quality gate: lint -> golden tasks -> chaos gate -> integration -> e2e -> config checks.

If you only want the fastest useful local check, run:

```bash
cd bot
npm run lint
npm test
```

For the live-test workflow, use:

```bash
cd bot
npm run live:preflight
npm run live:test
```

The preflight command validates the full offline gate plus live-test prerequisites before the server starts.

---

## Runtime Server

After `npm run build`, start the API server with:

```bash
cd bot
npm run start:server
```

The default port is `3333`.

Available endpoints:

- `GET /health`
- `GET /kpi/summary`
- `GET /kpi/decisions`
- `GET /kpi/adapters`
- `GET /kpi/metrics`
- `GET /runtime/status`
- `GET /runtime/cycles`
- `GET /runtime/cycles/:traceId/replay`
- `GET /incidents`
- `POST /emergency-stop`
- `POST /control/pause`
- `POST /control/resume`
- `POST /control/halt`
- `POST /control/reset`
- `POST /control/live/arm`
- `POST /control/live/disarm`

Control and operator routes require authentication headers:

- `x-control-token` or `Authorization: Bearer <token>`
- `x-operator-token` or `Authorization: Bearer <token>`

If those tokens are not configured, the routes fail closed with `403`.

---

## Modes

The config loader derives runtime behavior from environment variables.

| Mode | Environment shape | Behavior |
|---|---|---|
| Dry | `LIVE_TRADING=false`, `DRY_RUN=true`, `RPC_MODE=stub` | Simulated result, no real swap |
| Paper | `LIVE_TRADING=false`, `DRY_RUN=false`, `RPC_MODE=stub` | Simulated execution with runtime visibility |
| Live-test | `LIVE_TRADING=true`, `RPC_MODE=real` | Guarded live-test session, only when all live prerequisites pass |

Live-test also requires:

- `TRADING_ENABLED=true`
- `LIVE_TEST_MODE=true`
- `WALLET_ADDRESS`
- `CONTROL_TOKEN`
- `OPERATOR_READ_TOKEN`

The config validation is fail-closed. Invalid combinations reject startup.

Live-test operators should watch `GET /health`, `GET /kpi/summary`, and `GET /runtime/status`, and use `POST /emergency-stop` or `POST /control/reset` for bounded round control. The runbook is [`docs/bobbyexecution/live_test_runbook.md`](docs/bobbyexecution/live_test_runbook.md).

---

## User Flow

For someone with little GitHub or on-chain experience, the safest path is:

1. Install dependencies.
2. Run the test suite and premerge gate.
3. Start the server in dry or paper mode.
4. Check `GET /health` and `GET /kpi/summary`.
5. Inspect `GET /runtime/status` and `GET /incidents`.
6. Only then consider the live-test runbook.

Useful docs for that flow:

- [`bot/CONFIG_GUIDE.md`](bot/CONFIG_GUIDE.md)
- [`docs/bobbyexecution/live_test_runbook.md`](docs/bobbyexecution/live_test_runbook.md)
- [`docs/bobbyexecution/incident_and_killswitch_runbook.md`](docs/bobbyexecution/incident_and_killswitch_runbook.md)

---

## Architecture Overview

### Classic runtime pipeline

```text
Ingest -> Signal -> Risk -> Execute -> Verify -> Journal -> Monitor
```

Goal: deterministic trade processing with fail-closed behavior on risk or verification failures.

### Extended execution pipeline

```text
Research -> Analyse (MCI/BCI/Hybrid) -> Reasoning + Pattern
-> Compress DB (Snappy + SHA-256) -> Chaos Gate (19 scenarios)
-> Memory Log (Hash-Chain) -> Focused TX Execute
-> Loop via Action Handbook Lookup
```

Key guardrails:

- `DecisionResult.decision = allow|deny`
- TX only on `allow` plus a valid vault lease
- Fail closed on low data quality, chaos failure, or vault problems

---

## Bootstrap And Pipeline

### Bootstrap flow

```text
1. loadConfig()                     -> Zod-validated config from env
2. assertLiveTradingPrerequisites()  -> live mode requires real RPC and all live prerequisites
3. createServer()                   -> Fastify HTTP API
4. runtime loop                     -> Ingest -> Signal -> Risk -> Execute -> Verify -> Journal -> Monitor
```

**Entry point:** `bot/src/server/run.ts` -> `bootstrap()` from `bot/src/bootstrap.ts`

### Trade pipeline

```text
Ingest -> Signal -> Risk -> Execute -> Verify -> Journal -> Monitor
```

| Stage | Input | Output | Block condition |
|---|---|---|---|
| Ingest | - | `MarketSnapshot`, `WalletSnapshot` | Adapter failure |
| Signal | market, wallet | direction, confidence | - |
| Risk | intent, market, wallet | allowed / denied | `!risk.allowed` -> return before execute |
| Execute | intent | `ExecutionReport` | Daily loss limit -> block before execute |
| Verify | intent, execReport | `RpcVerificationReport` | `!rpcVerify.passed` -> no journal |
| Journal | decisionHash, resultHash, input, output | `JournalEntry` appended | Mandatory write; failure blocks |
| Monitor | state | - | - |

### Execution modes

| Mode | `dryRun` | `executionMode` | Swap behavior |
|---|---|---|---|
| Dry | true | dry | Paper result, no real swap |
| Paper | false | paper | Simulated execution |
| Live | false | live | Real swap; requires `LIVE_TRADING=true` and `RPC_MODE=real` |

---

## Readiness

Current production readiness is **not suitable for uncontrolled live trading**.

Use this rule of thumb:

- Dry run for learning and validation
- Paper mode for repeated testing
- Live test only after the live-test checklist passes
- Kill switch and incident runbook if anything behaves unexpectedly

See [`docs/bobbyexecution/production_readiness_audit_report.md`](docs/bobbyexecution/production_readiness_audit_report.md) for the current audit state.

---

## Repository Structure

```text
/
├─ governance/              canonical governance layer
├─ docs/
│  ├─ bobbyexecution/       operational docs and runbooks
│  ├─ trading/              chaos scenario reference
│  ├─ architecture/         architecture blueprints
│  └─ operations/           operations guides
├─ bot/                     TypeScript production codebase
├─ ops/agent-team/          governance and team artifacts
├─ packages/skills/         skill manifests and instructions
└─ dor-bot/                 Python legacy
```

---

## License

See [`LICENSE`](LICENSE).
