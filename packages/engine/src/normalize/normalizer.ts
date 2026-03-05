import type { TokenSourceSnapshotV1, NormalizedTokenV1 } from "@bobby/contracts";
import { computeDataQuality } from "./data.quality.js";

export function normalizeToken(
  contractAddress: string,
  snapshots: TokenSourceSnapshotV1[],
  discrepancyThreshold: number,
): NormalizedTokenV1 {
  if (snapshots.length === 0) {
    throw new Error(`No snapshots for contract ${contractAddress}`);
  }
  const primary = snapshots[0];
  const dataQuality = computeDataQuality(snapshots, discrepancyThreshold);

  return {
    contract_address: contractAddress,
    symbol: primary.token_ref.symbol,
    name: primary.token_ref.name,
    price_usd: mergeNumeric(snapshots, "price_usd"),
    volume_24h: mergeNumeric(snapshots, "volume_24h"),
    liquidity_usd: mergeNumeric(snapshots, "liquidity_usd"),
    fdv: mergeNumeric(snapshots, "fdv"),
    market_cap_usd: mergeNumeric(snapshots, "market_cap_usd"),
    price_change_24h_pct: mergeNumeric(snapshots, "price_change_24h_pct"),
    tx_count_24h: mergeNumericOpt(snapshots),
    source_snapshots: snapshots,
    data_quality: dataQuality,
  };
}

function mergeNumeric(
  snaps: TokenSourceSnapshotV1[],
  field: "price_usd" | "volume_24h" | "liquidity_usd" | "fdv" | "market_cap_usd" | "price_change_24h_pct",
): number | null {
  const values = snaps.map((s) => s[field]).filter((v): v is number => v !== null && v !== undefined);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function mergeNumericOpt(snaps: TokenSourceSnapshotV1[]): number | null | undefined {
  const values = snaps.map((s) => s.tx_count_24h).filter((v): v is number => v !== null && v !== undefined);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
