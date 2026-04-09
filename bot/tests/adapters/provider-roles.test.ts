import { describe, expect, it, vi } from "vitest";
import {
  CANONICAL_PROVIDER_ROLE_SPLIT,
  PRIMARY_DISCOVERY_PROVIDER_ID,
  PRIMARY_MARKET_PROVIDER_ID,
  PRIMARY_WALLET_PROVIDER_ID,
  MORALIS_FALLBACK_PROVIDER_ID,
  OPTIONAL_INTELLIGENCE_PROVIDER_ID,
  assertCanonicalPaperMarketAdapters,
  createCanonicalPaperMarketAdapters,
  createCanonicalPaperWalletSnapshotFetcher,
  getPaperWalletProviderViolation,
} from "../../src/adapters/provider-roles.js";

describe("canonical provider role split", () => {
  it("defines DexScreener, DexPaprika, and RPC as primary defaults with Moralis fallback only", () => {
    expect(CANONICAL_PROVIDER_ROLE_SPLIT.dexscreener).toMatchObject({
      providerId: PRIMARY_DISCOVERY_PROVIDER_ID,
      plane: "discovery",
      priority: "primary",
      requiredForPaperRuntime: true,
    });
    expect(CANONICAL_PROVIDER_ROLE_SPLIT.dexpaprika).toMatchObject({
      providerId: PRIMARY_MARKET_PROVIDER_ID,
      plane: "market_data",
      priority: "primary",
      requiredForPaperRuntime: true,
    });
    expect(CANONICAL_PROVIDER_ROLE_SPLIT.rpc).toMatchObject({
      providerId: PRIMARY_WALLET_PROVIDER_ID,
      plane: "wallet",
      priority: "primary",
      requiredForPaperRuntime: true,
    });
    expect(CANONICAL_PROVIDER_ROLE_SPLIT.moralis).toMatchObject({
      providerId: MORALIS_FALLBACK_PROVIDER_ID,
      plane: "wallet",
      priority: "fallback_only",
      requiredForPaperRuntime: false,
    });
    expect(CANONICAL_PROVIDER_ROLE_SPLIT.dexcheck).toMatchObject({
      providerId: OPTIONAL_INTELLIGENCE_PROVIDER_ID,
      plane: "intelligence",
      priority: "optional",
      requiredForPaperRuntime: false,
    });
  });

  it("rejects paper market adapter ordering that does not begin with DexPaprika or that includes DexCheck", () => {
    expect(() =>
      assertCanonicalPaperMarketAdapters([{ id: "moralis" }, { id: PRIMARY_MARKET_PROVIDER_ID }])
    ).toThrow(/DexPaprika/);
    expect(() =>
      assertCanonicalPaperMarketAdapters([
        { id: PRIMARY_MARKET_PROVIDER_ID },
        { id: OPTIONAL_INTELLIGENCE_PROVIDER_ID },
      ])
    ).toThrow(/DexCheck is intelligence-only/);
  });

  it("builds canonical paper market adapters from DexPaprika only", async () => {
    const getTokenWithHash = vi.fn().mockResolvedValue({
      raw: {
        id: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        chain: "solana",
        decimals: 9,
        summary: {
          price_usd: 147.5,
          "24h": { volume_usd: 42000 },
          liquidity_usd: 900000,
        },
      },
      rawPayloadHash: "hash-1",
    });

    const adapters = createCanonicalPaperMarketAdapters({
      dexpaprika: { getTokenWithHash },
      tokenId: "So11111111111111111111111111111111111111112",
    });

    expect(adapters).toHaveLength(1);
    expect(adapters[0].id).toBe(PRIMARY_MARKET_PROVIDER_ID);

    const snapshot = await adapters[0].fetch();
    expect(getTokenWithHash).toHaveBeenCalledWith("So11111111111111111111111111111111111111112");
    expect(snapshot.source).toBe("dexpaprika");
    expect(snapshot.priceUsd).toBe(147.5);
    expect(snapshot.volume24h).toBe(42000);
  });

  it("builds canonical paper wallet snapshots from RPC balances", async () => {
    const fetchWallet = createCanonicalPaperWalletSnapshotFetcher({
      rpcClient: {
        getBalance: vi.fn().mockResolvedValue({
          address: "11111111111111111111111111111111",
          balance: "2500000000",
          decimals: 9,
        }),
      },
      walletAddress: "11111111111111111111111111111111",
      tokenMint: "So11111111111111111111111111111111111111112",
      tokenPriceUsd: 130,
    });

    const wallet = await fetchWallet();
    expect(wallet.source).toBe(PRIMARY_WALLET_PROVIDER_ID);
    expect(wallet.walletAddress).toBe("11111111111111111111111111111111");
    expect(wallet.totalUsd).toBe(325);
  });

  it("flags non-RPC wallet snapshots as invalid for paper intake", () => {
    expect(getPaperWalletProviderViolation({ source: "rpc" })).toBeNull();
    expect(getPaperWalletProviderViolation({ source: "moralis" })).toMatch(/RPC-derived/);
  });
});
