const BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function makeAddress(index: number): string {
  const prefix = `Tk${BASE58_CHARS[index % BASE58_CHARS.length]}${BASE58_CHARS[(index + 7) % BASE58_CHARS.length]}`;
  const padding = BASE58_CHARS[1].repeat(40 - prefix.length);
  return prefix + padding;
}

export function generatePairs(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    chainId: "solana",
    dexId: "raydium",
    url: `https://dexscreener.com/solana/pair${i}`,
    pairAddress: makeAddress(i + 200),
    baseToken: {
      address: makeAddress(i),
      name: `Token ${i}`,
      symbol: `TK${i}`,
    },
    quoteToken: {
      address: "So11111111111111111111111111111111",
      name: "SOL",
      symbol: "SOL",
    },
    priceNative: "0.001",
    priceUsd: String(1.0 + i * 0.1),
    txns: { h24: { buys: 100 + i, sells: 50 + i } },
    volume: { h24: 50000 + i * 1000 },
    priceChange: { h24: 5 + i * 0.5 },
    liquidity: { usd: 100000 + i * 10000 },
    fdv: 1000000 + i * 100000,
    marketCap: 500000 + i * 50000,
  }));
}

export function generateDPTokens(count: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    id: `dp-token-${i + offset}`,
    name: `DPToken ${i + offset}`,
    symbol: `DP${i + offset}`,
    address: makeAddress(100 + i + offset),
    chain: "solana",
    price_usd: 2.0 + (i + offset) * 0.2,
    volume_24h_usd: 80000 + (i + offset) * 2000,
    liquidity_usd: 200000 + (i + offset) * 20000,
    fdv: 2000000 + (i + offset) * 200000,
    market_cap_usd: 1000000 + (i + offset) * 100000,
    price_change_24h_pct: 3 + (i + offset) * 0.3,
  }));
}
