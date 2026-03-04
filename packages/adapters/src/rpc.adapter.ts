export interface RpcVerifyResult {
  ok: boolean;
  reason?: string;
}

export interface RpcAdapter {
  enabled: boolean;
  verifyMintExists(contractAddress: string): Promise<RpcVerifyResult>;
}

export function createRpcAdapter(): RpcAdapter {
  return {
    enabled: false,
    async verifyMintExists(_contractAddress: string): Promise<RpcVerifyResult> {
      return { ok: true };
    },
  };
}
