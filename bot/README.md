# Onchain Trading Bot

Production-grade Onchain Trading Bot Architecture transplanting patterns from [OrchestrAI_Labs](https://github.com/baum777/OrchestrAI_Labs).

## Stack

- **TypeScript** (Node 22+)
- **Zod** for schemas
- **Pino** for JSON logging
- **Vitest** for tests

## Adapters

- **DexPaprika** – DEX pricing, pools, liquidity
- **Moralis** – wallet portfolio, token balances
- **RPC Verify** – truth layer (token/balance/receipt checks)

## Architecture

```
Ingest → Research → Signal → Risk → Execute → Verify → Journal → Monitor
```

### Tool Layering (Hard Rule)

All actions route through `ToolRouter`:
- `market.dexPaprika.*` → market.read / market.trending
- `wallet.moralis.*` → wallet.read
- `chain.rpcVerify.*` → chain.verify
- `trade.dex.*` → trade.quote / trade.execute

### Governance (Fail-Closed)

- Permission enforcement
- Review gates with commit tokens
- Circuit breaker for adapters
- Guardrails (slippage, allowlist/denylist)

### Determinism

- Clock abstraction (`FakeClock` for tests)
- Canonicalization + SHA-256 hashing
- Golden task fixtures for replay

## Commands

```bash
npm install
npm run build
npm test
npm run test:golden
npm run premerge
```

## Config

- `src/config/guardrails.yaml` – risk limits, allowlist/denylist
- `src/config/permissions.yaml` – tool–permission mapping
- `src/config/agents.yaml` – agent profiles
