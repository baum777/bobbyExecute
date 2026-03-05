export interface RpcVerifyResult {
  ok: boolean;
  passed: boolean;
  reason?: string;
}

export interface RpcAdapter {
  enabled: boolean;
  verifyToken(contractAddress: string): Promise<RpcVerifyResult>;
}

export function createRpcAdapter(): RpcAdapter {
  return {
    enabled: false,
    async verifyToken(_contractAddress: string): Promise<RpcVerifyResult> {
      return { ok: true, passed: true, reason: "rpc_verify_disabled" };
    },
  };
}
