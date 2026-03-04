export interface MoralisAdapterConfig {
  enableMoralis: boolean;
}

export interface MoralisTokenSignal {
  contract_address: string;
  holder_count?: number;
  whale_ratio?: number;
}

export interface MoralisAdapter {
  fetchTokenSignals(contractAddresses: string[]): Promise<MoralisTokenSignal[]>;
}

export class MoralisAdapterStub implements MoralisAdapter {
  constructor(private readonly config: MoralisAdapterConfig = { enableMoralis: false }) {}

  async fetchTokenSignals(contractAddresses: string[]): Promise<MoralisTokenSignal[]> {
    if (!this.config.enableMoralis) return [];
    return contractAddresses.map((contractAddress) => ({
      contract_address: contractAddress,
      holder_count: 0,
      whale_ratio: 0,
    }));
  }
}
