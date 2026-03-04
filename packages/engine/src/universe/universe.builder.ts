import type { AdapterPairV1 } from "@reducedmode/contracts";
import type { DexPaprikaAdapter, DexScreenerAdapter } from "@reducedmode/adapters";
import type { ReducedModeConfig } from "../config.js";
import {
  applySoftSourceBalance,
  dedupeByContractAddress,
  sourceBalance,
  type UniverseTokenCandidate,
} from "./dedupe.balance.js";
import { resolveContractAddress } from "./contract.resolver.js";

export interface UniverseBuilderDeps {
  dexscreener: DexScreenerAdapter;
  dexpaprika: DexPaprikaAdapter;
  config: ReducedModeConfig;
}

export interface UniverseBuildResult {
  preDedupePool: UniverseTokenCandidate[];
  selected: UniverseTokenCandidate[];
  excludedMissingContract: number;
  ratioRelaxed: boolean;
  attemptsUsed: number;
  notes: string[];
}

export class UniverseBuilder {
  constructor(private readonly deps: UniverseBuilderDeps) {}

  async build(maxTokensOverride?: number): Promise<UniverseBuildResult> {
    const maxTokens = Math.min(
      this.deps.config.MAX_UNIQUE_TOKENS,
      maxTokensOverride ?? this.deps.config.MAX_UNIQUE_TOKENS,
    );
    const notes: string[] = [];
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.deps.config.MAX_RECOVERY_ATTEMPTS; attempt += 1) {
      try {
        const dsTarget = this.deps.config.UNIVERSE_SOURCE_TARGET + (attempt - 1) * 5;
        const dpTarget = this.deps.config.UNIVERSE_SOURCE_TARGET + (attempt - 1) * 5;

        const [dexScreenerPairs, dexPaprikaTrending, dexPaprikaVolume] = await Promise.all([
          this.deps.dexscreener.fetchTrendingSolanaPairs(dsTarget),
          this.deps.dexpaprika.fetchSolanaTrending(
            Math.ceil(dpTarget * this.deps.config.TRENDING_RATIO_TARGET),
          ),
          this.deps.dexpaprika.fetchSolanaTopVolume(
            Math.ceil(dpTarget * this.deps.config.VOLUME_RATIO_TARGET),
          ),
        ]);

        const mergedPool = this.toCandidates([
          ...dexScreenerPairs,
          ...dexPaprikaTrending,
          ...dexPaprikaVolume,
        ]).slice(0, this.deps.config.PRE_DEDUPE_POOL_TARGET);

        const excludedMissingContract = mergedPool.filter(
          (candidate) => candidate.contract_address.length === 0,
        ).length;
        const withContract = mergedPool.filter((candidate) => candidate.contract_address.length > 0);

        const deduped = dedupeByContractAddress(withContract);
        const { selected, ratioRelaxed } = applySoftSourceBalance(
          deduped,
          maxTokens,
          this.deps.config.TRENDING_RATIO_TARGET,
          this.deps.config.MIN_UNIQUE_TOKENS,
        );

        if (ratioRelaxed) {
          notes.push("source_ratio_relaxed_to_preserve_coverage");
        }

        if (selected.length < this.deps.config.MIN_UNIQUE_TOKENS) {
          notes.push(`attempt_${attempt}_insufficient_universe_${selected.length}`);
          continue;
        }

        const balance = sourceBalance(selected);
        notes.push(
          `source_balance_dexscreener=${balance.dexscreener},dexpaprika=${balance.dexpaprika}`,
        );

        return {
          preDedupePool: mergedPool,
          selected,
          excludedMissingContract,
          ratioRelaxed,
          attemptsUsed: attempt,
          notes,
        };
      } catch (error) {
        lastError = error;
        notes.push(`attempt_${attempt}_error`);
      }
    }

    throw new Error(
      `Fail-Closed: insufficient token universe after recovery attempts (${String(lastError ?? "no_error")})`,
    );
  }

  private toCandidates(pairs: AdapterPairV1[]): UniverseTokenCandidate[] {
    return pairs.map((pair) => ({
      source: pair.source,
      pair,
      contract_address: resolveContractAddress(pair) ?? "",
    }));
  }
}
