import type { DivergenceV1, DivergenceType, TokenSourceSnapshotV1 } from "@bobby/contracts";
import { computeRelativeDelta } from "../normalize/crosssource.confidence.js";

interface FieldMapping {
  type: DivergenceType;
  field: keyof Pick<TokenSourceSnapshotV1, "price_usd" | "volume_24h" | "liquidity_usd" | "fdv">;
}

const FIELD_MAPPINGS: FieldMapping[] = [
  { type: "price_divergence", field: "price_usd" },
  { type: "volume_divergence", field: "volume_24h" },
  { type: "liquidity_divergence", field: "liquidity_usd" },
  { type: "fdv_divergence", field: "fdv" },
];

export function detectDivergences(
  contractAddress: string,
  snapshots: TokenSourceSnapshotV1[],
  threshold: number,
): DivergenceV1 {
  const divergences: DivergenceV1["divergences"] = [];

  for (const mapping of FIELD_MAPPINGS) {
    const values = snapshots
      .map((s) => ({ source: s.source, value: s[mapping.field] as number | null }))
      .filter((v) => v.value !== null && v.value !== undefined);

    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const a = values[i];
        const b = values[j];
        if (a.value === null || b.value === null) continue;

        const delta = computeRelativeDelta(a.value, b.value);
        const exceeded = delta > threshold;

        if (exceeded) {
          divergences.push({
            type: mapping.type,
            source_a: a.source,
            source_b: b.source,
            relative_delta: round(delta, 4),
            threshold,
            exceeded,
          });
        }
      }
    }
  }

  const divergenceCount = divergences.filter((d) => d.exceeded).length;
  const classificationOverride = divergenceCount >= 2 ? "Fragile Expansion" : null;

  return {
    contract_address: contractAddress,
    divergences,
    divergence_count: divergenceCount,
    classification_override: classificationOverride,
  };
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}
