# trading.focused_tx_execute

<!-- Version: 1.0.0 | Owner: Kimi Swarm | Layer: trading | Last Updated: 2026-03-04 | DoD: Skill Instructions vollständig -->

## Input

- **TradeIntent**: tokenIn, tokenOut, amountIn, minAmountOut, slippagePercent
- **DecisionResult**: Finale Entscheidung + Evidence + Hash
- **SecretLease**: Von trading.secrets_vault

## Output

- **ExecutionReport**: success, txSignature, actualAmountOut, evidenceHash

## Prozess

1. SecretLease von secrets_vault holen
2. Slippage-Protection anwenden
3. Fokussierte TX ausführen (ein Swap pro Decision)
4. Evidence + Hash in Report

## Side Effects

- Onchain-Transaktion
- Secret-Nutzung

## Guardrails

- Secrets ausschließlich via trading.secrets_vault
- Evidence + Hash in Output
- Slippage-Protection obligatorisch
- Tier 3: execute-with-approval
