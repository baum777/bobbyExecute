/**
 * MCP server skeleton.
 * Concrete but intentionally narrow: prompt/resource plane only, zero tools, zero mutators, fail-closed.
 */

import {
  assertPromptResourcePlaneOnly,
  MCP_SERVER_MANIFEST,
  type McpPromptDescriptor,
  type McpResourceDescriptor,
  type McpServerManifest,
} from "./manifest.js";

export type McpJsonRpcId = string | number | null;

export interface McpJsonRpcRequest {
  jsonrpc: "2.0";
  id: McpJsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface McpJsonRpcSuccessResponse<TResult> {
  jsonrpc: "2.0";
  id: McpJsonRpcId;
  result: TResult;
}

export interface McpJsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: McpJsonRpcId;
  error: McpJsonRpcError;
}

export type McpJsonRpcResponse<TResult = unknown> =
  | McpJsonRpcSuccessResponse<TResult>
  | McpJsonRpcErrorResponse;

export interface PromptResourcePlaneMcpServer {
  readonly posture: typeof MCP_SERVER_MANIFEST.posture;
  readonly manifest: McpServerManifest;
  listPrompts(): readonly McpPromptDescriptor[];
  getPrompt(name: string): McpPromptDescriptor | null;
  listResources(): readonly McpResourceDescriptor[];
  getResource(uri: string): McpResourceDescriptor | null;
  listTools(): readonly [];
  handleJsonRpcRequest(request: McpJsonRpcRequest): Promise<McpJsonRpcResponse>;
}

function ok<TResult>(id: McpJsonRpcId, result: TResult): McpJsonRpcSuccessResponse<TResult> {
  return { jsonrpc: "2.0", id, result };
}

function fail(id: McpJsonRpcId, code: number, message: string, data?: unknown): McpJsonRpcErrorResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

export function createPromptResourcePlaneMcpServer(
  manifest: McpServerManifest = MCP_SERVER_MANIFEST
): PromptResourcePlaneMcpServer {
  assertPromptResourcePlaneOnly(manifest);

  const listPrompts = (): readonly McpPromptDescriptor[] => [...manifest.prompts];
  const getPrompt = (name: string): McpPromptDescriptor | null =>
    manifest.prompts.find((prompt) => prompt.name === name) ?? null;
  const listResources = (): readonly McpResourceDescriptor[] => [...manifest.resources];
  const getResource = (uri: string): McpResourceDescriptor | null =>
    manifest.resources.find((resource) => resource.uri === uri) ?? null;
  const listTools = (): readonly [] => [];

  return {
    posture: manifest.posture,
    manifest,
    listPrompts,
    getPrompt,
    listResources,
    getResource,
    listTools,
    async handleJsonRpcRequest(request) {
      if (request.jsonrpc !== "2.0") {
        return fail(request.id, -32600, "Invalid Request", { reason: "Unsupported JSON-RPC version" });
      }

      switch (request.method) {
        case "initialize":
          return ok(request.id, {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "bobbyexecute-mcp-skeleton",
              version: manifest.version,
            },
            capabilities: {
              prompts: {},
              resources: {},
            },
          });
        case "prompts/list":
          return ok(request.id, { prompts: listPrompts() });
        case "prompts/get": {
          const name = typeof request.params?.name === "string" ? request.params.name : undefined;
          if (!name) {
            return fail(request.id, -32602, "Invalid params", { reason: "Missing prompt name" });
          }
          const prompt = getPrompt(name);
          if (!prompt) {
            return fail(request.id, -32602, "Invalid params", { reason: `Unknown prompt: ${name}` });
          }
          return ok(request.id, { prompt });
        }
        case "resources/list":
          return ok(request.id, { resources: listResources() });
        case "resources/read": {
          const uri = typeof request.params?.uri === "string" ? request.params.uri : undefined;
          if (!uri) {
            return fail(request.id, -32602, "Invalid params", { reason: "Missing resource uri" });
          }
          const resource = getResource(uri);
          if (!resource) {
            return fail(request.id, -32602, "Invalid params", { reason: `Unknown resource: ${uri}` });
          }
          return ok(request.id, {
            resource,
            contents: [
              {
                uri: resource.uri,
                mimeType: resource.mimeType,
                text: resource.content,
              },
            ],
          });
        }
        case "tools/list":
          return ok(request.id, { tools: listTools() });
        default:
          return fail(request.id, -32601, "Method not found", {
            reason: "MCP skeleton is prompt/resource-plane only",
          });
      }
    },
  };
}
