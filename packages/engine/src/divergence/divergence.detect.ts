import type { DivergenceV1, DivergenceType, TokenSourceSnapshotV1, NormalizedTokenV1, StructuralMetricsV1 } from "@bobby/contracts";
import { relativeDelta } from "../normalize/data.quality.js";

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
  normalized?: NormalizedTokenV1,
  structural?: StructuralMetricsV1,
): DivergenceV1 {
  const divergences: DivergenceV1["divergences"] = [];

  for (const mapping of FIELD_MAPPINGS) {
    const vals = snapshots
      .map((s) => ({ source: s.source, value: s[mapping.field] as number | null }))
      .filter((v) => v.value !== null && v.value !== undefined);

    for (let i = 0; i < vals.length; i++) {
      for (let j = i + 1; j < vals.length; j++) {
        const a = vals[i], b = vals[j];
        if (a.value === null || b.value === null) continue;
        const delta = relativeDelta(a.value, b.value);
        if (delta > threshold) {
          divergences.push({
            type: mapping.type, source_a: a.source, source_b: b.source,
            relative_delta: round(delta, 4), threshold, exceeded: true,
          });
        }
      }
    }
  }

  if (normalized && structural) {
    const priceChange = Math.abs(normalized.price_change_24h_pct ?? 0);
    if (priceChange > 20 && structural.structural_score < 40) {
      divergences.push({
        type: "price_divergence",
        source_a: "dexscreener",
        source_b: "dexpaprika",
        relative_delta: round(priceChange / 100, 4),
        threshold,
        exceeded: true,
      });
    }
  }

  const divergenceCount = divergences.filter((d) => d.exceeded).length;
  const classificationOverride = divergenceCount >= 2 ? "Fragile Expansion" : null;

  return { contract_address: contractAddress, divergences, divergence_count: divergenceCount, classification_override: classificationOverride };
}

function round(v: number, d: number): number { const f = Math.pow(10, d); return Math.round(v * f) / f; }
