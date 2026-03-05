import pino from "pino";

export const apiLogger = pino({
  name: "api",
  level: process.env["LOG_LEVEL"] ?? "info",
  timestamp: pino.stdTimeFunctions.isoTime,
});
