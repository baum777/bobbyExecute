import type { TokenSourceSnapshotV1, Source } from "@bobby/contracts";
import type { DexScreenerAdapter } from "@bobby/adapters";
import type { DexPaprikaAdapter } from "@bobby/adapters";
import type { ReducedModeConfig } from "../config.js";
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
    const limit = this.config.FETCH_LIMIT_PER_SOURCE;
    const sourcesQueried: Source[] = ["dexscreener", "dexpaprika"];

    const [dsTrending, dpTrending, dpVolume] = await Promise.all([
      this.safeFetch(() => this.dexScreener.fetchTrendingSolanaPairs(limit)),
      this.safeFetch(() => this.dexPaprika.fetchSolanaTrending(limit)),
      this.safeFetch(() => this.dexPaprika.fetchSolanaTopVolume(limit)),
    ]);

    const dsSnapshots = (dsTrending ?? []).map((p) =>
      this.dexScreener.pairToSnapshot(p, fetchedAt),
    );
    const dpTrendSnapshots = (dpTrending ?? []).map((t) =>
      this.dexPaprika.tokenToSnapshot(t, fetchedAt),
    );
    const dpVolSnapshots = (dpVolume ?? []).map((t) =>
      this.dexPaprika.tokenToSnapshot(t, fetchedAt),
    );

    const trendingCAs = new Set<string>();
    const volumeCAs = new Set<string>();

    let excludedNoContract = 0;
    const allResolved: TokenSourceSnapshotV1[] = [];

    for (const snap of [...dsSnapshots, ...dpTrendSnapshots]) {
      const ca = resolveContractAddress(snap);
      if (!ca) {
        excludedNoContract++;
        continue;
      }
      snap.token_ref.contract_address = ca;
      trendingCAs.add(ca);
      allResolved.push(snap);
    }

    for (const snap of dpVolSnapshots) {
      const ca = resolveContractAddress(snap);
      if (!ca) {
        excludedNoContract++;
        continue;
      }
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
      trendingCAs,
      volumeCAs,
      allCAs,
      this.config.TRENDING_RATIO_TARGET,
      this.config.MAX_UNIQUE_TOKENS,
    );

    const finalMap = new Map<string, TokenSourceSnapshotV1[]>();
    for (const ca of finalCAs) {
      const snaps = deduped.get(ca);
      if (snaps) finalMap.set(ca, snaps);
    }

    return {
      snapshots: finalMap,
      preDedupe,
      postDedupe,
      excludedNoContract,
      sourcesQueried,
      trendingCount,
      volumeCount,
    };
  }

  private async safeFetch<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch {
      return null;
    }
  }
}

export class InsufficientUniverseError extends Error {
  constructor(
    public readonly actual: number,
    public readonly required: number,
  ) {
    super(
      `Insufficient token universe: ${actual} unique tokens, minimum ${required} required. Fail-closed.`,
    );
    this.name = "InsufficientUniverseError";
  }
}
