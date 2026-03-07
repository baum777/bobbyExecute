/**
 * App bootstrap - config load, engine wire, server start.
 * Normalized planning package P1: single entry point.
 * Fail-closed: exits on config validation failure.
 */
import { loadConfig } from "./config/load-config.js";
import { createServer } from "./server/index.js";

/**
 * Bootstrap the application: validate config, start server.
 * Call assertLiveTradingRequiresRealRpc via loadConfig before any execution.
 */
export async function bootstrap(options?: {
  port?: number;
  host?: string;
}): Promise<{ server: Awaited<ReturnType<typeof createServer>> }> {
  const config = loadConfig();
  const port = options?.port ?? parseInt(process.env.PORT ?? "3333", 10);
  const host = options?.host ?? process.env.HOST ?? "0.0.0.0";

  const server = await createServer({
    port,
    host,
  });

  return { server };
}
