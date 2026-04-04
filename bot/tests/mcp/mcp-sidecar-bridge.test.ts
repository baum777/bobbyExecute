import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createMcpBootstrap } from "../../src/mcp/bootstrap.js";
import {
  assertMcpSidecarBridgeOnly,
  MCP_SIDECAR_BRIDGE_ALLOWED_CLASSIFICATIONS,
  MCP_SIDECAR_BRIDGE_ALLOWED_RESOURCE_URIS,
  MCP_SIDECAR_BRIDGE_ALLOWED_UPSTREAM_SOURCE_MODULES,
  MCP_SIDECAR_BRIDGE_MANIFEST,
} from "../../src/mcp/sidecar-bridge.js";
import { SIDECAR_ALLOWED_SOURCE_MODULES } from "../../src/runtime/sidecar/sidecar-exposure.js";

const SRC_ROOT = resolve(process.cwd(), "src");

function parseImports(text: string): string[] {
  const imports: string[] = [];
  const pattern = /from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    imports.push(match[1]);
    match = pattern.exec(text);
  }

  return imports;
}

describe("MCP sidecar bridge", () => {
  it("bridges allowlisted sidecar surfaces as bounded read-only resources", async () => {
    const server = createMcpBootstrap();
    const bridgeResources = MCP_SIDECAR_BRIDGE_MANIFEST.resources;

    expect(MCP_SIDECAR_BRIDGE_MANIFEST.version).toBe("mcp.sidecar-bridge.v1");
    expect(MCP_SIDECAR_BRIDGE_MANIFEST.upstreamSidecarPackageVersion).toBe("sidecar.exposure.v1");
    expect(MCP_SIDECAR_BRIDGE_MANIFEST.allowedResourceUris).toEqual(MCP_SIDECAR_BRIDGE_ALLOWED_RESOURCE_URIS);
    expect(MCP_SIDECAR_BRIDGE_MANIFEST.allowedClassifications).toEqual(MCP_SIDECAR_BRIDGE_ALLOWED_CLASSIFICATIONS);
    expect(MCP_SIDECAR_BRIDGE_MANIFEST.allowedUpstreamSourceModules).toEqual(
      MCP_SIDECAR_BRIDGE_ALLOWED_UPSTREAM_SOURCE_MODULES
    );
    expect(MCP_SIDECAR_BRIDGE_ALLOWED_UPSTREAM_SOURCE_MODULES).toEqual(SIDECAR_ALLOWED_SOURCE_MODULES);
    expect(bridgeResources).toHaveLength(5);
    expect(bridgeResources.map((resource) => resource.uri)).toEqual(MCP_SIDECAR_BRIDGE_ALLOWED_RESOURCE_URIS);
    expect(bridgeResources.map((resource) => resource.classification)).toEqual([
      MCP_SIDECAR_BRIDGE_ALLOWED_CLASSIFICATIONS[0],
      MCP_SIDECAR_BRIDGE_ALLOWED_CLASSIFICATIONS[0],
      MCP_SIDECAR_BRIDGE_ALLOWED_CLASSIFICATIONS[0],
      MCP_SIDECAR_BRIDGE_ALLOWED_CLASSIFICATIONS[1],
      MCP_SIDECAR_BRIDGE_ALLOWED_CLASSIFICATIONS[2],
    ]);
    expect(() => assertMcpSidecarBridgeOnly(MCP_SIDECAR_BRIDGE_MANIFEST)).not.toThrow();

    const listedBridgeUris = server
      .listResources()
      .map((resource) => resource.uri)
      .filter((uri) => uri.startsWith("bot://mcp/sidecar/"));
    expect(listedBridgeUris).toEqual(MCP_SIDECAR_BRIDGE_ALLOWED_RESOURCE_URIS);

    for (const resource of bridgeResources) {
      const response = await server.handleJsonRpcRequest({
        jsonrpc: "2.0",
        id: resource.uri,
        method: "resources/read",
        params: { uri: resource.uri },
      });

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: resource.uri,
        result: {
          resource: {
            kind: "resource",
            uri: resource.uri,
            sourceModule: "mcp/sidecar-bridge.ts",
          },
        },
      });

      if ("result" in response) {
        const content = response.result.contents[0].text;
        expect(content.length).toBeLessThan(500);
        expect(content.toLowerCase()).toContain("read-only");
        expect(content.toLowerCase()).toContain("non-authoritative");
        expect(content).toContain("sidecar.exposure.v1");
      }
    }

    expect(bridgeResources[0].content).toContain("sidecar.exposure.v1");
    expect(bridgeResources[1].content).toContain("trend-reversal-monitor-runner");
    expect(bridgeResources[2].content).toContain("checkedCandidates");
    expect(bridgeResources[3].content).toContain("parity");
    expect(bridgeResources[4].content).toContain("monitorResult.emittedObservations");

    const bridgeSource = readFileSync(resolve(SRC_ROOT, "mcp/sidecar-bridge.ts"), "utf8");
    expect(parseImports(bridgeSource)).toEqual([
      "./manifest.js",
      "../runtime/sidecar/sidecar-exposure.js",
    ]);
    expect(bridgeSource).not.toMatch(/runtime\/live-runtime\.js/);
    expect(bridgeSource).not.toMatch(/core\/engine\.js/);
    expect(bridgeSource).not.toMatch(/server\/routes\//);
    expect(bridgeSource).not.toMatch(/execution\//);
    expect(bridgeSource).not.toMatch(/policy\//);
    expect(bridgeSource).not.toMatch(/risk\//);
    expect(bridgeSource).not.toMatch(/control\//);
  });

  it("fails closed when the bridge allowlist or authority semantics drift", () => {
    expect(() =>
      assertMcpSidecarBridgeOnly({
        ...MCP_SIDECAR_BRIDGE_MANIFEST,
        allowedResourceUris: [...MCP_SIDECAR_BRIDGE_MANIFEST.allowedResourceUris, "bot://mcp/sidecar/extra"] as never,
      })
    ).toThrow(/MCP_SIDECAR_BRIDGE_INVALID_ALLOWED_RESOURCE_URIS/);

    expect(() =>
      assertMcpSidecarBridgeOnly({
        ...MCP_SIDECAR_BRIDGE_MANIFEST,
        allowedClassifications: [
          ...MCP_SIDECAR_BRIDGE_MANIFEST.allowedClassifications,
          "safe read-only resource-plane surface" as never,
        ] as never,
      })
    ).toThrow(/MCP_SIDECAR_BRIDGE_INVALID_ALLOWED_CLASSIFICATIONS/);

    expect(() =>
      assertMcpSidecarBridgeOnly({
        ...MCP_SIDECAR_BRIDGE_MANIFEST,
        allowedUpstreamSourceModules: [
          ...MCP_SIDECAR_BRIDGE_MANIFEST.allowedUpstreamSourceModules,
          "runtime/live-runtime.ts",
        ] as never,
      })
    ).toThrow(/MCP_SIDECAR_BRIDGE_INVALID_ALLOWED_UPSTREAM_SOURCE_MODULES/);

    expect(() =>
      assertMcpSidecarBridgeOnly({
        ...MCP_SIDECAR_BRIDGE_MANIFEST,
        resources: [
          ...MCP_SIDECAR_BRIDGE_MANIFEST.resources.slice(0, 2),
          {
            ...MCP_SIDECAR_BRIDGE_MANIFEST.resources[2],
            sourceModule: "runtime/live-runtime.ts",
          },
          ...MCP_SIDECAR_BRIDGE_MANIFEST.resources.slice(3),
        ],
      })
    ).toThrow(/MCP_SIDECAR_BRIDGE_FORBIDDEN_SOURCE/);

    expect(() =>
      assertMcpSidecarBridgeOnly({
        ...MCP_SIDECAR_BRIDGE_MANIFEST,
        resources: MCP_SIDECAR_BRIDGE_MANIFEST.resources.map((resource, index) =>
          index === 3
            ? {
                ...resource,
                classification: "safe read-only resource-plane surface" as never,
              }
            : resource
        ),
      })
    ).toThrow(/MCP_SIDECAR_BRIDGE_INVALID_CLASSIFICATION/);

    expect(() =>
      assertMcpSidecarBridgeOnly({
        ...MCP_SIDECAR_BRIDGE_MANIFEST,
        resources: MCP_SIDECAR_BRIDGE_MANIFEST.resources.map((resource, index) =>
          index === 4
            ? {
                ...resource,
                content:
                  "sidecar.exposure.v1 read-only non-authoritative approval recommendation authority operator action passthrough",
              }
            : resource
        ),
      })
    ).toThrow(/MCP_SIDECAR_BRIDGE_FORBIDDEN_PHRASE/);
  });
});
