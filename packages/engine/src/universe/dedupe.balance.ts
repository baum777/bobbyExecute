import type { AdapterPairV1, SourceV1 } from "@reducedmode/contracts";

export interface UniverseTokenCandidate {
  contract_address: string;
  source: SourceV1;
  pair: AdapterPairV1;
}

export interface SourceBalance {
  dexscreener: number;
  dexpaprika: number;
  moralis: number;
  rpc: number;
}

export function dedupeByContractAddress(candidates: UniverseTokenCandidate[]): UniverseTokenCandidate[] {
  const byContract = new Map<string, UniverseTokenCandidate>();
  for (const candidate of candidates) {
    const existing = byContract.get(candidate.contract_address);
    if (!existing) {
      byContract.set(candidate.contract_address, candidate);
      continue;
    }
    if (scoreCandidate(candidate) > scoreCandidate(existing)) {
      byContract.set(candidate.contract_address, candidate);
    }
  }
  return [...byContract.values()].sort((a, b) =>
    a.contract_address.localeCompare(b.contract_address),
  );
}

export function applySoftSourceBalance(
  deduped: UniverseTokenCandidate[],
  maxUniqueTokens: number,
  ratioTarget: number,
  minUniqueTokens: number,
): { selected: UniverseTokenCandidate[]; ratioRelaxed: boolean } {
  const maxTokens = Math.max(1, maxUniqueTokens);
  const targetDexScreener = Math.floor(maxTokens * ratioTarget);
  const targetDexPaprika = Math.max(0, maxTokens - targetDexScreener);

  const ds = deduped.filter((c) => c.source === "dexscreener");
  const dp = deduped.filter((c) => c.source === "dexpaprika");
  const other = deduped.filter((c) => c.source !== "dexscreener" && c.source !== "dexpaprika");

  const strictSelection = [
    ...ds.slice(0, targetDexScreener),
    ...dp.slice(0, targetDexPaprika),
    ...other,
  ].slice(0, maxTokens);

  if (strictSelection.length >= minUniqueTokens) {
    return { selected: strictSelection, ratioRelaxed: false };
  }

  return { selected: deduped.slice(0, maxTokens), ratioRelaxed: true };
}

export function sourceBalance(candidates: UniverseTokenCandidate[]): SourceBalance {
  const initial: SourceBalance = {
    dexscreener: 0,
    dexpaprika: 0,
    moralis: 0,
    rpc: 0,
  };
  return candidates.reduce((acc, c) => {
    acc[c.source] += 1;
    return acc;
  }, initial);
}

function scoreCandidate(candidate: UniverseTokenCandidate): number {
  const pair = candidate.pair;
  const liquidity = pair.liquidity_usd ?? 0;
  const volume = pair.volume_24h_usd ?? 0;
  const txns = pair.txns_24h ?? 0;
  return liquidity * 0.5 + volume * 0.4 + txns * 0.1;
}
