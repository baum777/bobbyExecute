# Final Hardening and Production Gates

## 1. Vorbedingung
Dieses Dokument wird **erst nach erfolgreichem Paper Soak** relevant.

---

## 2. Pre-Live Must-Haves

### Security / Control
- Auth-Gate vor `/emergency-stop` und `/control/*`
- fail-closed Defaults bei fehlender Autorisierung
- klare Operator-/Read-Trennung

### Execution / Verification
- realer Live-Execution-Pfad ohne Stub-Leakage
- echte RPC-Verifikationskontinuität
- kein Live-Erfolg ohne echte Verifikation
- explizite Failure-Stages

### Persistence / Audit
- live-kritische Artefakte durable
- Review-/Verification-/Execution-Trail vollständig
- kritische Journal Writes sind mandatory

### Runtime / Safety
- Kill-Switch sofort wirksam
- paused/halted/live transitions korrekt
- repeated errors triggern saubere Incident-/Health-Signale

---

## 3. Produktions-Gates
Vor Freigabe für Micro-Live müssen alle Punkte erfüllt sein:

- [ ] Paper Soak bestanden
- [ ] Readiness Re-Audit bestanden
- [ ] Auth/Policy vor Control-Routen aktiv
- [ ] Live-Execution-Gates aktiv
- [ ] reale Verifikation aktiv
- [ ] vollständiger Audit-Trail vorhanden
- [ ] Operator-Runbook final
- [ ] Testwallet / Limits / Loss Caps gesetzt

---

## 4. Controlled Live Micro-Test Regeln
- separate Wallet
- minimales Kapital
- minimale Trade-Frequenz
- harte Daily-Loss- und Position-Limits
- Incident Review nach jedem echten Trade
- sofort stoppbar

---

## 5. Production Done Definition
„Production done“ heißt hier **nicht** „groß skaliert live“, sondern:

- technisch und operativ abgeschlossen
- testbar, reviewbar, auditierbar
- kontrolliert micro-live-fähig
- ohne bekannte kritische Governance-/Safety-Lücke
