export interface MoralisAdapter {
  enabled: boolean;
  fetchTokenData(contractAddress: string): Promise<{ ok: boolean; data: null; source: string }>;
}

export function createMoralisAdapter(): MoralisAdapter {
  return {
    enabled: false,
    async fetchTokenData(_contractAddress: string) {
      return { ok: false, data: null, source: "moralis" };
    },
  };
}
