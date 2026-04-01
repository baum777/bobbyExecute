/**
 * Pre-authority observation normalization.
 * Deterministic helper for v2 source observations.
 */
import { hashDecision } from "../core/determinism/hash.js";
import {
  SourceObservationSchema,
  type SourceObservation,
  type SourceObservationChain,
  type SourceObservationSource,
  type SourceObservationStatus,
} from "./contracts/source-observation.js";

export interface CreateSourceObservationInput {
  source: SourceObservationSource;
  token: string;
  chain?: SourceObservationChain;
  observedAtMs: number;
  freshnessMs: number;
  payload: unknown;
  rawRef?: string;
  missingFields?: string[];
  notes?: string[];
}

function deriveStatus(
  missingFields: string[]
): SourceObservationStatus {
  if (missingFields.length > 0) {
    return "PARTIAL";
  }
  return "OK";
}

export function createSourceObservation(
  input: CreateSourceObservationInput
): SourceObservation {
  const missingFields = [...new Set(input.missingFields ?? [])].sort();
  const notes = [...new Set(input.notes ?? [])].sort();
  const payloadHash = hashDecision(input.payload);
  const isStale = input.freshnessMs > 0;

  return SourceObservationSchema.parse({
    schema_version: "source_observation.v1",
    source: input.source,
    token: input.token,
    chain: input.chain ?? "solana",
    observedAtMs: input.observedAtMs,
    freshnessMs: input.freshnessMs,
    payloadHash,
    status: deriveStatus(missingFields),
    isStale,
    rawRef: input.rawRef,
    missingFields,
    notes,
  });
}

export function withSourceObservationStatus(
  observation: SourceObservation,
  status: SourceObservationStatus
): SourceObservation {
  return SourceObservationSchema.parse({
    ...observation,
    status,
  });
}
