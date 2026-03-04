/**
 * Input normalization for hash stability.
 * PROPOSED for deterministic decision hashing.
 */

function roundFloat(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function canonicalizeValue(v: unknown, key?: string): unknown {
  if (v === null || v === undefined) return null;
  
  if (typeof v === "number") {
    // Percent-return fields round to 4 decimals, others to 6
    const decimals = (key && (key.endsWith("_pct") || key.endsWith("_return"))) ? 4 : 6;
    return roundFloat(v, decimals);
  }

  if (typeof v !== "object") return v;
  
  if (Array.isArray(v)) {
    return v.map((item) => canonicalizeValue(item));
  }

  return canonicalizeObject(v as Record<string, unknown>);
}

const VOLATILE_FIELDS = new Set(["hash", "signature", "received_at", "event_hash"]);

export function canonicalizeObject(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj)
    .filter(k => !VOLATILE_FIELDS.has(k))
    .sort();

  for (const k of keys) {
    sorted[k] = canonicalizeValue(obj[k], k);
  }
  return sorted;
}

/**
 * Canonicalize for hashing - keys sorted, deterministic JSON.
 * Follows DETERMINISM_CANONICALIZATION.md v1.0
 */
export function canonicalize(input: unknown): string {
  if (input === null || input === undefined) return "null";
  
  const normalized = canonicalizeValue(input);
  return JSON.stringify(normalized);
}
