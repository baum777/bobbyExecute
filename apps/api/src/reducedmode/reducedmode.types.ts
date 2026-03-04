import { z } from "zod";

export const RunRequestSchema = z.object({
  mode: z.enum(["live", "dry"]).optional().default("dry"),
  maxTokens: z.number().int().min(5).max(100).optional(),
});
export type RunRequest = z.infer<typeof RunRequestSchema>;
