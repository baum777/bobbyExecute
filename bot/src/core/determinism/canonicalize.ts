/**
 * Input normalization for hash stability.
 * PROPOSED for deterministic decision hashing.
 */
function canonicalizeValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(canonicalizeValue);
  return canonicalizeObject(v as Record<string, unknown>);
}

export function canonicalizeObject(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj).sort();
  for (const k of keys) {
    sorted[k] = canonicalizeValue(obj[k]);
  }
  return sorted;
}

/**
 * Canonicalize for hashing - keys sorted, deterministic JSON.
 */
export function canonicalize(input: unknown): string {
  if (input === null || input === undefined) return "null";
  if (typeof input === "string") return JSON.stringify(input);
  if (typeof input === "number" || typeof input === "boolean")
    return JSON.stringify(input);
  if (Array.isArray(input)) {
    return JSON.stringify(input.map((x) => canonicalizeValue(x)));
  }
  if (typeof input === "object") {
    return JSON.stringify(canonicalizeObject(input as Record<string, unknown>));
  }
  return "null";
}
