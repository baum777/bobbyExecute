## Cursor Cloud specific instructions

### Project overview

Governance-first Solana trading bot. Primary codebase is TypeScript in `bot/`. See `README.md` for architecture details.

### Key commands (all run from `bot/`)

| Task | Command |
|---|---|
| Install deps | `npm install` |
| Lint | `npm run lint` |
| Tests (all) | `npm test` |
| Golden tasks | `npm run test:golden` |
| Chaos gate | `npm run test:chaos` |
| **Pre-merge gate** | `npm run premerge` |
| Build | `npm run build` |

### Non-obvious notes

- **Node 22 required** — enforced by `engines` field and `.nvmrc`. The VM snapshot already has Node 22 installed.
- All tests run fully offline using deterministic stubs/fixtures — no external APIs, wallets, or Solana RPC needed.
- `snappyjs` and `@types/snappyjs` must be resolvable after install (memory compression). The setup script verifies this.
- `dor-bot/` is a Python legacy component — not required for the core test/lint/build pipeline.
- The `premerge` script (`npm run premerge`) is the canonical quality gate: lint → golden tasks → chaos gate. Always run it before committing.

### ReducedMode V1 monorepo (pnpm workspace)

The `packages/` and `apps/` directories form a separate pnpm monorepo alongside `bot/`.

| Task | Command (from repo root) |
|---|---|
| Install deps | `pnpm install` |
| Lint all | `pnpm -r lint` |
| Build all | `pnpm -r build` |
| Test all | `pnpm -r test` |
| Run API (dev) | `cd apps/api && node --import tsx src/main.ts` |
| Run Worker (dev) | `cd apps/worker && node --import tsx src/main.ts` |

- Packages must be built in order: contracts → adapters → engine → apps. `pnpm -r build` handles this.
- Engine tests use `vi.spyOn` to mock adapter methods (nock does not intercept Node 22 native `fetch`).
- The API runs on port 3000 by default. POST `/reducedmode/run` will fail-closed without live DEX API connectivity.
- All engine tests run offline with deterministic fixtures — no API keys needed.
