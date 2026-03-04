import type { TokenSourceSnapshotV1, DataQualityV1, Source } from "@bobby/contracts";

const NUMERIC_FIELDS = [
  "price_usd",
  "volume_24h",
  "liquidity_usd",
  "fdv",
  "market_cap_usd",
] as const;

export function computeDataQuality(
  snapshots: TokenSourceSnapshotV1[],
  discrepancyThreshold: number,
): DataQualityV1 {
  const sourcesUsed: Source[] = [...new Set(snapshots.map((s) => s.source))];
  const discrepancies: DataQualityV1["discrepancies"] = [];

  for (const field of NUMERIC_FIELDS) {
    const valuesWithSource = snapshots
      .map((s) => ({ source: s.source, value: s[field] as number | null }))
      .filter((v) => v.value !== null && v.value !== undefined);

    for (let i = 0; i < valuesWithSource.length; i++) {
      for (let j = i + 1; j < valuesWithSource.length; j++) {
        const a = valuesWithSource[i];
        const b = valuesWithSource[j];
        if (a.value === null || b.value === null) continue;

        const relativeDelta = computeRelativeDelta(a.value, b.value);
        if (relativeDelta > discrepancyThreshold) {
          discrepancies.push({
            field,
            source_a: a.source,
            source_b: b.source,
            value_a: a.value,
            value_b: b.value,
            relative_delta: round(relativeDelta, 4),
          });
        }
      }
    }
  }

  const completeness = computeCompleteness(snapshots);
  const freshness = computeFreshness(snapshots);
  const discrepancyRate =
    sourcesUsed.length > 1
      ? round(discrepancies.length / (NUMERIC_FIELDS.length * comb2(sourcesUsed.length)), 4)
      : 0;
  const crossSourceConfidence = computeCrossSourceConfidence(
    completeness,
    discrepancyRate,
    sourcesUsed.length,
  );

  return {
    completeness: round(completeness, 2),
    freshness: round(freshness, 2),
    cross_source_confidence: round(crossSourceConfidence, 4),
    discrepancy_rate: discrepancyRate,
    sources_used: sourcesUsed,
    discrepancies,
  };
}

export function computeRelativeDelta(a: number, b: number): number {
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return 0;
  return Math.abs(a - b) / max;
}

function computeCompleteness(snapshots: TokenSourceSnapshotV1[]): number {
  if (snapshots.length === 0) return 0;

  let total = 0;
  let filled = 0;

  for (const snap of snapshots) {
    for (const field of NUMERIC_FIELDS) {
      total++;
      if (snap[field] !== null && snap[field] !== undefined) {
        filled++;
      }
    }
  }

  return total > 0 ? (filled / total) * 100 : 0;
}

function computeFreshness(snapshots: TokenSourceSnapshotV1[]): number {
  if (snapshots.length === 0) return 0;
  const now = Date.now();
  const maxAge = 5 * 60 * 1000;
  let freshTotal = 0;

  for (const snap of snapshots) {
    const fetchedAt = new Date(snap.fetched_at).getTime();
    const age = now - fetchedAt;
    const score = Math.max(0, 1 - age / maxAge);
    freshTotal += score;
  }

  return (freshTotal / snapshots.length) * 100;
}

function computeCrossSourceConfidence(
  completeness: number,
  discrepancyRate: number,
  sourceCount: number,
): number {
  const compFactor = completeness / 100;
  const discFactor = 1 - discrepancyRate;
  const multiSourceBonus = sourceCount > 1 ? 0.1 : 0;
  return Math.min(1, compFactor * discFactor + multiSourceBonus);
}

function comb2(n: number): number {
  return n < 2 ? 1 : (n * (n - 1)) / 2;
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}
