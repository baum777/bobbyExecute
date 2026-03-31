import { afterEach, describe, expect, it } from "vitest";
import { AddressInfo } from "node:net";
import { Keypair, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { createLocalKeypairSignerBackend } from "../src/backend.js";
import { createSignerServer } from "../src/server.js";
import { loadSignerConfig } from "../src/config.js";
import { SignerResponseSchema } from "../src/contracts.js";

function makeTransactionBase64(payerBase58: string): string {
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: new PublicKey(payerBase58),
      recentBlockhash: "11111111111111111111111111111111",
      instructions: [],
    }).compileToV0Message()
  );
  return Buffer.from(tx.serialize()).toString("base64");
}

async function startTestServer(authToken: string, backend: ReturnType<typeof makeDefaultBackend>["backend"]) {
  const server = createSignerServer({ authToken }, backend);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("server failed to bind");
  }
  const url = `http://127.0.0.1:${(address as AddressInfo).port}/sign`;
  return {
    url,
    server,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function makeDefaultBackend() {
  const keypair = Keypair.generate();
  const walletAddress = keypair.publicKey.toBase58();
  return {
    backend: createLocalKeypairSignerBackend({
      walletAddress,
      walletSecretKey: keypair.secretKey,
      keyId: "key-1",
    }),
    walletAddress,
    keypair,
  };
}

describe("remote signer service", () => {
  afterEach(() => {
    delete process.env.SIGNER_AUTH_TOKEN;
    delete process.env.SIGNER_WALLET_PRIVATE_KEY;
    delete process.env.SIGNER_WALLET_ADDRESS;
    delete process.env.SIGNER_PORT;
    delete process.env.SIGNER_HOST;
    delete process.env.SIGNER_KEY_ID;
    delete process.env.NODE_ENV;
  });

  it("boots from validated config", () => {
    const keypair = Keypair.generate();
    process.env.SIGNER_AUTH_TOKEN = "shared-token";
    process.env.SIGNER_WALLET_PRIVATE_KEY = JSON.stringify(Array.from(keypair.secretKey));
    process.env.SIGNER_WALLET_ADDRESS = keypair.publicKey.toBase58();
    process.env.SIGNER_PORT = "8787";
    process.env.SIGNER_HOST = "127.0.0.1";
    process.env.SIGNER_KEY_ID = "key-1";

    const config = loadSignerConfig();
    expect(config.walletAddress).toBe(keypair.publicKey.toBase58());
    expect(config.keyId).toBe("key-1");
    expect(config.port).toBe(8787);
  });

  it("rejects missing auth", async () => {
    const { backend, walletAddress } = makeDefaultBackend();
    const { url, stop } = await startTestServer("shared-token", backend);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "live_swap",
          walletAddress,
          transactions: [],
        }),
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: { code: "SIGNER_INVALID_AUTH" },
      });
    } finally {
      await stop();
    }
  });

  it("rejects invalid auth", async () => {
    const { backend, walletAddress } = makeDefaultBackend();
    const { url, stop } = await startTestServer("shared-token", backend);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-token",
        },
        body: JSON.stringify({
          purpose: "live_swap",
          walletAddress,
          transactions: [],
        }),
      });
      expect(response.status).toBe(401);
    } finally {
      await stop();
    }
  });

  it("signs a valid request and returns the expected response shape", async () => {
    const { backend, walletAddress } = makeDefaultBackend();
    const { url, stop } = await startTestServer("shared-token", backend);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer shared-token",
        },
        body: JSON.stringify({
          purpose: "live_swap",
          walletAddress,
          keyId: "key-1",
          transactions: [
            {
              id: "swap-transaction",
              kind: "transaction",
              encoding: "base64",
              payload: makeTransactionBase64(walletAddress),
            },
          ],
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(SignerResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toMatchObject({
        walletAddress,
        keyId: "key-1",
        signedTransactions: [
          {
            id: "swap-transaction",
            kind: "transaction",
            encoding: "base64",
          },
        ],
      });

      const signedTx = VersionedTransaction.deserialize(Buffer.from(body.signedTransactions[0].signedPayload, "base64"));
      expect(signedTx.message.staticAccountKeys[0]?.toBase58()).toBe(walletAddress);
    } finally {
      await stop();
    }
  });

  it("rejects malformed requests", async () => {
    const { backend } = makeDefaultBackend();
    const { url, stop } = await startTestServer("shared-token", backend);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer shared-token",
        },
        body: JSON.stringify({
          purpose: "live_swap",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("SIGNER_REQUEST_INVALID");
    } finally {
      await stop();
    }
  });

  it("rejects invalid transaction payloads", async () => {
    const { backend, walletAddress } = makeDefaultBackend();
    const { url, stop } = await startTestServer("shared-token", backend);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer shared-token",
        },
        body: JSON.stringify({
          purpose: "live_swap",
          walletAddress,
          transactions: [
            {
              id: "swap-transaction",
              kind: "transaction",
              encoding: "base64",
              payload: "not-base64",
            },
          ],
        }),
      });

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.error.code).toBe("SIGNER_REQUEST_INVALID");
    } finally {
      await stop();
    }
  });

  it("rejects wallet mismatches", async () => {
    const { backend, walletAddress } = makeDefaultBackend();
    const { url, stop } = await startTestServer("shared-token", backend);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer shared-token",
        },
        body: JSON.stringify({
          purpose: "live_swap",
          walletAddress: "11111111111111111111111111111111",
          transactions: [
            {
              id: "swap-transaction",
              kind: "transaction",
              encoding: "base64",
              payload: makeTransactionBase64(walletAddress),
            },
          ],
        }),
      });

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe("SIGNER_WALLET_MISMATCH");
    } finally {
      await stop();
    }
  });

  it("accepts the same bot-side request shape the remote client sends", async () => {
    const { backend, walletAddress } = makeDefaultBackend();
    const { url, stop } = await startTestServer("shared-token", backend);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer shared-token",
        },
        body: JSON.stringify({
          purpose: "live_swap",
          walletAddress,
          keyId: "key-1",
          transactions: [
            {
              id: "swap-transaction",
              kind: "transaction",
              encoding: "base64",
              payload: makeTransactionBase64(walletAddress),
            },
          ],
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(SignerResponseSchema.parse(body).signedTransactions[0]?.id).toBe("swap-transaction");
    } finally {
      await stop();
    }
  });
});
