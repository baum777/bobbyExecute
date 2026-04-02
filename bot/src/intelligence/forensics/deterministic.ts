/**
 * Thin deterministic helpers for the forensics foundation.
 * Reuses core hashing ownership instead of adding a parallel crypto tree.
 */
import { hashResult } from "../../core/determinism/hash.js";

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function uniqueSorted(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))]
    .sort((left, right) => left.localeCompare(right));
}

export function sortRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );
}

export function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function hashPayload(payload: unknown): string {
  return hashResult(payload);
}
