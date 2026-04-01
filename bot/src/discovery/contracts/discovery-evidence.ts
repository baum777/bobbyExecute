/**
 * Pre-authority typed artifact.
 * Contract scaffold only for v2 discovery evidence.
 */
import { z } from "zod";
import {
  SourceObservationSchema,
  SourceObservationSourceSchema,
} from "./source-observation.js";

export const DiscoveryEvidenceStatusSchema = z.enum([
  "COLLECTED",
  "PARTIAL",
  "REJECTED",
]);

export const DiscoveryEvidenceSchema = z.object({
  schema_version: z.literal("discovery_evidence.v1"),
  token: z.string(),
  chain: z.enum(["solana"]),
  evidenceId: z.string(),
  evidenceRef: z.string(),
  observationRefs: z.array(z.string()).default([]),
  sources: z.array(SourceObservationSourceSchema).default([]),
  observations: z.array(SourceObservationSchema).default([]),
  collectedAtMs: z.number().int().nonnegative(),
  payloadHash: z.string(),
  completeness: z.number().min(0).max(1),
  status: DiscoveryEvidenceStatusSchema,
  missingFields: z.array(z.string()).default([]),
  disagreedFields: z.array(z.string()).default([]),
  disagreedSources: z.record(z.array(SourceObservationSourceSchema)).default({}),
  notes: z.array(z.string()).default([]),
});

export type DiscoveryEvidenceStatus = z.infer<typeof DiscoveryEvidenceStatusSchema>;
export type DiscoveryEvidence = z.infer<typeof DiscoveryEvidenceSchema>;

export function createDiscoveryEvidenceRef(
  token: string,
  evidenceId: string
): string {
  return `discovery_evidence:${token}:${evidenceId}`;
}
