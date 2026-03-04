# memory.log_append

<!-- Version: 1.0.0 | Owner: Kimi Swarm | Layer: memory | Last Updated: 2026-03-04 | DoD: Skill Instructions vollständig -->

## Input

- **LogEntry**: traceId, timestamp (ISO-UTC), stage, decisionHash, resultHash, input, output

## Output

- **LogAck**: Acknowledgment mit seq-id und hash

## Prozess

1. LogEntry validieren (ISO-UTC timestamp)
2. Hash = SHA-256(canonicalize(LogEntry))
3. Append zu Memory-Log (append-only)
4. Rückgabe LogAck

## Side Effects

- Append-only Memory-Log

## Guardrails

- Nur Append, keine Modifikation
- SHA-256 Hash-Chain
- ISO-UTC Timestamps
