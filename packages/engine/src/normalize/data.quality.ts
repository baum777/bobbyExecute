import type { TokenSourceSnapshotV1, DataQualityV1, Source } from "@bobby/contracts";

const CORE_FIELDS = ["price_usd", "volume_24h", "liquidity_usd", "fdv"] as const;

export function computeDataQuality(
  snapshots: TokenSourceSnapshotV1[],
  discrepancyThreshold: number,
): DataQualityV1 {
  const sourcesUsed: Source[] = [...new Set(snapshots.map((s) => s.source))];
  const discrepancies: DataQualityV1["discrepancies"] = [];

  for (const field of CORE_FIELDS) {
    const vals = snapshots
      .map((s) => ({ source: s.source, value: s[field] as number | null }))
      .filter((v) => v.value !== null && v.value !== undefined);

    for (let i = 0; i < vals.length; i++) {
      for (let j = i + 1; j < vals.length; j++) {
        const a = vals[i], b = vals[j];
        if (a.value === null || b.value === null) continue;
        const delta = relativeDelta(a.value, b.value);
        if (delta > discrepancyThreshold) {
          discrepancies.push({
            field, source_a: a.source, source_b: b.source,
            value_a: a.value, value_b: b.value,
            relative_delta: round(delta, 4),
          });
        }
      }
    }
  }

  const completeness = computeCompletenessScore(snapshots, sourcesUsed.length);
  const freshness = computeFreshness(snapshots);
  const discrepancyRate = sourcesUsed.length > 1
    ? round(discrepancies.length / (CORE_FIELDS.length * comb2(sourcesUsed.length)), 4)
    : 0;
  const crossSourceConfidence = computeCrossSourceConfidence(completeness, discrepancyRate, sourcesUsed.length);

  return {
    completeness: round(completeness, 2),
    freshness: round(freshness, 2),
    cross_source_confidence: round(crossSourceConfidence, 4),
    discrepancy_rate: discrepancyRate,
    sources_used: sourcesUsed,
    discrepancies,
  };
}

export function computeCompletenessScore(snapshots: TokenSourceSnapshotV1[], sourceCount: number): number {
  if (snapshots.length === 0) return 0;
  let total = 0;
  let filled = 0;
  for (const snap of snapshots) {
    for (const field of CORE_FIELDS) {
      total++;
      if (snap[field] !== null && snap[field] !== undefined) filled++;
    }
  }
  const presentRatio = total > 0 ? filled / total : 0;
  const sourceBonus = Math.min(sourceCount > 1 ? 10 : 0, 10);
  return Math.min(100, presentRatio * 90 + sourceBonus);
}

function computeFreshness(snapshots: TokenSourceSnapshotV1[]): number {
  if (snapshots.length === 0) return 0;
  const now = Date.now();
  const maxAge = 5 * 60 * 1000;
  let total = 0;
  for (const snap of snapshots) {
    const age = now - new Date(snap.fetched_at).getTime();
    total += Math.max(0, 1 - age / maxAge);
  }
  return (total / snapshots.length) * 100;
}

function computeCrossSourceConfidence(completeness: number, discrepancyRate: number, sourceCount: number): number {
  const comp = completeness / 100;
  const disc = 1 - discrepancyRate;
  const bonus = sourceCount > 1 ? 0.1 : 0;
  return Math.min(1, comp * disc + bonus);
}

export function relativeDelta(a: number, b: number): number {
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return 0;
  return Math.abs(a - b) / max;
}

function comb2(n: number): number { return n < 2 ? 1 : (n * (n - 1)) / 2; }
function round(v: number, d: number): number { const f = Math.pow(10, d); return Math.round(v * f) / f; }
