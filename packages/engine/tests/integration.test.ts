import { describe, it, expect, vi } from "vitest";
import { DexScreenerAdapter, DexPaprikaAdapter } from "@bobby/adapters";
import { executeReducedModeRun, InsufficientUniverseError } from "../src/index.js";
import { ReducedModeRunV1Schema } from "@bobby/contracts";
import { generatePairs, generateDPTokens } from "./fixtures.js";

function createMockedAdapters(
  dsPairs: ReturnType<typeof generatePairs>,
  dpTrending: ReturnType<typeof generateDPTokens>,
  dpVolume: ReturnType<typeof generateDPTokens>,
) {
  const ds = new DexScreenerAdapter();
  const dp = new DexPaprikaAdapter();

  vi.spyOn(ds, "fetchTrendingSolanaPairs").mockResolvedValue(dsPairs);
  vi.spyOn(dp, "fetchSolanaTrending").mockResolvedValue(dpTrending);
  vi.spyOn(dp, "fetchSolanaTopVolume").mockResolvedValue(dpVolume);

  return { ds, dp };
}

describe("Integration: executeReducedModeRun", () => {
  it("produces valid ReducedModeRunV1 with mocked sources", async () => {
    const { ds, dp } = createMockedAdapters(
      generatePairs(25),
      generateDPTokens(25),
      generateDPTokens(25, 25),
    );

    const run = await executeReducedModeRun(ds, dp, { mode: "dry" });

    expect(run.run_id).toBeDefined();
    expect(run.tokens.length).toBeGreaterThanOrEqual(1);
    expect(run.universe.post_dedupe_count).toBeGreaterThanOrEqual(20);

    for (const t of run.tokens) {
      expect(t.reasoning.bullets).toHaveLength(3);
    }

    const parsed = ReducedModeRunV1Schema.safeParse(run);
    expect(parsed.success).toBe(true);
  });

  it("excludes tokens with missing contract address", async () => {
    const pairsWithMissing = generatePairs(25).map((p, i) => {
      if (i < 3) return { ...p, baseToken: { ...p.baseToken, address: "" } };
      return p;
    });

    const { ds, dp } = createMockedAdapters(
      pairsWithMissing,
      generateDPTokens(25),
      generateDPTokens(25, 25),
    );

    const run = await executeReducedModeRun(ds, dp, { mode: "dry" });
    expect(run.universe.excluded_no_contract).toBeGreaterThanOrEqual(3);
  });

  it("fails closed when universe insufficient", async () => {
    const { ds, dp } = createMockedAdapters(
      generatePairs(3),
      generateDPTokens(3),
      generateDPTokens(3, 3),
    );

    await expect(
      executeReducedModeRun(ds, dp, { mode: "dry", config: { MIN_UNIQUE_TOKENS: 50 } }),
    ).rejects.toThrow(InsufficientUniverseError);
  });

  it("produces low_confidence artifact when completeness below threshold", async () => {
    const pairsPartial = generatePairs(25).map((p) => ({
      ...p,
      volume: { h24: 0 },
      liquidity: { usd: 0 },
      fdv: 0,
      marketCap: 0,
    }));

    const dpTokensPartial = generateDPTokens(25).map((t) => ({
      ...t,
      volume_24h_usd: undefined as number | undefined,
      liquidity_usd: undefined as number | undefined,
      fdv: undefined as number | undefined,
      market_cap_usd: undefined as number | undefined,
    }));

    const { ds, dp } = createMockedAdapters(
      pairsPartial,
      dpTokensPartial,
      generateDPTokens(25, 25),
    );

    const run = await executeReducedModeRun(ds, dp, {
      mode: "dry",
      config: { MIN_DATA_COMPLETENESS: 95 },
    });
    expect(run.low_confidence).toBe(true);
    expect(run.notes.length).toBeGreaterThan(0);
  });

  it("one source down triggers recovery and continues", async () => {
    const ds = new DexScreenerAdapter();
    const dp = new DexPaprikaAdapter();

    vi.spyOn(ds, "fetchTrendingSolanaPairs").mockRejectedValue(new Error("DexScreener down"));
    vi.spyOn(dp, "fetchSolanaTrending").mockResolvedValue(generateDPTokens(25));
    vi.spyOn(dp, "fetchSolanaTopVolume").mockResolvedValue(generateDPTokens(25, 25));

    const run = await executeReducedModeRun(ds, dp, { mode: "dry" });
    expect(run.tokens.length).toBeGreaterThanOrEqual(1);
    expect(run.universe.sources_queried).toContain("dexpaprika");
  });
});
