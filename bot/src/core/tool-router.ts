/**
 * Tool Router with permission enforcement.
 * EXTRACTED from OrchestrAI_Labs packages/agent-runtime/src/execution/tool-router.ts
 */
import type { AgentProfile, ToolRef } from "./contracts/agent.js";
import { enforcePermission } from "../governance/policy-engine.js";
import { TOOL_PERMISSION_MAP } from "../governance/tool-permissions.js";

export type ToolContext = {
  projectId?: string;
  clientId?: string;
  userId: string;
  traceId?: string;
};

export type ToolCall = {
  tool: ToolRef;
  input: unknown;
};

export type ToolResult = {
  ok: boolean;
  output?: unknown;
  error?: string;
};

export interface ToolHandler {
  call(ctx: ToolContext, input: unknown): Promise<ToolResult>;
}

export class ToolRouter {
  constructor(private readonly handlers: Record<string, ToolHandler>) {}

  async execute(
    profile: AgentProfile,
    ctx: ToolContext,
    call: ToolCall
  ): Promise<ToolResult> {
    if (!profile.tools.includes(call.tool)) {
      return { ok: false, error: `Tool not allowed for agent: ${call.tool}` };
    }

    const requiredPerm = TOOL_PERMISSION_MAP[call.tool];
    if (!requiredPerm) {
      return { ok: false, error: `No permission mapped for tool: ${call.tool}` };
    }
    enforcePermission(profile, requiredPerm);

    const handler = this.handlers[call.tool];
    if (!handler) {
      return { ok: false, error: `Tool handler not implemented: ${call.tool}` };
    }

    return handler.call(ctx, call.input);
  }
}
