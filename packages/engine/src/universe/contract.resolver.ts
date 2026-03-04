import type { AdapterPairV1 } from "@reducedmode/contracts";

const SOLANA_CA_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function resolveContractAddress(pair: AdapterPairV1): string | null {
  if (isValidContractAddress(pair.contract_address)) {
    return pair.contract_address;
  }

  const raw = pair.raw;
  if (!raw || typeof raw !== "object") return null;

  const candidates = [
    getString(raw, "contractAddress"),
    getString(raw, "baseTokenAddress"),
    getNestedString(raw, "baseToken", "address"),
    getNestedString(raw, "token", "address"),
  ];

  for (const candidate of candidates) {
    if (isValidContractAddress(candidate)) return candidate;
  }

  return null;
}

function isValidContractAddress(value: string | null | undefined): value is string {
  if (!value || value.trim().length === 0) return false;
  return SOLANA_CA_PATTERN.test(value) || value.length >= 12;
}

function getString(input: unknown, key: string): string | null {
  if (!input || typeof input !== "object") return null;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function getNestedString(input: unknown, parentKey: string, childKey: string): string | null {
  if (!input || typeof input !== "object") return null;
  const parent = (input as Record<string, unknown>)[parentKey];
  if (!parent || typeof parent !== "object") return null;
  const value = (parent as Record<string, unknown>)[childKey];
  return typeof value === "string" ? value : null;
}
