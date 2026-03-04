/**
 * IntentSpec - Handelsabsicht und Constraints.
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: core/contracts | Last Updated: 2026-03-04
 */
import { z } from "zod";

export const IntentSpecSchema = z.object({
  traceId: z.string(),
  timestamp: z.string().datetime(),
  targetPairs: z.array(z.string()).min(1),
  constraints: z.object({
    maxSlippagePercent: z.number().min(0).max(100).optional(),
    maxPositionSizeUsd: z.number().positive().optional(),
    allowlistMints: z.array(z.string()).optional(),
    denylistMints: z.array(z.string()).optional(),
  }).optional(),
  dryRun: z.boolean().default(true),
});

export type IntentSpec = z.infer<typeof IntentSpecSchema>;
