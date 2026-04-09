/**
 * M4: RPC configuration - RPC_URL, RPC_MODE.
 */
export type RpcMode = "stub" | "real";

export function getRpcMode(): RpcMode {
  const m = process.env.RPC_MODE?.toLowerCase();
  if (m === "real") return "real";
  return "stub";
}

export function getRpcUrl(): string {
  return process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

/**
 * Enforce RPC_MODE=real and an explicit RPC_URL when LIVE_TRADING is enabled.
 * Throws if live trading is on but RPC is in stub mode or RPC_URL is missing.
 */
export function assertRealModeForLive(): void {
  const liveEnabled = process.env.LIVE_TRADING?.toLowerCase() === "true";
  if (liveEnabled && getRpcMode() !== "real") {
    throw new Error(
      "LIVE_TRADING=true requires RPC_MODE=real. Set RPC_MODE=real and RPC_URL for production."
    );
  }

  if (liveEnabled && !process.env.RPC_URL?.trim()) {
    throw new Error("LIVE_TRADING=true requires RPC_URL.");
  }
}
