# Repo-Specific Canonical Sources

Scope: repository-local source-of-truth map.  
Authority: authoritative for which local documents define BobbyExecute truth.

## Canonical Local Sources

- `README.md`
- `docs/01_architecture/README.md`
- `docs/02_pipeline/README.md`
- `docs/03_skill_plane/README.md`
- `docs/04_sidecars/README.md`
- `docs/05_governance/README.md`
- `docs/06_journal_replay/README.md`
- `docs/codex-workflow-consumer.md`
- `.codex/repo-intake-inputs.json`
- `.codex/runtime-policy-inputs.json`
- `governance/SoT.md`

## Shared-Core Boundary

Shared-core assets are consumed only through `.codex/shared-core-consumer.json`.

The standalone shared-core repository is not the runtime or architecture source of truth for BobbyExecute. It is a reusable workflow dependency.

## Truth Labels

- deterministic core: authority
- MCP skill plane: advisory target, partially implemented locally
- shadow cognitive sidecars: advisory only
- dashboard/control projections: mixed canonical and derived views depending on producer
