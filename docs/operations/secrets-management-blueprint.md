<!--
  Version: 1.0.0
  Owner: Kimi Swarm
  Layer: operations
  Last Updated: 2026-03-04T00:25:00Z
  DoD: Vault-only Secrets-Management inkl. TTL, Rotation und Fail-Closed spezifiziert
-->

# Secrets Management Blueprint

## Prinzipien

- Keine `.env` Secrets
- Keine statischen Schlüssel im Repo
- Secrets nur via `trading.secrets_vault`

## Vault-Modell

- Backend: HashiCorp Vault
- Dynamic Secrets
- Lease-basiert, TTL <= 3600 Sekunden
- Optional renewbar, aber niemals unbegrenzt

## Skill-Verantwortung

### `trading.secrets_vault`

- Input: `SecretRequest`
- Output: `SecretLease`
- Muss Fail-Closed sein (kein Fallback auf lokale Secrets)

### `trading.focused_tx_execute`

- Nutzung nur mit gültigem Lease
- Lease-Validierung (TTL, Ablaufzeit)
- Keine Persistierung von Secret-Werten in Logs

## Sicherheitsregeln

- Secret-Rotation ist Approval-Trigger
- Permission-Escalation wird in Chaos-Suite getestet
- Bei Vault-Fehlern sofortige Escalation
