import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPromptResourcePlaneOnly,
  MCP_FORBIDDEN_MODULE_PATTERNS,
  MCP_SERVER_MANIFEST,
} from "../../src/mcp/manifest.js";
import { createMcpBootstrap } from "../../src/mcp/bootstrap.js";

const SRC_ROOT = resolve(process.cwd(), "src");

describe("MCP skeleton", () => {
  it("exposes a prompt/resource-plane-only surface with zero tools", async () => {
    const server = createMcpBootstrap();

    expect(server.posture).toBe("prompt/resource-plane-only");
    expect(server.manifest.posture).toBe("prompt/resource-plane-only");
    expect(server.manifest.tools).toEqual([]);
    expect(server.listPrompts()).toHaveLength(3);
    expect(server.listResources()).toHaveLength(13);
    expect(server.listTools()).toEqual([]);
    expect(server.listPrompts().map((prompt) => prompt.name)).toEqual([
      "readonly-decision-audit",
      "provenance-taxonomy-review",
      "runtime-summary-semantics-review",
    ]);
    expect(server.listResources().map((resource) => resource.uri)).toEqual([
      "bot://mcp/posture",
      "bot://mcp/surface-map",
      "bot://mcp/canonical-decision-history",
      "bot://mcp/provenance-taxonomy",
      "bot://mcp/runtime-cycle-summary-schema",
      "bot://mcp/replay-semantics",
      "bot://mcp/journal-provenance",
      "bot://mcp/sidecar-observation",
      "bot://mcp/sidecar/posture",
      "bot://mcp/sidecar/surface-map",
      "bot://mcp/sidecar/trend-reversal-monitor-runner",
      "bot://mcp/sidecar/shadow-artifact-chain",
      "bot://mcp/sidecar/sidecar-worker-loop",
    ]);

    const init = await server.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
    });
    expect("error" in init).toBe(false);
    if ("result" in init) {
      expect(init.result).toMatchObject({
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: "bobbyexecute-mcp-skeleton",
          version: "mcp.skeleton.v1",
        },
        capabilities: {
          prompts: {},
          resources: {},
        },
      });
    }

    const promptList = await server.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "prompts/list",
    });
    expect(promptList).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: {
        prompts: expect.arrayContaining([
          expect.objectContaining({
            classification: "safe prompt-plane surface",
            kind: "prompt",
            name: "readonly-decision-audit",
          }),
          expect.objectContaining({
            classification: "safe prompt-plane surface",
            kind: "prompt",
            name: "provenance-taxonomy-review",
          }),
          expect.objectContaining({
            classification: "safe prompt-plane surface",
            kind: "prompt",
            name: "runtime-summary-semantics-review",
          }),
        ]),
      },
    });

    const promptRead = await server.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "prompts/get",
      params: { name: "runtime-summary-semantics-review" },
    });
    expect(promptRead).toMatchObject({
      jsonrpc: "2.0",
      id: 3,
      result: {
        prompt: {
          kind: "prompt",
          classification: "safe prompt-plane surface",
          name: "runtime-summary-semantics-review",
        },
      },
    });
    if ("result" in promptRead) {
      expect(promptRead.result.prompt.template.join("\n")).toContain("read-only runtime summary reviewer");
    }

    const resourceRead = await server.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "resources/read",
      params: { uri: "bot://mcp/canonical-decision-history" },
    });
    expect(resourceRead).toMatchObject({
      jsonrpc: "2.0",
      id: 4,
      result: {
        resource: {
          kind: "resource",
          classification: "safe read-only resource-plane surface",
          uri: "bot://mcp/canonical-decision-history",
        },
      },
    });
    if ("result" in resourceRead) {
      expect(resourceRead.result.contents[0].text).toContain("decisionEnvelope");
      expect(resourceRead.result.contents[0].text).toContain("derived or provenance containers");
    }

    const taxonomyRead = await server.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "resources/read",
      params: { uri: "bot://mcp/runtime-cycle-summary-schema" },
    });
    expect(taxonomyRead).toMatchObject({
      jsonrpc: "2.0",
      id: 5,
      result: {
        resource: {
          uri: "bot://mcp/runtime-cycle-summary-schema",
        },
      },
    });
    if ("result" in taxonomyRead) {
      expect(taxonomyRead.result.contents[0].text).toContain("decisionHistoryRole");
      expect(taxonomyRead.result.contents[0].text).toContain("container is canonical only when it is the runtime cycle summary record itself");
    }

    const replayRead = await server.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 6,
      method: "resources/read",
      params: { uri: "bot://mcp/replay-semantics" },
    });
    expect(replayRead).toMatchObject({
      jsonrpc: "2.0",
      id: 6,
      result: {
        resource: {
          classification: "safe derived replay resource",
          uri: "bot://mcp/replay-semantics",
        },
      },
    });
    if ("result" in replayRead) {
      expect(replayRead.result.contents[0].text).toContain("Derived replay view only");
      expect(replayRead.result.contents[0].text).toContain("does not control runtime state");
    }

    const journalRead = await server.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 7,
      method: "resources/read",
      params: { uri: "bot://mcp/journal-provenance" },
    });
    expect(journalRead).toMatchObject({
      jsonrpc: "2.0",
      id: 7,
      result: {
        resource: {
          classification: "safe append-only evidence/provenance resource",
          uri: "bot://mcp/journal-provenance",
        },
      },
    });
    if ("result" in journalRead) {
      expect(journalRead.result.contents[0].text).toContain("Append-only evidence/provenance view only");
      expect(journalRead.result.contents[0].text).toContain("they do not provide mutation, execution, policy, or control authority");
    }

    const sidecarRead = await server.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 8,
      method: "resources/read",
      params: { uri: "bot://mcp/sidecar-observation" },
    });
    expect(sidecarRead).toMatchObject({
      jsonrpc: "2.0",
      id: 8,
      result: {
        resource: {
          classification: "safe sidecar observational resource",
          uri: "bot://mcp/sidecar-observation",
        },
      },
    });
    if ("result" in sidecarRead) {
      expect(sidecarRead.result.contents[0].text).toContain("Sidecar observational view only");
      expect(sidecarRead.result.contents[0].text).toContain("discoveredCandidates");
    }
  });

  it("fails closed when forbidden authority-sensitive modules are added to the registry", () => {
    const maliciousManifest = {
      ...MCP_SERVER_MANIFEST,
      prompts: [
        ...MCP_SERVER_MANIFEST.prompts,
        {
          ...MCP_SERVER_MANIFEST.prompts[0],
          sourceModule: "core/engine.ts",
        },
      ],
    };

    expect(() => assertPromptResourcePlaneOnly(maliciousManifest)).toThrow(/MCP_FORBIDDEN_SURFACE/);
  });

  it("fails closed when forbidden modules or tools are added to resources", () => {
    expect(() =>
      assertPromptResourcePlaneOnly({
        ...MCP_SERVER_MANIFEST,
        tools: ["execute" as never] as never,
      })
    ).toThrow(/MCP_FORBIDDEN_TOOLS_PRESENT/);

    expect(() =>
      assertPromptResourcePlaneOnly({
        ...MCP_SERVER_MANIFEST,
        resources: [
          ...MCP_SERVER_MANIFEST.resources,
          {
            ...MCP_SERVER_MANIFEST.resources[0],
            sourceModule: "runtime/live-runtime.ts",
          },
        ],
      })
    ).toThrow(/MCP_FORBIDDEN_SURFACE/);

    expect(() =>
      assertPromptResourcePlaneOnly({
        ...MCP_SERVER_MANIFEST,
        resources: [
          ...MCP_SERVER_MANIFEST.resources,
          {
            ...MCP_SERVER_MANIFEST.resources[0],
            classification: "safe read-only resource-plane surface" as const,
            content: "x".repeat(801),
          },
        ],
      })
    ).toThrow(/MCP_RESOURCE_CONTENT_TOO_BROAD/);
  });

  it("fails closed on unknown methods and keeps the package root unextended", async () => {
    const server = createMcpBootstrap();
    const response = await server.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: "missing",
      method: "runtime/execute",
    });

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: "missing",
      error: {
        code: -32601,
      },
    });

    const rootIndex = readFileSync(resolve(SRC_ROOT, "index.ts"), "utf8");
    expect(rootIndex).not.toMatch(/export .*"\.\/mcp\//);

    for (const pattern of MCP_FORBIDDEN_MODULE_PATTERNS) {
      expect(pattern).toBeDefined();
    }
  });
});
