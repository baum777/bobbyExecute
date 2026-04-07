import { parseConfig, type Config } from "../../src/config/config-schema.js";
import { serializeControlOperatorAssertion, type ControlOperatorRole } from "../../src/control/control-governance.js";
import { InMemoryRuntimeConfigRepository } from "../../src/persistence/runtime-config-repository.js";
import { InMemoryRuntimeConfigStore } from "../../src/storage/runtime-config-store.js";
import { RuntimeConfigManager } from "../../src/runtime/runtime-config-manager.js";

export const TEST_RUNTIME_ENV = "runtime-config-test";
export const TEST_CONTROL_TOKEN = "runtime-config-control-token";
export const TEST_OPERATOR_READ_TOKEN = "runtime-config-operator-read-token";

export function createRuntimeConfigBootConfig(): Config {
  return parseConfig({
    NODE_ENV: "test",
  });
}

export async function createRuntimeConfigTestManager(options: {
  environment?: string;
  bootstrapActor?: string;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<{
  manager: RuntimeConfigManager;
  repository: InMemoryRuntimeConfigRepository;
  store: InMemoryRuntimeConfigStore;
}> {
  const repository = new InMemoryRuntimeConfigRepository();
  const store = new InMemoryRuntimeConfigStore();
  const environment = options.environment ?? TEST_RUNTIME_ENV;
  const manager = new RuntimeConfigManager(createRuntimeConfigBootConfig(), {
    repository,
    store,
    environment,
    bootstrapActor: options.bootstrapActor ?? "test-bootstrap",
    env:
      options.env ??
      ({
        NODE_ENV: "test",
        RUNTIME_CONFIG_ENV: environment,
      } as NodeJS.ProcessEnv),
  });

  await manager.initialize();
  return { manager, repository, store };
}

export function controlHeaders(token = TEST_CONTROL_TOKEN): HeadersInit {
  return { "x-control-token": token };
}

export function operatorReadHeaders(token = TEST_OPERATOR_READ_TOKEN): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

export function buildControlOperatorAssertionHeaders(options: {
  role?: ControlOperatorRole;
  actorId?: string;
  displayName?: string;
  action?: "pause" | "resume" | "acknowledge_restart_alert" | "resolve_restart_alert" | "emergency_stop" | "reset_kill_switch" | "restart_worker" | "mode_change" | "runtime_config_change" | "reload" | "live_promotion_request" | "live_promotion_approve" | "live_promotion_deny" | "live_promotion_apply" | "live_promotion_rollback";
  target?: string;
  requestId?: string;
  reason?: string;
  authResult?: "authorized" | "denied";
  token?: string;
} = {}): HeadersInit {
  const now = new Date();
  const sessionId = options.requestId ?? `session-${now.getTime()}`;
  const assertion = serializeControlOperatorAssertion(
    {
      identity: {
        actorId: options.actorId ?? `${options.role ?? "admin"}-actor`,
        displayName: options.displayName ?? `${options.role ?? "admin"} operator`,
        role: options.role ?? "admin",
        sessionId,
        issuedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      },
      action: options.action ?? "mode_change",
      target: options.target ?? "/control/mode",
      requestId: options.requestId,
      reason: options.reason,
      authResult: options.authResult ?? "authorized",
    },
    options.token ?? TEST_CONTROL_TOKEN
  );

  return {
    ...controlHeaders(options.token ?? TEST_CONTROL_TOKEN),
    "x-dashboard-operator-assertion": assertion,
  };
}
