import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { SignerRequest, SignerResponse, SignerServiceError } from "./contracts.js";

export interface SignerBackend {
  sign(request: SignerRequest): Promise<SignerResponse>;
}

function decodeBase64Strict(value: string, fieldName: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new SignerServiceError(
      "SIGNER_REQUEST_INVALID",
      `Field '${fieldName}' must be valid base64.`,
      422
    );
  }

  return Buffer.from(value, "base64");
}

function assertTransactionMatchesWallet(tx: VersionedTransaction, walletAddress: string): void {
  const payer = tx.message.staticAccountKeys[0]?.toBase58();
  if (payer !== walletAddress) {
    throw new SignerServiceError(
      "SIGNER_WALLET_MISMATCH",
      "Transaction payer did not match the configured wallet address.",
      409
    );
  }
}

function signTransactionPayload(base64Payload: string, keypair: Keypair, walletAddress: string): string {
  const payload = decodeBase64Strict(base64Payload, "payload");
  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(payload);
  } catch (error) {
    throw new SignerServiceError(
      "SIGNER_REQUEST_INVALID",
      "Field 'payload' did not contain a valid serialized transaction.",
      422,
      error
    );
  }
  assertTransactionMatchesWallet(tx, walletAddress);
  tx.sign([keypair]);
  const serialized = tx.serialize();
  return Buffer.from(serialized).toString("base64");
}

export class LocalKeypairSignerBackend implements SignerBackend {
  constructor(
    private readonly config: {
      walletAddress: string;
      keypair: Keypair;
      keyId?: string;
    }
  ) {}

  async sign(request: SignerRequest): Promise<SignerResponse> {
    if (request.walletAddress !== this.config.walletAddress) {
      throw new SignerServiceError(
        "SIGNER_WALLET_MISMATCH",
        "Request walletAddress did not match the configured signer wallet.",
        409
      );
    }

    if (this.config.keyId && request.keyId && request.keyId !== this.config.keyId) {
      throw new SignerServiceError(
        "SIGNER_REQUEST_INVALID",
        "Request keyId did not match the configured signer keyId.",
        422
      );
    }

    const signedTransactions = request.transactions.map((item) => {
      if (item.kind !== "transaction") {
        throw new SignerServiceError(
          "SIGNER_UNSUPPORTED_REQUEST",
          `Unsupported payload kind '${item.kind}'. Only serialized transactions are supported.`,
          422
        );
      }

      return {
        id: item.id,
        kind: item.kind,
        encoding: item.encoding,
        signedPayload: signTransactionPayload(item.payload, this.config.keypair, this.config.walletAddress),
      };
    });

    return {
      walletAddress: this.config.walletAddress,
      keyId: this.config.keyId ?? request.keyId,
      signedTransactions,
    };
  }
}

export function createLocalKeypairSignerBackend(config: {
  walletAddress: string;
  walletSecretKey: Uint8Array;
  keyId?: string;
}): LocalKeypairSignerBackend {
  return new LocalKeypairSignerBackend({
    walletAddress: config.walletAddress,
    keypair: Keypair.fromSecretKey(config.walletSecretKey),
    keyId: config.keyId,
  });
}
