/**
 * Sidecar-to-MCP bridge.
 * Small, bounded, read-only bridge from sidecar.exposure.v1 into the MCP resource plane.
 * Observational, replay/enrichment, or watchlist-only. Non-authoritative and fail-closed.
 * Wave 5-03 audit/hardening slice: no hidden query, approval, or control semantics.
 */

import type { McpResourceDescriptor } from "./manifest.js";
import {
  assertSidecarExposureOnly,
  SIDECAR_EXPOSURE_MANIFEST,
  SIDECAR_PACKAGE_VERSION,
  type SidecarExposureManifest,
  type SidecarSurfaceDescriptor,
} from "../runtime/sidecar/sidecar-exposure.js";

export const MCP_SIDECAR_BRIDGE_VERSION = "mcp.sidecar-bridge.v1" as const;

export type McpSidecarBridgeResourceClassification =
  | "safe sidecar observational resource"
  | "safe sidecar replay/enrichment resource"
  | "safe sidecar watchlist-oriented resource";

export interface McpSidecarBridgeResourceDescriptor extends McpResourceDescriptor {
  classification: McpSidecarBridgeResourceClassification;
}

export interface McpSidecarBridgeManifest {
  version: typeof MCP_SIDECAR_BRIDGE_VERSION;
  upstreamSidecarPackageVersion: typeof SIDECAR_PACKAGE_VERSION;
  resources: readonly McpSidecarBridgeResourceDescriptor[];
}

const BRIDGE_SOURCE_MODULE = "mcp/sidecar-bridge.ts";
const BRIDGE_RESOURCE_URIS = [
  "bot://mcp/sidecar/posture",
  "bot://mcp/sidecar/surface-map",
  "bot://mcp/sidecar/trend-reversal-monitor-runner",
  "bot://mcp/sidecar/shadow-artifact-chain",
  "bot://mcp/sidecar/sidecar-worker-loop",
] as const;

const BRIDGE_FORBIDDEN_PHRASES = [
  "approval",
  "blocking authority",
  "decision authority",
  "scoring authority",
  "policy authority",
  "control authority",
  "recommendation authority",
  "operator action",
  "canonical decision-history ownership",
  "canonical decision history ownership",
  "hidden query",
  "mini-tool",
  "passthrough",
] as const;

function classifySurface(
  surface: SidecarSurfaceDescriptor
): McpSidecarBridgeResourceClassification {
  switch (surface.name) {
    case "shadow-artifact-chain":
      return "safe sidecar replay/enrichment resource";
    case "sidecar-worker-loop":
      return "safe sidecar watchlist-oriented resource";
    default:
      return "safe sidecar observational resource";
  }
}

function describeAllowedOutputs(surface: SidecarSurfaceDescriptor): string {
  return surface.allowedOutputs.join(", ");
}

function describeBridgeResource(surface: SidecarSurfaceDescriptor): string {
  const classification = classifySurface(surface);
  return [
    "Sidecar bridge resource.",
    `Upstream sidecar package: ${SIDECAR_PACKAGE_VERSION}.`,
    `Upstream surface: ${surface.name} (${surface.classification}).`,
    `Bridge classification: ${classification}.`,
    `Read-only bridge. Non-authoritative. Zero tools.`,
    `Allowed outputs: ${describeAllowedOutputs(surface)}.`,
  ].join(" ");
}

function buildBridgeResource(
  surface: SidecarSurfaceDescriptor
): McpSidecarBridgeResourceDescriptor {
  return {
    kind: "resource",
    classification: classifySurface(surface),
    uri: `bot://mcp/sidecar/${surface.name}`,
    title: surface.title,
    description: `Read-only bridge for ${surface.name}; derived from sidecar.exposure.v1 and non-authoritative.`,
    mimeType: "text/plain",
    sourceModule: BRIDGE_SOURCE_MODULE,
    content: describeBridgeResource(surface),
  };
}

function buildPostureResource(): McpSidecarBridgeResourceDescriptor {
  return {
    kind: "resource",
    classification: "safe sidecar observational resource",
    uri: BRIDGE_RESOURCE_URIS[0],
    title: "Sidecar Bridge Posture",
    description: "Read-only sidecar bridge posture metadata for the bounded MCP exposure layer.",
    mimeType: "text/plain",
    sourceModule: BRIDGE_SOURCE_MODULE,
    content:
      "Sidecar bridge posture: sidecar.exposure.v1 upstream, prompt/resource-plane MCP downstream. Read-only, zero tools, non-authoritative, observational/enrichment/replay/watchlist only.",
  };
}

