# trading.secrets_vault

<!-- Version: 1.0.0 | Owner: Kimi Swarm | Layer: trading | Last Updated: 2026-03-04 | DoD: Skill Instructions vollständig -->

## Beschreibung

HashiCorp Vault Integration für Dynamic Secrets. Short-TTL, Fail-Closed.

## Input

- **SecretRequest**: type (e.g. solana_private_key), path, ttlSeconds

## Output

- **SecretLease**: lease_id, secret, expiry, renewable

## Verhalten

- Dynamic Secrets: Kurze TTL, automatische Rotation
- Keine static secrets – ausschließlich Vault
- Fail-Closed bei Vault unreachable

## Side Effects

- Vault-API-Calls
- Secret-Lease-Aktivierung

## Guardrails

- Kein .env, keine hardcoded secrets
- Short-TTL erforderlich
- Tier 3: execute-with-approval
