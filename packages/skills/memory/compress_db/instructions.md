# memory.compress_db

<!-- Version: 1.0.0 | Owner: Kimi Swarm | Layer: memory | Last Updated: 2026-03-04 | DoD: Skill Instructions vollständig -->

## Input

- **MemorySnapshot**: Aktueller Memory-DB State (renewed)

## Output

- **CompressedJournalEntry**: Snappy-komprimiert, mit SHA-256 Chain-Eintrag

## Prozess

1. canonicalize(MemorySnapshot)
2. hash = SHA-256(canonicalized)
3. compressed = Snappy(MemorySnapshot)
4. Append zu Journal mit hash
5. Snapshot für Crash-Recovery wenn nötig

## Side Effects

- Append-only Journal
- Optional Snapshot-Write

## Guardrails

- Keine Löschung, nur Append
- Hash-Chain wird gepflegt
