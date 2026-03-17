/**
 * App bootstrap - config load, engine wire, server start.
 * Normalized planning package P1: single entry point.
 * Fail-closed: exits on config validation failure.
 */
import { loadConfig } from "./config/load-config.js";
import { createServer } from "./server/index.js";
import { createDryRunRuntime, type RuntimeSnapshot } from "./runtime/dry-run-runtime.js";
import { getKillSwitchState } from "./governance/kill-switch.js";

/**
 * Bootstrap the application: validate config, start server.
 * Call assertLiveTradingRequiresRealRpc via loadConfig before any execution.
 */
export async function bootstrap(options?: {
  port?: number;
  host?: string;
}): Promise<{
  server: Awaited<ReturnType<typeof createServer>>;
  runtime: ReturnType<typeof createDryRunRuntime>;
}> {
  const config = loadConfig();
  const port = options?.port ?? parseInt(process.env.PORT ?? "3333", 10);
  const host = options?.host ?? process.env.HOST ?? "0.0.0.0";
  const runtime = createDryRunRuntime(config);

  console.info(
    "[bootstrap] Starting BobbyExecution runtime",
    JSON.stringify({
      executionMode: config.executionMode,
      rpcMode: config.rpcMode,
      tradingEnabled: config.tradingEnabled,
      safetyPosture: "fail-closed",
    })
  );

  await runtime.start();

  const getRuntimeSnapshot = (): RuntimeSnapshot => runtime.getSnapshot();

  const getBotStatus = (): "running" | "paused" | "stopped" => {
    if (getKillSwitchState().halted) return "paused";
    const runtimeStatus = runtime.getStatus();
    if (runtimeStatus === "running") return "running";
    if (runtimeStatus === "paused") return "paused";
    return "stopped";
  };

  let server: Awaited<ReturnType<typeof createServer>>;
  try {
    server = await createServer({
      port,
      host,
      getBotStatus,
      getRuntimeSnapshot,
      runtime,
    });
  } catch (error) {
    await runtime.stop();
    throw error;
  }

  return { server, runtime };
}
