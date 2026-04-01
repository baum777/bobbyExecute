/**
 * Pre-authority typed artifact.
 * Contract scaffold only for v2 context enrichment.
 */
import { z } from "zod";

export const ContextPackV1Schema = z.object({
  version: z.literal("1.0"),
  token: z.string(),
  chain: z.enum(["solana"]).default("solana"),
  sentiment: z.number().min(-1).max(1).optional(),
  sentimentVelocity: z.number().optional(),
  narrativeTags: z.array(z.string()).default([]),
  narrativeConfidence: z.number().min(0).max(1).optional(),
  spamScore: z.number().min(0).max(1).optional(),
  coordinationScore: z.number().min(0).max(1).optional(),
  organicScore: z.number().min(0).max(1).optional(),
  amplifiedScore: z.number().min(0).max(1).optional(),
  evidenceRefs: z.array(z.string()).default([]),
});

export type ContextPackV1 = z.infer<typeof ContextPackV1Schema>;
