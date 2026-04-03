Pre-authority and deterministic v2 intelligence area.

PR-M0-01 lineage freeze:
- surviving deterministic pre-authority line: `SourceObservation -> DiscoveryEvidence -> CandidateToken -> UniverseBuildResult -> DataQualityV1 -> CQDSnapshotV1 -> ConstructedSignalSetV1 -> ScoreCardV1`
- this line is canonical future deterministic pre-authority naming, but is not yet the active runtime authority path
- non-surviving legacy lineages (`src/signals`, `src/scoring`, `core/universe/token-universe-builder`) are deprecated-in-place and must not gain new callers

Upper-half artifacts become typed validated inputs here before deterministic signal construction, scoring, pattern, sizing, and policy consumers use them.
W2-01 introduced the first real signal / forensics foundation:
`SignalPackV1` and `TrendReversalMonitorInputV1` plus deterministic builders.
W2-02 and later work can consume those inputs, but nothing here is wired into runtime authority yet.
W2-03 adds `signals/` as the constructed-signal bridge that consolidates upper-half observations into deterministic, pre-authority signals only.
W3-01 adds `scoring/` as the deterministic reduction bridge from `ConstructedSignalSetV1` to `ScoreCardV1`; it stays pre-decision and non-authoritative.
`quality/` is the Wave-1 admission gate only; it stops at data-quality truth and does not imply CQD or execution authority.
`cqd/` is the compact reasoning boundary only; it is hash-stable, replay-ready, and still pre-authority.

Stage 5.5 reservation:
- `TrendReversalMonitorWorker` is reserved here as a deterministic, non-LLM, shadow-only observational worker.
- It comes after `DataQualityV1`, `CQDSnapshotV1`, and the W2-01 signal/forensics foundation.
- `TrendReversalObservationV1` stays standalone first instead of merging into `SignalPackV1`.
- Later use must stay shadow-first, journal-first, and non-authoritative until an approved typed bridge exists.
- `signals/` stays descriptive and does not create decision authority.
- `scoring/` stays descriptive and does not create decision authority.
- See [`./forensics/README.md`](./forensics/README.md) and [`../../docs/architecture/trend-reversal-worker-alignment.md`](../../docs/architecture/trend-reversal-worker-alignment.md).

Wave bundle mapping note:
- `UniverseBuildResultV1` -> `UniverseBuildResult`
- `DataQualityReportV1` -> `DataQualityV1`
- `CQDArtifactV1` -> `CQDSnapshotV1`
