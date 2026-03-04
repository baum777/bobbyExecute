import {
  NormalizedTokenV1Schema,
  TokenSourceSnapshotV1Schema,
  type NormalizedTokenV1,
  type TokenRefV1,
  type TokenSourceSnapshotV1,
} from "@reducedmode/contracts";
import type { UniverseTokenCandidate } from "../universe/dedupe.balance.js";
import { computeCrossSourceConfidence } from "./crosssource.confidence.js";

export interface NormalizeInput {
  candidates: UniverseTokenCandidate[];
  discrepancyThreshold: number;
}

export function normalizeUniverse(input: NormalizeInput): NormalizedTokenV1[] {
  const grouped = new Map<string, UniverseTokenCandidate[]>();
  for (const candidate of input.candidates) {
    const key = candidate.contract_address;
    const current = grouped.get(key) ?? [];
    current.push(candidate);
    grouped.set(key, current);
  }

  const normalized = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([contractAddress, candidates]) => {
      const token = selectTokenRef(contractAddress, candidates);
      const snapshots = candidates.map((candidate) => mapSnapshot(token, candidate));
      const quality = computeCrossSourceConfidence({
        snapshots,
        discrepancyThreshold: input.discrepancyThreshold,
      });

      const merged = {
        price_usd: averageNullable(snapshots.map((snapshot) => snapshot.price_usd)),
        liquidity_usd: averageNullable(snapshots.map((snapshot) => snapshot.liquidity_usd)),
        volume_24h_usd: averageNullable(snapshots.map((snapshot) => snapshot.volume_24h_usd)),
        txns_24h: averageIntNullable(snapshots.map((snapshot) => snapshot.txns_24h ?? null)),
      };

      return NormalizedTokenV1Schema.parse({
        token,
        snapshots,
        merged,
        quality,
      });
    });

  return normalized;
}

function selectTokenRef(contractAddress: string, candidates: UniverseTokenCandidate[]): TokenRefV1 {
  const head = candidates[0];
  return {
    contract_address: contractAddress,
    chain: "solana",
    symbol: head?.pair.base_symbol ?? "UNKNOWN",
    name: head?.pair.base_symbol ?? "UNKNOWN",
    pair_id: head?.pair.pair_id,
    source_primary: head?.source ?? "dexscreener",
  };
}

function mapSnapshot(token: TokenRefV1, candidate: UniverseTokenCandidate): TokenSourceSnapshotV1 {
  return TokenSourceSnapshotV1Schema.parse({
    source: candidate.source,
    fetched_at: candidate.pair.fetched_at,
    token,
    contract_address: candidate.contract_address,
    price_usd: candidate.pair.price_usd,
    liquidity_usd: candidate.pair.liquidity_usd,
    volume_24h_usd: candidate.pair.volume_24h_usd,
    txns_24h: candidate.pair.txns_24h,
    raw: candidate.pair.raw,
  });
}

function averageNullable(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null);
  if (filtered.length === 0) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function averageIntNullable(values: Array<number | null>): number | null {
  const avg = averageNullable(values);
  if (avg === null) return null;
  return Math.round(avg);
}
