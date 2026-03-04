# intelligence.reasoning

<!-- Version: 1.0.0 | Owner: Kimi Swarm | Layer: intelligence | Last Updated: 2026-03-04 | DoD: Skill Instructions vollständig -->

## Input

- **ScoreCard**: MCI/BCI/Hybrid Scores
- **PatternResult[]**: Output von reasoning.pattern_recognizer (8 Patterns)

## Output

- **DecisionResult**: Finale Entscheidung (buy/sell/hold) + Evidence + Hash

## Integration

- Ruft reasoning.pattern_recognizer auf
- Kombiniert ScoreCard + Patterns zu evidenzbasierter Decision
- Jede Decision hat Hash für Audit-Chain

## Side Effects

Keine. Deterministisch.

## Guardrails

- Evidence-basiert
- Keine Entscheidung ohne Hash
