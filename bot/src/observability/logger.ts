/**
 * Structured JSON logger - pino-based.
 * MAPPED from OrchestrAI_Labs ActionLogger/trace pattern.
 */
import pino from "pino";

export function createLogger(opts?: pino.LoggerOptions) {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    ...opts,
  });
}

export const logger = createLogger();
