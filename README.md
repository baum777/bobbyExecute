# BobbyExecute

Scope: repository architecture and operating-truth summary.
Authority: canonical summary. Detailed boundaries live in `C:/workspace/main_projects/dotBot/bobbyExecute/docs/01_architecture/README.md` and governance docs.

## Purpose

BobbyExecute is a governance-first Solana trading system with one deterministic authority path and three explicitly non-authoritative companion planes.

## Active Today

- Runtime authority in live and dry flows builds typed authority artifacts through `buildRuntimeAuthorityArtifactChain`:
  - `bot/src/runtime/live-runtime.ts`
  - `bot/src/runtime/dry-run-runtime.ts`
- Canonical decision-history truth is cycle-summary `decisionEnvelope`:
  - `bot/src/persistence/runtime-cycle-summary-repository.ts`
- Dashboard V1 is the intended operator UI target. The canonical screen set is:
  - `/overview`
  - `/control`
  - `/journal`
  - `/recovery`
  - `/advanced`
- `Overview` is the canonical overview route. `/` is only a temporary migration shim if retained.
- Legacy mixed dashboard entry surfaces such as `/adapters` and `/decisions` are transition surfaces only and should be treated as redirect-only or to-remove, not as the intended target UI.
- The V1 dashboard applies the responsive/mobile addendum: the five-screen model stays intact across breakpoints; truth labels and effect labels remain visible on module, card, and detail surfaces; the top status strip may compress on small screens; the sidebar may collapse safely; mobile must not introduce hidden primary state or duplicate truth surfaces; `release_gate`, `kill_switch`, `blocked`, and `restart_required` remain visible in the mobile operator zone.
- Premerge gate is green and remains `npm run lint && npm test`.
- Current primary blocker is environment-backed staging/live-test readiness proof, not repo structure.

## Target Architecture (4 Planes)

1. Deterministic Authority Plane
- Only trade decision/execution authority.
- Fail-closed, replayable, journal-first.

2. Shared Forensics / Intelligence Evidence Plane
- Contract-first, replayable, provenance-aware evidence outputs.
- Non-authoritative by default.

3. Workflow Consumer Plane
- `Meta Fetch Engine` (strategic intelligence snapshot/watchlist context).
- `Low Cap Hunter` (optional opportunistic scanner; normally dormant).
- `Shadow Intelligence` (monitoring and state-transition intelligence).
- All non-authoritative.

4. Bounded MCP Skill Plane
- Bounded and read-only in this slice.
- Non-authoritative and safe to disable without affecting runtime authority.

## Authority Boundary

- Deterministic runtime is the only authority.
- MCP, sidecars, advisory routes, and dashboard views never create execution authority.
- No second decision truth is allowed.

## Canonical Truth

- Canonical decision-history artifact: `decisionEnvelope` in runtime cycle summaries.
- Action logs and dashboard projections are derived support surfaces.

## Journal-Memory Overlay

- Raw journal truth is the base evidence layer and is not rewritten retroactively.
- Casebook, derived knowledge, and playbook memory are non-authoritative unless explicitly promoted through deterministic contracts.
- Decision-time truth, outcome-time truth, and review-time learning must remain distinct.
- Freeform notes or unvalidated learned artifacts may not enter execution authority directly.

## What This Is Not

- Not a claim that MCP is a live authority/control plane.
- Not a claim that sidecar or forensics outputs can trigger execution directly.
- Not a claim that the legacy mixed dashboard remains the intended UI target.
- Not a claim of live production authorization.

## Repository Map

- `bot/`: runtime, control, persistence, contracts, adapters
- `docs/`: architecture, governance, pipeline, replay, runbooks
- `governance/`: source-of-truth boundary files
- `signer/`: remote signer boundary
- `dashboard/`: operator UI transition surface and read surfaces; V1 target screens are routed through `/overview`, `/control`, `/journal`, `/recovery`, and `/advanced`

## Canonical Documentation Entry Points

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/repo-specific-canonical-sources.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/01_architecture/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/02_pipeline/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/05_governance/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/signing-architecture.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/journal-memory-casebook-architecture.md`

## Verification Commands

Run from `bot/`:

```bash
npm install
npm run lint
npm test
npm run premerge
npm run build
```

Local papertrade onboarding index lives in [`docs/local-run.md`](C:/workspace/main_projects/dotBot/bobbyExecute/docs/local-run.md); OS-specific instructions are linked from there.
Live-limited onboarding index starts in [`docs/06_journal_replay/staging-live-preflight-runbook.md`](C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-runbook.md); OS-specific instructions are linked from there.

## Status Reminder

Current readiness blocker remains staging/live environment proof (`live:preflight` evidence), not an internal authority-migration gap.
