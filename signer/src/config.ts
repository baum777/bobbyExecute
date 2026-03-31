import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { z } from "zod";
import { SignerServiceError } from "./contracts.js";

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    SIGNER_AUTH_TOKEN: z.string().min(1),
    SIGNER_WALLET_PRIVATE_KEY: z.string().min(1),
    SIGNER_WALLET_ADDRESS: z.string().min(1),
    SIGNER_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    SIGNER_HOST: z.string().min(1).default("0.0.0.0"),
    SIGNER_KEY_ID: z.string().min(1).optional(),
  })
  .strict();

export interface SignerConfig {
  nodeEnv: "development" | "test" | "production";
  authToken: string;
  walletAddress: string;
  walletSecretKey: Uint8Array;
  port: number;
  host: string;
  keyId?: string;
}

function decodePrivateKey(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new SignerServiceError(
        "SIGNER_REQUEST_INVALID",
        "SIGNER_WALLET_PRIVATE_KEY must be valid JSON when using array format.",
        500,
        error
      );
    }

    if (!Array.isArray(parsed) || parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
      throw new SignerServiceError(
        "SIGNER_REQUEST_INVALID",
        "SIGNER_WALLET_PRIVATE_KEY JSON array must contain byte values.",
        500
      );
    }

    return Uint8Array.from(parsed as number[]);
  }

  try {
    return bs58.decode(trimmed);
  } catch (error) {
    throw new SignerServiceError(
      "SIGNER_REQUEST_INVALID",
      "SIGNER_WALLET_PRIVATE_KEY must be a base58 secret key or JSON byte array.",
      500,
      error
    );
  }
}

export function loadSignerConfig(env = process.env): SignerConfig {
  const parsed = EnvSchema.safeParse({
    NODE_ENV: env.NODE_ENV,
    SIGNER_AUTH_TOKEN: env.SIGNER_AUTH_TOKEN,
    SIGNER_WALLET_PRIVATE_KEY: env.SIGNER_WALLET_PRIVATE_KEY,
    SIGNER_WALLET_ADDRESS: env.SIGNER_WALLET_ADDRESS,
    SIGNER_PORT: env.SIGNER_PORT,
    SIGNER_HOST: env.SIGNER_HOST,
    SIGNER_KEY_ID: env.SIGNER_KEY_ID,
  });
  if (!parsed.success) {
    throw new SignerServiceError(
      "SIGNER_REQUEST_INVALID",
      `Invalid signer environment: ${parsed.error.message}`,
      500,
      parsed.error
    );
  }

  const walletSecretKey = decodePrivateKey(parsed.data.SIGNER_WALLET_PRIVATE_KEY);
  const keypair = Keypair.fromSecretKey(walletSecretKey);
  const walletAddress = new PublicKey(parsed.data.SIGNER_WALLET_ADDRESS).toBase58();
  const derivedAddress = keypair.publicKey.toBase58();

  if (derivedAddress !== walletAddress) {
    throw new SignerServiceError(
      "SIGNER_WALLET_MISMATCH",
      "SIGNER_WALLET_ADDRESS did not match the configured private key.",
      409
    );
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    authToken: parsed.data.SIGNER_AUTH_TOKEN,
    walletAddress,
    walletSecretKey,
    port: parsed.data.SIGNER_PORT,
    host: parsed.data.SIGNER_HOST,
    keyId: parsed.data.SIGNER_KEY_ID,
  };
}
