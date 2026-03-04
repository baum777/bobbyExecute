import type { TokenSourceSnapshotV1 } from "@bobby/contracts";

export interface DedupeResult {
  deduped: Map<string, TokenSourceSnapshotV1[]>;
  preDedupe: number;
  postDedupe: number;
}

export function dedupeByContractAddress(
  snapshots: TokenSourceSnapshotV1[],
): DedupeResult {
  const map = new Map<string, TokenSourceSnapshotV1[]>();
  for (const snap of snapshots) {
    const ca = snap.token_ref.contract_address;
    if (!ca) continue;
    const existing = map.get(ca);
    if (existing) {
      existing.push(snap);
    } else {
      map.set(ca, [snap]);
    }
  }
  return {
    deduped: map,
    preDedupe: snapshots.length,
    postDedupe: map.size,
  };
}

export function enforceRatioBalance(
  trendingCAs: Set<string>,
  volumeCAs: Set<string>,
  allCAs: string[],
  trendingRatio: number,
  maxTokens: number,
): { finalCAs: string[]; trendingCount: number; volumeCount: number } {
  const targetTrending = Math.round(maxTokens * trendingRatio);
  const targetVolume = maxTokens - targetTrending;

  const trendingOnly = allCAs.filter((ca) => trendingCAs.has(ca) && !volumeCAs.has(ca));
  const volumeOnly = allCAs.filter((ca) => volumeCAs.has(ca) && !trendingCAs.has(ca));
  const both = allCAs.filter((ca) => trendingCAs.has(ca) && volumeCAs.has(ca));

  const selected = new Set<string>();

  for (const ca of both) {
    if (selected.size >= maxTokens) break;
    selected.add(ca);
  }

  let trendingAdded = 0;
  for (const ca of trendingOnly) {
    if (selected.size >= maxTokens) break;
    if (trendingAdded >= targetTrending) break;
    selected.add(ca);
    trendingAdded++;
  }

  let volumeAdded = 0;
  for (const ca of volumeOnly) {
    if (selected.size >= maxTokens) break;
    if (volumeAdded >= targetVolume) break;
    selected.add(ca);
    volumeAdded++;
  }

  for (const ca of [...trendingOnly, ...volumeOnly]) {
    if (selected.size >= maxTokens) break;
    selected.add(ca);
  }

  const finalCAs = allCAs.filter((ca) => selected.has(ca));
  let finalTrending = 0;
  let finalVolume = 0;
  for (const ca of finalCAs) {
    if (trendingCAs.has(ca)) finalTrending++;
    if (volumeCAs.has(ca)) finalVolume++;
  }

  return { finalCAs, trendingCount: finalTrending, volumeCount: finalVolume };
}
