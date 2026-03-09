# BobbyExecution Benutzerhandbuch

## Einsteigerleitfaden für den Solana Meme Trading Bot

------------------------------------------------------------------------

## 1. Einführung

BobbyExecution ist ein automatisierter Trading‑Bot zum Handel von
**Solana Tokens (insbesondere Meme Tokens)** mit starkem Fokus auf
Sicherheit.

Dieses Handbuch erklärt:

-   wie der Bot funktioniert
-   wie man ihn konfiguriert
-   wie man sicher mit Live‑Trading beginnt
-   wie man den Bot überwacht
-   welche Fehler man vermeiden sollte

------------------------------------------------------------------------

## 2. Sicherheitshinweis

Automatisierter Handel birgt Risiken.

Beginne immer mit **sehr kleinen Beträgen**.

Empfohlenes Startkapital:

20--50 USD.

Verwende **niemals deine Hauptwallet für Tests**.

------------------------------------------------------------------------

## 3. Entscheidungs‑Pipeline

Der Bot führt mehrere Prüfungen durch:

1.  Marktdaten laden
2.  Datenqualität prüfen
3.  Token bewerten
4.  Signal generieren
5.  Risikoanalyse
6.  Manipulationsprüfung
7.  Ausführung
8.  On‑Chain‑Verifikation
9.  Journal‑Logging

Schlägt eine Stufe fehl → **kein Trade**.

------------------------------------------------------------------------

## 4. Betriebsmodi

### Dry Run

Simulation ohne echte Trades.

### Paper Mode

Echte Marktdaten, aber keine Transaktionen.

### Live Mode

Echte Trades werden ausgeführt.

Nur nach erfolgreichen Tests verwenden.

------------------------------------------------------------------------

## 5. Wallet Einrichtung

### Schritt 1 --- Testwallet erstellen

Empfohlene Wallets:

-   Phantom
-   Solflare
-   Backpack

Überweise nur **kleine Beträge**.

Empfohlen:

20--50 USD.

### Schritt 2 --- Wallet Adresse kopieren

Beispiel:

4Nd1mWExampleWalletAddress

### Schritt 3 --- In Config eintragen

Beispiel `.env`:

WALLET_ADDRESS=DeineWalletAdresse WALLET_PRIVATE_KEY=DeinPrivateKey

Private Keys niemals öffentlich teilen.

------------------------------------------------------------------------

## 6. Wichtige Parameter

EXECUTION_MODE=dry_run \| paper \| live

LIVE_TRADING_ENABLED=false

RPC_PROVIDER_MODE=real

GLOBAL_MAX_CAPITAL_USD=50

MAX_TRADE_USD=5

MAX_TRADES_PER_DAY=1

MAX_DAILY_LOSS_USD=10

MAX_SLIPPAGE_PERCENT=3

MIN_POOL_LIQUIDITY_USD=50000

MIN_TOKEN_AGE_HOURS=24

DATA_QUALITY_THRESHOLD=0.8

CHAOS_MIN_PASS_RATE=0.98

------------------------------------------------------------------------

## 7. Nur Solana Meme Tokens handeln

Beispiel:

CHAIN=solana TOKEN_UNIVERSE=solana_meme ALLOW_MEME_TOKENS_ONLY=true

------------------------------------------------------------------------

## 8. Start‑Workflow

1.  Dry Run starten
2.  Logs prüfen
3.  Paper Mode mehrere Tage laufen lassen
4.  Micro Live Trading aktivieren

------------------------------------------------------------------------

## 9. Monitoring‑Metriken

Wichtige Kennzahlen:

-   Signal → Execution Rate
-   Risk Block Rate
-   Chaos Fail Rate
-   Data Quality Score
-   Adapter Success Rate
-   Adapter Latency
-   Execution Success Rate
-   Verification Success Rate
-   Realized PnL
-   Duplicate Incident Count

------------------------------------------------------------------------

## 10. Tägliche Checkliste

Vor Start:

-   System Health prüfen
-   Config prüfen
-   Wallet prüfen

Während Betrieb:

-   Logs beobachten
-   Metriken beobachten

Nach Betrieb:

-   Journal prüfen
-   Trades prüfen

------------------------------------------------------------------------

## 11. Sichere Startwerte

GLOBAL_MAX_CAPITAL_USD=25 MAX_TRADE_USD=3 MAX_TRADES_PER_DAY=1
MAX_DAILY_LOSS_USD=5

------------------------------------------------------------------------

## 12. Skalierung

Tag 1--3: Paper Mode

Tag 4--7: kleine Trades

Woche 2+: langsam erhöhen

------------------------------------------------------------------------

## 13. Wichtigster Rat

Der Fokus sollte auf **stabilem Betrieb** liegen, nicht auf schnellem
Gewinn.

Langsam starten. Genau überwachen. Schrittweise skalieren.
