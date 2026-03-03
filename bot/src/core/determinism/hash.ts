/**
 * Deterministic SHA-256 hashing for decisions and results.
 * PROPOSED - used for audit integrity.
 */
import crypto from "node:crypto";
import { canonicalize } from "./canonicalize.js";

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashDecision(input: unknown): string {
  return sha256(canonicalize(input));
}

export function hashResult(output: unknown): string {
  return sha256(canonicalize(output));
}
