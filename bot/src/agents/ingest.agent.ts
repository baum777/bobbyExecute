/**
 * Ingest agent - fetches market + wallet data.
 * PROPOSED - orchestrates DexPaprika and Moralis adapters.
 */
import type { MarketSnapshot } from "../core/contracts/market.js";
import type { WalletSnapshot } from "../core/contracts/wallet.js";
import type { DexPaprikaClient } from "../adapters/dexpaprika/client.js";
import type { MoralisClient } from "../adapters/moralis/client.js";
import { mapTokenToMarketSnapshot } from "../adapters/dexpaprika/mapper.js";
import { mapMoralisToWalletSnapshot } from "../adapters/moralis/mapper.js";
import type { Clock } from "../core/clock.js";

export interface IngestAgentConfig {
  dexpaprika: DexPaprikaClient;
  moralis: MoralisClient;
  walletAddress: string;
  defaultTokenId?: string;
  clock?: Clock;
}

export async function createIngestHandler(
  config: IngestAgentConfig
): Promise<() => Promise<{ market: MarketSnapshot; wallet: WalletSnapshot }>> {
  return async () => {
    const ts = config.clock?.now().toISOString() ?? new Date().toISOString();
    const traceId = `ingest-${ts.replace(/[:.]/g, "-")}`;
    const tokenId = config.defaultTokenId ?? "So11111111111111111111111111111111111111112";

    const [tokenResult, walletResult] = await Promise.all([
      config.dexpaprika.getTokenWithHash(tokenId),
      config.moralis.getBalancesWithHash(config.walletAddress),
    ]);

    const tokenRaw = tokenResult.raw as {
      id: string;
      name?: string;
      symbol: string;
      chain?: string;
      decimals?: number;
      summary?: { price_usd?: number; "24h"?: { volume?: number; volume_usd?: number }; liquidity_usd?: number };
    };
    const market = mapTokenToMarketSnapshot(
      {
        id: tokenRaw.id,
        name: tokenRaw.name ?? tokenRaw.symbol,
        symbol: tokenRaw.symbol,
        chain: tokenRaw.chain ?? "solana",
        decimals: tokenRaw.decimals ?? 9,
        summary: tokenRaw.summary,
      },
      traceId,
      ts,
      tokenResult.rawPayloadHash
    );

    const wallet = mapMoralisToWalletSnapshot(
      walletResult.raw as { result?: Array<{ token_address: string; symbol: string; decimals: number; balance: string; usd_value?: number }> },
      config.walletAddress,
      traceId,
      ts,
      walletResult.rawPayloadHash
    );

    return { market, wallet };
  };
}
