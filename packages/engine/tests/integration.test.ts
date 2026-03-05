import { describe, it, expect, vi } from "vitest";
import { DexScreenerAdapter, DexPaprikaAdapter } from "@bobby/adapters";
import { executeReducedModeRun, InsufficientUniverseError } from "../src/index.js";
import { ReducedModeRunV1Schema } from "@bobby/contracts";
import { generatePairs, generateDPTokens } from "./fixtures.js";

function mockAdapters(dsPairs: ReturnType<typeof generatePairs>, dpTrending: ReturnType<typeof generateDPTokens>, dpVolume: ReturnType<typeof generateDPTokens>) {
  const ds = new DexScreenerAdapter();
  const dp = new DexPaprikaAdapter();
  vi.spyOn(ds, "fetchTrendingPairs").mockResolvedValue({ ok: true, data: dsPairs, source: "dexscreener" });
  vi.spyOn(dp, "fetchPairsMix").mockResolvedValue({
    trending: { ok: true, data: dpTrending, source: "dexpaprika" },
    volume: { ok: true, data: dpVolume, source: "dexpaprika" },
  });
  return { ds, dp };
}

describe("Integration: executeReducedModeRun", () => {
  it("produces valid ReducedModeRunV1 with mocked sources", async () => {
    const { ds, dp } = mockAdapters(generatePairs(25), generateDPTokens(25), generateDPTokens(25, 25));
    const run = await executeReducedModeRun(ds, dp, { mode: "dry" });
    expect(run.run_id).toBeDefined();
    expect(run.tokens.length).toBeGreaterThanOrEqual(1);
    for (const t of run.tokens) expect(t.reasoning.bullets).toHaveLength(3);
    expect(ReducedModeRunV1Schema.safeParse(run).success).toBe(true);
  });

  it("excludes tokens with missing contract address", async () => {
    const pairs = generatePairs(25).map((p, i) => i < 3 ? { ...p, baseToken: { ...p.baseToken, address: "" } } : p);
    const { ds, dp } = mockAdapters(pairs, generateDPTokens(25), generateDPTokens(25, 25));
    const run = await executeReducedModeRun(ds, dp, { mode: "dry" });
    expect(run.universe.excluded_no_contract).toBeGreaterThanOrEqual(3);
  });

  it("fails closed when universe insufficient", async () => {
    const { ds, dp } = mockAdapters(generatePairs(3), generateDPTokens(3), generateDPTokens(3, 3));
    await expect(executeReducedModeRun(ds, dp, { mode: "dry", config: { MIN_UNIQUE_TOKENS: 50 } })).rejects.toThrow(InsufficientUniverseError);
  });

  it("produces low_confidence when completeness below threshold", async () => {
    const pp = generatePairs(25).map((p) => ({ ...p, volume: { h24: 0 }, liquidity: { usd: 0 }, fdv: 0, marketCap: 0 }));
    const dpP = generateDPTokens(25).map((t) => ({ ...t, volume_24h_usd: undefined as number | undefined, liquidity_usd: undefined as number | undefined, fdv: undefined as number | undefined, market_cap_usd: undefined as number | undefined }));
    const { ds, dp } = mockAdapters(pp, dpP, generateDPTokens(25, 25));
    const run = await executeReducedModeRun(ds, dp, { mode: "dry", config: { MIN_DATA_COMPLETENESS: 95 } });
    expect(run.low_confidence).toBe(true);
    expect(run.notes.length).toBeGreaterThan(0);
  });

  it("one source down: continues with remaining", async () => {
    const ds = new DexScreenerAdapter();
    const dp = new DexPaprikaAdapter();
    vi.spyOn(ds, "fetchTrendingPairs").mockResolvedValue({ ok: false, data: null, error: "down", source: "dexscreener" });
    vi.spyOn(dp, "fetchPairsMix").mockResolvedValue({
      trending: { ok: true, data: generateDPTokens(25), source: "dexpaprika" },
      volume: { ok: true, data: generateDPTokens(25, 25), source: "dexpaprika" },
    });
    const run = await executeReducedModeRun(ds, dp, { mode: "dry" });
    expect(run.tokens.length).toBeGreaterThanOrEqual(1);
  });
});
