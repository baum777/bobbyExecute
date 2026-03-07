/**
 * Config validation tests - Normalized planning package P1.
 * Fail-closed: invalid config combinations reject startup.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { parseConfig } from "../../src/config/config-schema.js";
import { loadConfig, resetConfigCache } from "../../src/config/load-config.js";

describe("Config validation (P1)", () => {
  const orig = process.env;

  beforeEach(() => {
    resetConfigCache();
    process.env = { ...orig };
  });

  afterEach(() => {
    process.env = orig;
  });

  it("config invalid combo rejects startup: LIVE_TRADING=true with RPC_MODE=stub", () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "stub";

    expect(() => parseConfig(process.env as Record<string, string | undefined>)).toThrow(
      /LIVE_TRADING=true.*requires RPC_MODE=real/
    );
  });

  it("loadConfig throws on invalid combo", () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "stub";

    expect(() => loadConfig(process.env as Record<string, string | undefined>)).toThrow(
      /LIVE_TRADING=true.*requires RPC_MODE=real/
    );
  });

  it("valid combo LIVE_TRADING=true with RPC_MODE=real parses", () => {
    process.env.LIVE_TRADING = "true";
    process.env.RPC_MODE = "real";
    process.env.RPC_URL = "https://api.mainnet-beta.solana.com";

    const config = parseConfig(process.env as Record<string, string | undefined>);
    expect(config.executionMode).toBe("live");
    expect(config.rpcMode).toBe("real");
  });

  it("default config has executionMode dry and rpcMode stub", () => {
    delete process.env.LIVE_TRADING;
    delete process.env.RPC_MODE;

    const config = parseConfig(process.env as Record<string, string | undefined>);
    expect(config.executionMode).toBe("dry");
    expect(config.rpcMode).toBe("stub");
  });
});
