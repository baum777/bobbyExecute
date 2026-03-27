/**
 * Public bot bootstrap - config load and readonly server start.
 * Fail-closed: exits on config validation failure.
 */
import { loadConfig } from "./config/load-config.js";
import { createServer } from "./server/index.js";
import { createRuntimeVisibilityRepository } from "./persistence/runtime-visibility-repository.js";

export async function bootstrap(options?: {
  port?: number;
  host?: string;
  runtimeVisibilityRepository?: Awaited<ReturnType<typeof createRuntimeVisibilityRepository>>;
}): Promise<{
  server: Awaited<ReturnType<typeof createServer>>;
  runtimeVisibilityRepository: Awaited<ReturnType<typeof createRuntimeVisibilityRepository>>;
}> {
  const config = loadConfig();
  const port = options?.port ?? parseInt(process.env.PORT ?? "3333", 10);
  const host = options?.host ?? process.env.HOST ?? "0.0.0.0";
  const runtimeEnvironment =
    process.env.RUNTIME_CONFIG_ENV?.trim() ?? process.env.RENDER_SERVICE_NAME?.trim() ?? config.nodeEnv;
  const runtimeVisibilityRepository =
    options?.runtimeVisibilityRepository ?? (await createRuntimeVisibilityRepository(process.env.DATABASE_URL));
  await runtimeVisibilityRepository.ensureSchema();

  console.info(
    "[bootstrap] Starting BobbyExecution public bot service",
    JSON.stringify({
      executionMode: config.executionMode,
      rpcMode: config.rpcMode,
      tradingEnabled: config.tradingEnabled,
      safetyPosture: "fail-closed",
      runtimePolicyAuthority: config.runtimePolicyAuthority,
      runtimeEnvironment,
    })
  );

  const server = await createServer({
    port,
    host,
    dashboardOrigin: config.dashboardOrigin,
    runtimeVisibilityRepository,
    runtimeEnvironment,
  });

  return { server, runtimeVisibilityRepository };
}
