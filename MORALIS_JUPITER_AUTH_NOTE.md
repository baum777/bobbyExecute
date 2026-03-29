# Moralis / Jupiter Auth Note

- Set `MORALIS_API_KEY` in Render service env vars for live deployments, or in local `.env` for private testing.
- Set `JUPITER_API_KEY` in Render service env vars for live deployments, or in local `.env` for private testing.
- `MORALIS_API_KEY` is the Moralis Data API key used by `bot/src/adapters/moralis/client.ts` and sent as `X-Api-Key`.
- `JUPITER_API_KEY` is the Jupiter quote/swap API key used by `bot/src/adapters/dex-execution/quotes.ts` and `swap.ts`, sent as `x-api-key`.
- Local stub and dry flows do not require either key.
- Paper mode can still boot without either key unless you explicitly wire live adapter calls into it.
- Live mode now fails closed at startup if either key is missing, and the adapter helpers still fail request-time if they are called directly without a key.
