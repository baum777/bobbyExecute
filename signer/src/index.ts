import { createSignerServer } from "./server.js";
import { createLocalKeypairSignerBackend } from "./backend.js";
import { loadSignerConfig } from "./config.js";
import { SignerServiceError } from "./contracts.js";

function shutdown(server: ReturnType<typeof createSignerServer>): void {
  void new Promise<void>((resolve) => server.close(() => resolve()));
}

async function main(): Promise<void> {
  const config = loadSignerConfig();
  const backend = createLocalKeypairSignerBackend({
    walletAddress: config.walletAddress,
    walletSecretKey: config.walletSecretKey,
    keyId: config.keyId,
  });
  const server = createSignerServer({ authToken: config.authToken }, backend);

  server.listen(config.port, config.host, () => {
    console.info(
      `[signer] listening on http://${config.host}:${config.port} wallet=${config.walletAddress} keyId=${config.keyId ?? "<none>"}`
    );
  });

  const handleSignal = (signal: NodeJS.Signals): void => {
    console.info(`[signer] received ${signal}, shutting down`);
    shutdown(server);
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
}

void main().catch((error: unknown) => {
  if (error instanceof SignerServiceError) {
    console.error(`[signer] startup failed: ${error.code}: ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`[signer] startup failed: ${error.message}`);
  } else {
    console.error("[signer] startup failed: unknown error");
  }
  process.exitCode = 1;
});
