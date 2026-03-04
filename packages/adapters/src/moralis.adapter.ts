export interface MoralisAdapter {
  enabled: boolean;
}

export function createMoralisAdapter(): MoralisAdapter {
  return { enabled: false };
}
