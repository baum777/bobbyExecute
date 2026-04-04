/**
 * Sidecar-to-MCP bridge.
 * Small, bounded, read-only bridge from sidecar.exposure.v1 into the MCP resource plane.
 * Observational, replay/enrichment, or watchlist-only. Non-authoritative and fail-closed.
 * Wave 5-04 manifest-freeze slice: exact allowlist items are frozen; no feature expansion.
 */

import type { McpResourceDescriptor } from "./manifest.js";
import {
  assertSidecarExposureOnly,
  SIDECAR_EXPOSURE_MANIFEST,
  SIDECAR_PACKAGE_VERSION,
  SIDECAR_ALLOWED_SOURCE_MODULES,
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
  allowedResourceUris: typeof MCP_SIDECAR_BRIDGE_ALLOWED_RESOURCE_URIS;
  allowedClassifications: readonly McpSidecarBridgeResourceClassification[];
  allowedUpstreamSourceModules: typeof SIDECAR_ALLOWED_SOURCE_MODULES;
  resources: readonly McpSidecarBridgeResourceDescriptor[];
}

const BRIDGE_SOURCE_MODULE = "mcp/sidecar-bridge.ts";
export const MCP_SIDECAR_BRIDGE_ALLOWED_RESOURCE_URIS = [
  "bot://mcp/sidecar/posture",
  "bot://mcp/sidecar/surface-map",
  "bot://mcp/sidecar/trend-reversal-monitor-runner",
  "bot://mcp/sidecar/shadow-artifact-chain",
  "bot://mcp/sidecar/sidecar-worker-loop",
] as const;

export const MCP_SIDECAR_BRIDGE_ALLOWED_CLASSIFICATIONS = [
  "safe sidecar observational resource",
  "safe sidecar replay/enrichment resource",
  "safe sidecar watchlist-oriented resource",
] as const;

export const MCP_SIDECAR_BRIDGE_ALLOWED_UPSTREAM_SOURCE_MODULES = SIDECAR_ALLOWED_SOURCE_MODULES;

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
    uri: MCP_SIDECAR_BRIDGE_ALLOWED_RESOURCE_URIS[0],
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
    uri: MCP_SIDECAR_BRIDGE_ALLOWED_RESOURCE_URIS[1],
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
  allowedResourceUris: MCP_SIDECAR_BRIDGE_ALLOWED_RESOURCE_URIS,
  allowedClassifications: MCP_SIDECAR_BRIDGE_ALLOWED_CLASSIFICATIONS,
  allowedUpstreamSourceModules: MCP_SIDECAR_BRIDGE_ALLOWED_UPSTREAM_SOURCE_MODULES,
  resources: MCP_SIDECAR_BRIDGE_RESOURCES,
};

export function assertMcpSidecarBridgeOnly(manifest: McpSidecarBridgeManifest): void {
  if (manifest.version !== MCP_SIDECAR_BRIDGE_VERSION) {
    throw new Error(`MCP_SIDECAR_BRIDGE_INVALID_VERSION:${manifest.version}`);
  }
  if (manifest.upstreamSidecarPackageVersion !== SIDECAR_PACKAGE_VERSION) {
    throw new Error(`MCP_SIDECAR_BRIDGE_INVALID_UPSTREAM:${manifest.upstreamSidecarPackageVersion}`);
  }
  if (
    manifest.allowedResourceUris.length !== MCP_SIDECAR_BRIDGE_ALLOWED_RESOURCE_URIS.length ||
    manifest.allowedResourceUris.some((uri, index) => uri !== MCP_SIDECAR_BRIDGE_ALLOWED_RESOURCE_URIS[index])
  ) {
    throw new Error("MCP_SIDECAR_BRIDGE_INVALID_ALLOWED_RESOURCE_URIS");
  }
  if (
    manifest.allowedClassifications.length !== MCP_SIDECAR_BRIDGE_ALLOWED_CLASSIFICATIONS.length ||
    manifest.allowedClassifications.some(
      (classification, index) => classification !== MCP_SIDECAR_BRIDGE_ALLOWED_CLASSIFICATIONS[index]
    )
  ) {
    throw new Error("MCP_SIDECAR_BRIDGE_INVALID_ALLOWED_CLASSIFICATIONS");
  }
  if (
    manifest.allowedUpstreamSourceModules.length !== MCP_SIDECAR_BRIDGE_ALLOWED_UPSTREAM_SOURCE_MODULES.length ||
    manifest.allowedUpstreamSourceModules.some(
      (sourceModule, index) => sourceModule !== MCP_SIDECAR_BRIDGE_ALLOWED_UPSTREAM_SOURCE_MODULES[index]
    )
  ) {
    throw new Error("MCP_SIDECAR_BRIDGE_INVALID_ALLOWED_UPSTREAM_SOURCE_MODULES");
  }
  if (manifest.resources.length !== MCP_SIDECAR_BRIDGE_ALLOWED_RESOURCE_URIS.length) {
    throw new Error(`MCP_SIDECAR_BRIDGE_INVALID_RESOURCE_COUNT:${manifest.resources.length}`);
  }

  manifest.resources.forEach((resource, index) => {
    if (resource.kind !== "resource") {
      throw new Error(`MCP_SIDECAR_BRIDGE_INVALID_KIND:${resource.uri}`);
    }
    if (resource.uri !== MCP_SIDECAR_BRIDGE_ALLOWED_RESOURCE_URIS[index]) {
      throw new Error(`MCP_SIDECAR_BRIDGE_UNEXPECTED_URI:${resource.uri}`);
    }
    if (resource.sourceModule !== BRIDGE_SOURCE_MODULE) {
      throw new Error(`MCP_SIDECAR_BRIDGE_FORBIDDEN_SOURCE:${resource.uri}:${resource.sourceModule}`);
    }
    if (!MCP_SIDECAR_BRIDGE_ALLOWED_CLASSIFICATIONS.includes(resource.classification)) {
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
