Pre-authority v2 forensics foundation.

This directory now owns the typed Signal / Forensics input layer:
- `SignalPackV1`
- `TrendReversalMonitorInputV1`
- deterministic builders for market structure, holder / flow visibility, manipulation visibility, and signal assembly

It also keeps the later trend-reversal observation sidecar contract in the same namespace, but none of these artifacts create decision authority.
The local `index.ts` barrel is intentionally narrow and stays input-oriented.

Stage 5.5 placement:
- after `DataQualityV1`
- after `CQDSnapshotV1`
- before any downstream scoring, pattern, policy, or execution use

Rules:
- keep `SignalPackV1` observational and journalable
- keep missing / partial / stale semantics explicit
- preserve evidence refs and source coverage explicitly
- do not add scoring, pattern classification, policy logic, or execution intent here

Future consumers must use approved typed deterministic bridges only.
