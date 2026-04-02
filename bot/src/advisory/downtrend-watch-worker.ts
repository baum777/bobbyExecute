/**
 * Advisory-only downtrend discovery adapter.
 * Accepts already-fetched inputs and maps strict JSON into watch candidates.
 */
import { z } from "zod";
import type { ContextPackV1 } from "../intelligence/context/contracts/context-pack.v1.js";
import type { CQDSnapshotV1 } from "../intelligence/cqd/contracts/cqd.snapshot.v1.js";
import {
  WatchCandidateSchema,
  type WatchCandidate,
  type WatchCandidateConfidenceBand,
  type WatchCandidateMonitorRecommendation,
} from "../discovery/contracts/watch-candidate.js";

const WorkerDiscoveryCandidateSchema = z.object({
  token: z.string(),
  observationCompleteness: z.number().min(0).max(1),
  monitorRecommendation: z.enum(["monitor", "ignore", "defer"]),
  confidenceBand: z.enum(["low", "medium", "high"]).optional(),
  evidenceRefs: z.array(z.string()).optional(),
  ttlMs: z.number().int().positive().max(24 * 60 * 60 * 1000).optional(),
});

const WorkerDiscoveryPayloadSchema = z.object({
  candidates: z.array(WorkerDiscoveryCandidateSchema).default([]),
});

export interface DowntrendWatchWorkerInput {
  nowMs: number;
  rawDiscoveryInputs: unknown;
  cqdSnapshot?: CQDSnapshotV1;
  contextPack?: ContextPackV1;
  defaultTtlMs?: number;
}

function normalizeConfidenceBand(
  completeness: number,
  configuredBand?: WatchCandidateConfidenceBand
): WatchCandidateConfidenceBand {
  if (configuredBand) {
    return configuredBand;
  }
  if (completeness >= 0.9) {
    return "high";
  }
  if (completeness >= 0.75) {
    return "medium";
  }
  return "low";
}

function normalizeRecommendation(
  recommendation: WatchCandidateMonitorRecommendation
): WatchCandidateMonitorRecommendation {
  return recommendation;
}

function buildWatchCandidate(
  candidate: z.infer<typeof WorkerDiscoveryCandidateSchema>,
  input: DowntrendWatchWorkerInput
): WatchCandidate {
  const nowMs = input.nowMs;
  const ttlMs = candidate.ttlMs ?? input.defaultTtlMs ?? 6 * 60 * 60 * 1000;

  return WatchCandidateSchema.parse({
    token: candidate.token,
    source: "llm_downtrend_worker",
    observationCompleteness: candidate.observationCompleteness,
    monitorRecommendation: normalizeRecommendation(candidate.monitorRecommendation),
    ttlExpiresAt: nowMs + ttlMs,
    createdAt: nowMs,
    updatedAt: nowMs,
    confidenceBand: normalizeConfidenceBand(
      candidate.observationCompleteness,
      candidate.confidenceBand
    ),
    evidenceRefs: [...new Set(candidate.evidenceRefs ?? [])].sort(),
  });
}

export function parseDowntrendWatchWorkerOutput(
  input: DowntrendWatchWorkerInput
): WatchCandidate[] {
  void input.cqdSnapshot;
  void input.contextPack;

  const parsed = WorkerDiscoveryPayloadSchema.parse(input.rawDiscoveryInputs);
  return parsed.candidates.map((candidate) => buildWatchCandidate(candidate, input));
}