function buildSurfaceMapResource(
  surfaces: readonly SidecarSurfaceDescriptor[]
): McpSidecarBridgeResourceDescriptor {
  const summary = surfaces
    .map((surface) => `${surface.name}:${classifySurface(surface)}`)
    .join("; ");

  return {
    kind: "resource",
    classification: "safe sidecar observational resource",
    uri: BRIDGE_RESOURCE_URIS[1],
    title: "Sidecar Bridge Surface Map",
    description: "Read-only map of the explicitly bridged sidecar-safe surfaces.",
    mimeType: "text/plain",
    sourceModule: BRIDGE_SOURCE_MODULE,
    content:
      `Sidecar bridge surface map: ${summary}. Upstream allow-source is sidecar.exposure.v1. Read-only and non-authoritative.`,
  };
}

export function buildMcpSidecarBridgeResources(
  manifest: SidecarExposureManifest = SIDECAR_EXPOSURE_MANIFEST
): readonly McpSidecarBridgeResourceDescriptor[] {
  assertSidecarExposureOnly(manifest);

  const surfaceResources = manifest.surfaces.map((surface) => buildBridgeResource(surface));
  const resources: McpSidecarBridgeResourceDescriptor[] = [
    buildPostureResource(),
    buildSurfaceMapResource(manifest.surfaces),
    ...surfaceResources,
  ];

  return resources;
}

export const MCP_SIDECAR_BRIDGE_RESOURCES = buildMcpSidecarBridgeResources();

export const MCP_SIDECAR_BRIDGE_MANIFEST: McpSidecarBridgeManifest = {
  version: MCP_SIDECAR_BRIDGE_VERSION,
  upstreamSidecarPackageVersion: SIDECAR_PACKAGE_VERSION,
  resources: MCP_SIDECAR_BRIDGE_RESOURCES,
};

export function assertMcpSidecarBridgeOnly(manifest: McpSidecarBridgeManifest): void {
  if (manifest.version !== MCP_SIDECAR_BRIDGE_VERSION) {
    throw new Error(`MCP_SIDECAR_BRIDGE_INVALID_VERSION:${manifest.version}`);
  }
  if (manifest.upstreamSidecarPackageVersion !== SIDECAR_PACKAGE_VERSION) {
    throw new Error(`MCP_SIDECAR_BRIDGE_INVALID_UPSTREAM:${manifest.upstreamSidecarPackageVersion}`);
  }
  if (manifest.resources.length !== BRIDGE_RESOURCE_URIS.length) {
    throw new Error(`MCP_SIDECAR_BRIDGE_INVALID_RESOURCE_COUNT:${manifest.resources.length}`);
  }

  manifest.resources.forEach((resource, index) => {
    if (resource.kind !== "resource") {
      throw new Error(`MCP_SIDECAR_BRIDGE_INVALID_KIND:${resource.uri}`);
    }
    if (resource.uri !== BRIDGE_RESOURCE_URIS[index]) {
      throw new Error(`MCP_SIDECAR_BRIDGE_UNEXPECTED_URI:${resource.uri}`);
    }
    if (resource.sourceModule !== BRIDGE_SOURCE_MODULE) {
      throw new Error(`MCP_SIDECAR_BRIDGE_FORBIDDEN_SOURCE:${resource.uri}:${resource.sourceModule}`);
    }
    if (
      resource.classification !== "safe sidecar observational resource" &&
      resource.classification !== "safe sidecar replay/enrichment resource" &&
      resource.classification !== "safe sidecar watchlist-oriented resource"
    ) {
      throw new Error(`MCP_SIDECAR_BRIDGE_INVALID_CLASSIFICATION:${resource.uri}`);
    }
    if (resource.mimeType !== "text/plain") {
      throw new Error(`MCP_SIDECAR_BRIDGE_INVALID_MIME:${resource.uri}`);
    }
    if (resource.content.trim().length === 0) {
      throw new Error(`MCP_SIDECAR_BRIDGE_EMPTY_CONTENT:${resource.uri}`);
    }
    if (resource.content.length > 500) {
      throw new Error(`MCP_SIDECAR_BRIDGE_CONTENT_TOO_BROAD:${resource.uri}`);
    }
    if (!resource.content.includes("sidecar.exposure.v1")) {
      throw new Error(`MCP_SIDECAR_BRIDGE_MISSING_UPSTREAM:${resource.uri}`);
    }
    if (!resource.content.toLowerCase().includes("read-only")) {
      throw new Error(`MCP_SIDECAR_BRIDGE_MISSING_READONLY:${resource.uri}`);
    }
    if (!resource.content.toLowerCase().includes("non-authoritative")) {
      throw new Error(`MCP_SIDECAR_BRIDGE_MISSING_NONAUTHORITATIVE:${resource.uri}`);
    }

    for (const phrase of BRIDGE_FORBIDDEN_PHRASES) {
      if (resource.content.toLowerCase().includes(phrase.toLowerCase())) {
        throw new Error(`MCP_SIDECAR_BRIDGE_FORBIDDEN_PHRASE:${resource.uri}:${phrase}`);
      }
    }
  });
}
