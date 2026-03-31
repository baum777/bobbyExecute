# BobbyExecute Remote Signer

This subproject provides the minimal remote signing boundary for BobbyExecute live trading.

The bot/runtime service keeps only the public wallet identity and calls this signer over HTTP.
The signer service holds the private key locally for now, which makes it the only place in this
repo that should ever see raw signing material.

## What it does

- Accepts authenticated server-to-server signing requests.
- Validates the bot request schema strictly.
- Signs one or more serialized Solana transactions.
- Returns signed payloads in the same request order.
- Verifies the configured wallet address matches the signing key before it starts.

## Environment

See [.env.example](./.env.example).

Required:

- `SIGNER_AUTH_TOKEN`
- `SIGNER_WALLET_PRIVATE_KEY`
- `SIGNER_WALLET_ADDRESS`

Optional:

- `NODE_ENV`
- `SIGNER_PORT`
- `SIGNER_HOST`
- `SIGNER_KEY_ID`

## Local run

```bash
cd signer
npm install
npm run build
npm start
```

For development/testing:

```bash
cd signer
npm install
npm test
```

The signer exposes:

- `GET /health`
- `POST /sign`

The bot/runtime should point `SIGNER_URL` at the `/sign` endpoint, for example:

```env
SIGNER_MODE=remote
SIGNER_URL=http://127.0.0.1:8787/sign
SIGNER_AUTH_TOKEN=shared-token
SIGNER_KEY_ID=optional-key-id
```

## Production posture

This is a stepping stone, not the final hardening layer.

Recommended next steps for serious production use:

- Move the signing backend behind KMS/HSM or a private signing service network.
- Restrict network access so only bot/runtime can reach the signer.
- Rotate the bearer token independently from bot operator credentials.
- Keep wallet custody and operational controls out of general app env vars.

The service is intentionally small so the backend can be replaced later without changing the bot
protocol.
