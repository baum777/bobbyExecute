import type { TokenSourceSnapshotV1 } from "@bobby/contracts";

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function resolveContractAddress(snapshot: TokenSourceSnapshotV1): string | null {
  const ca = snapshot.token_ref.contract_address;
  if (!ca || ca.trim() === "") return null;
  if (!SOLANA_ADDRESS_REGEX.test(ca)) return null;
  return ca;
}
