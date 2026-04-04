/**
 * MCP bootstrap surface.
 * Real but intentionally partial: prompt/resource-plane only, zero tools, fail-closed.
 */

import { MCP_SERVER_MANIFEST } from "./manifest.js";
import { createPromptResourcePlaneMcpServer } from "./server.js";

export function createMcpBootstrap() {
  return createPromptResourcePlaneMcpServer(MCP_SERVER_MANIFEST);
}
