/**
 * Pre-authority evidence bundling.
 * Deterministic helper for v2 discovery evidence.
 */
import { hashDecision } from "../core/determinism/hash.js";
import type { SourceObservation } from "./contracts/source-observation.js";
import {
  DiscoveryEvidenceSchema,
  type DiscoveryEvidence,
  type DiscoveryEvidenceStatus,
  createDiscoveryEvidenceRef,
} from "./contracts/discovery-evidence.js";

export interface BuildDiscoveryEvidenceInput {
  token: string;
  chain?: "solana";
  observations: SourceObservation[];
  collectedAtMs?: number;
  knownRequiredFields?: string[];
  sourceFieldPresence?: Partial<Record<SourceObservation["source"], string[]>>;
  sourceDisagreements?: Record<string, SourceObservation["source"][]>;
  notes?: string[];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sortObservations(observations: SourceObservation[]): SourceObservation[] {
  return [...observations].sort((a, b) => {
    return (
      a.source.localeCompare(b.source) ||
      a.observedAtMs - b.observedAtMs ||
      a.payloadHash.localeCompare(b.payloadHash)
    );
  });
}

function summarizeSources(observations: SourceObservation[]): Array<SourceObservation["source"]> {
  return uniqueSorted(observations.map((observation) => observation.source)) as Array<SourceObservation["source"]>;
}

function summarizeMissingFields(
  observations: SourceObservation[],
  knownRequiredFields: string[],
  sourceFieldPresence: Partial<Record<SourceObservation["source"], string[]>>
): string[] {
  const inferredMissing = new Set<string>();
  const explicitMissingByField = new Map<string, Set<SourceObservation["source"]>>();

  for (const observation of observations) {
    for (const field of observation.missingFields) {
      const sources = explicitMissingByField.get(field) ?? new Set<SourceObservation["source"]>();
      sources.add(observation.source);
      explicitMissingByField.set(field, sources);
    }
  }

  for (const field of knownRequiredFields) {
    let fieldSeen = false;
    for (const observation of observations) {
      const present = new Set(sourceFieldPresence[observation.source] ?? []);
      if (present.has(field)) {
        fieldSeen = true;
        break;
      }
    }
    if (!fieldSeen) {
      inferredMissing.add(field);
    }
  }

  for (const [field, sources] of explicitMissingByField.entries()) {
    if (sources.size >= observations.length) {
      inferredMissing.add(field);
    }
  }

  return uniqueSorted([...inferredMissing]);
}

function summarizeCompleteness(
  knownRequiredFields: string[],
  missingFields: string[]
): number {
  if (knownRequiredFields.length === 0) {
    return 1;
  }
  const missingCount = missingFields.filter((field) => knownRequiredFields.includes(field)).length;
  return Math.max(0, (knownRequiredFields.length - Math.min(knownRequiredFields.length, missingCount)) / knownRequiredFields.length);
}

function summarizeStatus(
  observations: SourceObservation[],
  missingFields: string[]
): DiscoveryEvidenceStatus {
  if (observations.length === 0 || observations.some((observation) => observation.status === "ERROR")) {
    return "REJECTED";
  }
  if (
    missingFields.length > 0 ||
    observations.some((observation) => observation.status !== "OK" || observation.isStale)
  ) {
    return "PARTIAL";
  }
  return "COLLECTED";
}

function summarizeDisagreedSources(
  sourceDisagreements: Record<string, SourceObservation["source"][]>
): Record<string, SourceObservation["source"][]> {
  return Object.fromEntries(
    Object.entries(sourceDisagreements)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([field, sources]) => [field, uniqueSorted(sources) as Array<SourceObservation["source"]>])
  );
}

export function buildDiscoveryEvidence(
  input: BuildDiscoveryEvidenceInput
): DiscoveryEvidence {
  const observations = sortObservations(input.observations);
  const knownRequiredFields = uniqueSorted(input.knownRequiredFields ?? []);
  const sourceFieldPresence = input.sourceFieldPresence ?? {};
  const missingFields = summarizeMissingFields(observations, knownRequiredFields, sourceFieldPresence);
  const disagreedSources = summarizeDisagreedSources(input.sourceDisagreements ?? {});
  const disagreedFields = Object.keys(disagreedSources).sort();
  const sources = summarizeSources(observations);
  const completeness = summarizeCompleteness(knownRequiredFields, missingFields);
  const status = summarizeStatus(observations, missingFields);
  const notes = uniqueSorted(input.notes ?? []);
  const collectedAtMs =
    input.collectedAtMs ??
    (observations.length > 0 ? Math.max(...observations.map((observation) => observation.observedAtMs)) : 0);

  const payload = {
    token: input.token,
    chain: input.chain ?? "solana",
    observationHashes: observations.map((observation) => observation.payloadHash),
    missingFields,
    disagreedFields,
    disagreedSources,
    completeness,
    status,
  };
  const evidenceId = hashDecision(payload).slice(0, 16);

  return DiscoveryEvidenceSchema.parse({
    schema_version: "discovery_evidence.v1",
    token: input.token,
    chain: input.chain ?? "solana",
    evidenceId,
    evidenceRef: createDiscoveryEvidenceRef(input.token, evidenceId),
    observationRefs: observations.map((observation) => observation.rawRef ?? observation.payloadHash),
    sources,
    observations,
    collectedAtMs,
    payloadHash: hashDecision(payload),
    completeness,
    status,
    missingFields,
    disagreedFields,
    disagreedSources,
    notes,
  });
}
