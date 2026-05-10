# MSPR-Spec

scope: risk-escalation-packets
authority: canonical-for-mspr-structure
version: 1

## Trigger

- authority_unclear
- source_conflict
- canonicalization_without_review
- side_effect_risk
- missing_validation
- policy_conflict

## Packet-Format

```yaml
id: mspr-YYYYMMDD-<slug>
created_at: YYYY-MM-DD
status: open|reviewed|resolved|blocked
severity: low|medium|high|critical
trigger: authority_unclear|source_conflict|canonicalization_without_review|side_effect_risk|missing_validation|policy_conflict
scope:
  paths: []
observed: []
inferred: []
open_questions: []
risks: []
required_review: true
review_owner: unassigned
```
