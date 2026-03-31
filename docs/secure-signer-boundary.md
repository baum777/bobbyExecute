# Secure Signer Boundary

## What changed

BobbyExecute no longer expects a raw production wallet private key in normal bot/runtime environment variables. Live trading now goes through a signer boundary:

- `WALLET_ADDRESS` stays in bot/runtime config as the public wallet identity.
- The bot constructs a transaction and sends it to a signer client.
- The signer service returns a signed transaction payload.
- The bot verifies the signed payload matches the expected wallet address before submission.

The minimal signer service now lives in `signer/` as a standalone Node/TypeScript subproject. The bot/runtime side only knows the public identity and the remote signer endpoint.

Local run instructions and the service-specific env model live in [`signer/README.md`](../signer/README.md).

## Environment variables

- `SIGNER_MODE`
  - `disabled`: paper/dry-run only
  - `remote`: use a server-to-server signer service
- `SIGNER_URL`
  - HTTPS endpoint for the signer service
- `SIGNER_AUTH_TOKEN`
  - bearer token used only from bot to signer
- `SIGNER_KEY_ID`
  - optional key identifier for multi-key signer backends
- `SIGNER_TIMEOUT_MS`
  - request timeout for signer calls

## Render wiring

For live trading, keep the bot/runtime service focused on orchestration and set:

- `LIVE_TRADING=true`
- `SIGNER_MODE=remote`
- `SIGNER_URL=<external signer endpoint>`
- `SIGNER_AUTH_TOKEN=<signer-only secret>`
- `WALLET_ADDRESS=<public wallet>`

Do not store the raw wallet private key in the bot or dashboard Render env vars. That secret belongs only in the signer service or in a dedicated KMS-backed signing system.

## Runtime behavior

- Paper and dry-run continue to work with `SIGNER_MODE=disabled`.
- Live startup fails closed if signer config is missing or incomplete.
- Remote signer failures, malformed responses, timeouts, and wallet mismatches all fail closed.

## Intentionally not implemented

- KMS integration
- Multi-signer routing or quorum logic
- Transaction message mutation by the signer

The signer service is intentionally minimal and can later be replaced with a KMS/HSM-backed backend without changing the bot runtime surface.
