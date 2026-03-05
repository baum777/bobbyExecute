import type { TokenSourceSnapshotV1, Source } from "@bobby/contracts";
import type { DexScreenerAdapter, DexPaprikaAdapter } from "@bobby/adapters";
import type { ReducedModeConfig } from "../config/defaults.js";
import { resolveContractAddress } from "./contract.resolver.js";
import { dedupeByContractAddress, enforceRatioBalance } from "./dedupe.balance.js";

export interface UniverseResult {
  snapshots: Map<string, TokenSourceSnapshotV1[]>;
  preDedupe: number;
  postDedupe: number;
  excludedNoContract: number;
  sourcesQueried: Source[];
  trendingCount: number;
  volumeCount: number;
}

export class UniverseBuilder {
  constructor(
    private readonly dexScreener: DexScreenerAdapter,
    private readonly dexPaprika: DexPaprikaAdapter,
    private readonly config: ReducedModeConfig,
  ) {}

  async build(): Promise<UniverseResult> {
    const fetchedAt = new Date().toISOString();
    const sourcesQueried: Source[] = ["dexscreener", "dexpaprika"];

    const [dsResult, dpResult] = await Promise.all([
      this.dexScreener.fetchTrendingPairs(this.config.DEXSCREENER_FETCH_TARGET),
      this.dexPaprika.fetchPairsMix(this.config.DEXPAPRIKA_FETCH_TARGET),
    ]);

    const dsSnapshots = (dsResult.data ?? []).map((p) => this.dexScreener.pairToSnapshot(p, fetchedAt));
    const dpTrendSnapshots = (dpResult.trending.data ?? []).map((t) => this.dexPaprika.tokenToSnapshot(t, fetchedAt));
    const dpVolSnapshots = (dpResult.volume.data ?? []).map((t) => this.dexPaprika.tokenToSnapshot(t, fetchedAt));

    const trendingCAs = new Set<string>();
    const volumeCAs = new Set<string>();
    let excludedNoContract = 0;
    const allResolved: TokenSourceSnapshotV1[] = [];

    for (const snap of [...dsSnapshots, ...dpTrendSnapshots]) {
      const ca = resolveContractAddress(snap);
      if (!ca) { excludedNoContract++; continue; }
      snap.token_ref.contract_address = ca;
      trendingCAs.add(ca);
      allResolved.push(snap);
    }

    for (const snap of dpVolSnapshots) {
      const ca = resolveContractAddress(snap);
      if (!ca) { excludedNoContract++; continue; }
      snap.token_ref.contract_address = ca;
      volumeCAs.add(ca);
      allResolved.push(snap);
    }

    const { deduped, preDedupe, postDedupe } = dedupeByContractAddress(allResolved);
    const allCAs = [...deduped.keys()];

    if (postDedupe < this.config.MIN_UNIQUE_TOKENS) {
      throw new InsufficientUniverseError(postDedupe, this.config.MIN_UNIQUE_TOKENS);
    }

    const { finalCAs, trendingCount, volumeCount } = enforceRatioBalance(
      trendingCAs, volumeCAs, allCAs, this.config.TRENDING_RATIO_TARGET, this.config.MAX_UNIQUE_TOKENS,
    );

    const finalMap = new Map<string, TokenSourceSnapshotV1[]>();
    for (const ca of finalCAs) {
      const snaps = deduped.get(ca);
      if (snaps) finalMap.set(ca, snaps);
    }

    return { snapshots: finalMap, preDedupe, postDedupe, excludedNoContract, sourcesQueried, trendingCount, volumeCount };
  }
}

export class InsufficientUniverseError extends Error {
  constructor(public readonly actual: number, public readonly required: number) {
    super(`Insufficient token universe: ${actual} unique tokens, minimum ${required} required. Fail-closed.`);
    this.name = "InsufficientUniverseError";
  }
}
