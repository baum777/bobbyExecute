# Repo-Specific Canonical Sources

Scope: repository-local source-of-truth hierarchy.
Authority: authoritative for documentation-tier classification in BobbyExecute.

## Tiered Truth Model

### Tier 0: Governance Entry

- `C:/workspace/main_projects/dotBot/bobbyExecute/governance/SoT.md`

### Tier 1: Canonical Architecture And Boundaries

- `C:/workspace/main_projects/dotBot/bobbyExecute/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/01_architecture/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/02_pipeline/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/05_governance/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/target-architecture-4-plane.md`

The Tier 1 architecture and boundary docs above now also carry the Dashboard V1 target route model (`/overview`, `/control`, `/journal`, `/recovery`, `/advanced`) and the responsive/mobile addendum.

### Tier 2: Canonical Support Documents

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/glossary/architecture-terms.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/forensics-evidence-plane.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/signing-architecture.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/workflow-consumers.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/journal-memory-casebook-architecture.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/architecture/journal-memory-validation-gates.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/03_skill_plane/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/04_sidecars/README.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/README.md`

### Tier 3: Operational Runbooks, Pointers, And Env Examples (Non-Canonical Architecture)

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/local-run.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/local-run-macos.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/local-run-windows.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/.env.papertrade.example`
- `C:/workspace/main_projects/dotBot/bobbyExecute/.env.live-local.example`
- `C:/workspace/main_projects/dotBot/bobbyExecute/dashboard/.env.example`
- `C:/workspace/main_projects/dotBot/bobbyExecute/signer/.env.example`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-runbook.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-runbook-macos.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-runbook-windows.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/boot-critical-artifact-preparation.md` (pointer only)
- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-evidence-template.md`
- `C:/workspace/main_projects/dotBot/bobbyExecute/bot/README.md`

### Tier 4: Historical Evidence And Legacy Records

- `C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/evidence-records-index.md`
- dated evidence snapshots under `docs/06_journal_replay/`
- `C:/workspace/main_projects/dotBot/bobbyExecute/archive/README.md`

## Shared-Core Boundary

Shared-core assets are consumed only through `C:/workspace/main_projects/dotBot/bobbyExecute/.codex/shared-core-consumer.json`.

The standalone shared-core repository is a workflow dependency, not BobbyExecute runtime authority.

## Classification Rules

- Architecture truth must come from Tier 0-2 documents.
- Runbooks must link upward to Tier 1 and must not define alternate architecture truth.
- Historical evidence records must be explicitly dated and labeled non-canonical.
- Canonical decision-history truth is runtime cycle summary `decisionEnvelope`.
