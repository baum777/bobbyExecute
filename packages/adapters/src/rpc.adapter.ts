export interface RpcAdapterConfig {
  enableRpcVerify: boolean;
}

export interface RpcVerifyResult {
  ok: boolean;
  reason?: string;
}

export interface RpcAdapter {
  verifyMintExists(contract_address: string): Promise<RpcVerifyResult>;
}

export class RpcAdapterStub implements RpcAdapter {
  constructor(private readonly config: RpcAdapterConfig = { enableRpcVerify: false }) {}

  async verifyMintExists(contract_address: string): Promise<RpcVerifyResult> {
    if (!this.config.enableRpcVerify) {
      return { ok: true, reason: "rpc_verify_disabled" };
    }
    if (contract_address.trim().length === 0) {
      return { ok: false, reason: "empty_contract_address" };
    }
    return { ok: true };
  }
}
