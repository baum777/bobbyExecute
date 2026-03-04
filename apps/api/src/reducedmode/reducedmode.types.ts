import { z } from "zod";

export const ReducedModeRunRequestSchema = z.object({
  mode: z.enum(["live", "dry"]).optional(),
  maxTokens: z.number().int().positive().max(200).optional(),
});

export type ReducedModeRunRequest = z.infer<typeof ReducedModeRunRequestSchema>;
