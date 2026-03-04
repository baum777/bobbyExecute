import type { DataQualityV1, TokenSourceSnapshotV1 } from "@reducedmode/contracts";

export interface CrossSourceConfidenceInput {
  snapshots: TokenSourceSnapshotV1[];
  discrepancyThreshold: number;
}

export function computeCrossSourceConfidence(input: CrossSourceConfidenceInput): DataQualityV1 {
  const snapshots = input.snapshots;
  const requiredPerSnapshot = 4;
  const populatedFields = snapshots.reduce((acc, snapshot) => {
    return (
      acc +
      countPresent(snapshot.price_usd) +
      countPresent(snapshot.liquidity_usd) +
      countPresent(snapshot.volume_24h_usd) +
      countPresent(snapshot.contract_address)
    );
  }, 0);

  const completenessRaw =
    snapshots.length === 0 ? 0 : (populatedFields / (snapshots.length * requiredPerSnapshot)) * 100;

  const priceValues = snapshots.map((s) => s.price_usd).filter((v): v is number => v !== null);
  const relativeDeltaPrice = computeRelativeDelta(priceValues);
  const discrepancyCount = relativeDeltaPrice !== null && relativeDeltaPrice >= input.discrepancyThreshold ? 1 : 0;
  const discrepancyRate = snapshots.length <= 1 ? 0 : discrepancyCount / (snapshots.length - 1);
  const sourceCoverage = Math.min(1, new Set(snapshots.map((s) => s.source)).size / 2);

  const confidenceRaw =
    100 -
    discrepancyRate * 50 -
    (relativeDeltaPrice ?? 0) * 30 -
    (1 - sourceCoverage) * 20 -
    (100 - completenessRaw) * 0.4;
  const confidence = clamp(confidenceRaw, 0, 100);

  const notes: string[] = [];
  if (relativeDeltaPrice !== null) {
    notes.push(`relative_delta_price=${relativeDeltaPrice.toFixed(4)}`);
  }
  if (discrepancyCount > 0) {
    notes.push("cross_source_discrepancy_detected");
  }

  return {
    data_completeness_score: clamp(completenessRaw, 0, 100),
    cross_source_confidence_score: confidence,
    discrepancy_rate: clamp(discrepancyRate, 0, 1),
    discrepancy_count: discrepancyCount,
    source_coverage: sourceCoverage,
    relative_delta_price: relativeDeltaPrice,
    notes,
  };
}

function computeRelativeDelta(values: number[]): number | null {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (avg <= 0) return null;
  return Math.abs(max - min) / avg;
}

function countPresent(value: unknown): number {
  return value === null || value === undefined || value === "" ? 0 : 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
