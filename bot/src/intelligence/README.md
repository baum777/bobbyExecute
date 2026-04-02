Pre-authority and deterministic v2 intelligence area.

Upper-half artifacts become typed validated inputs here before deterministic scoring, pattern, sizing, and policy consume them.
W2-01 introduces the first real signal / forensics foundation:
`SignalPackV1` and `TrendReversalMonitorInputV1` plus deterministic builders.
W2-02 and later work can consume those inputs, but nothing here is wired into runtime authority yet.
`quality/` is the Wave-1 admission gate only; it stops at data-quality truth and does not imply CQD or execution authority.
`cqd/` is the compact reasoning boundary only; it is hash-stable, replay-ready, and still pre-authority.

Stage 5.5 reservation:
- `TrendReversalMonitorWorker` is reserved here as a deterministic, non-LLM observational sidecar.
- It comes after `DataQualityV1`, `CQDSnapshotV1`, and the W2-01 signal/forensics foundation.
- `TrendReversalObservationV1` stays standalone first instead of merging into `SignalPackV1`.
- Later use must stay shadow-first, journal-first, and non-authoritative until an approved typed bridge exists.
- See [`./forensics/README.md`](./forensics/README.md) and [`../../docs/architecture/trend-reversal-worker-alignment.md`](../../docs/architecture/trend-reversal-worker-alignment.md).

Wave bundle mapping note:
- `UniverseBuildResultV1` -> `UniverseBuildResult`
- `DataQualityReportV1` -> `DataQualityV1`
- `CQDArtifactV1` -> `CQDSnapshotV1`
