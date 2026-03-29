# BobbyExecution Environment Handbook

Stand: 2026-03-29

Dieses Handbuch erklärt die geposteten `.env`-Parameter von BobbyExecution, sagt dir, **welche Werte du selbst festlegst**, **welche du lokal erzeugst** und **welche du von externen Anbietern holen musst**.

---

## 1. Schnellüberblick: Welche Variablen sind wirklich kritisch?

### A. Reine Modus- und Sicherheitsflags
Diese Werte erzeugst du **nicht** extern. Du setzt sie selbst:

- `NODE_ENV`
- `LIVE_TRADING`
- `DRY_RUN`
- `TRADING_ENABLED`
- `RPC_MODE`
- `LIVE_TEST_MODE`
- `LIVE_TEST_MAX_CAPITAL_USD`
- `LIVE_TEST_MAX_TRADES_PER_DAY`
- `LIVE_TEST_MAX_DAILY_LOSS_USD`
- `REPLAY_MODE`
- `LOG_LEVEL`
- `REVIEW_POLICY_MODE`
- `PORT`
- `HOST`
- `NEXT_PUBLIC_USE_MOCK`
- `NEXT_PUBLIC_ENV`

### B. Lokale oder intern erzeugte Secrets
Diese Werte kommen **nicht** von einem externen API-Anbieter. Sie sollten von euch intern erzeugt und geheim gehalten werden:

- `CONTROL_TOKEN`
- `OPERATOR_READ_TOKEN` (kein aktueller Read-Route-HTTP-Auth-Token; live muss er nur getrennt von `CONTROL_TOKEN` bleiben)
- `DASHBOARD_SESSION_SECRET`
- `NOTIFY_WEBHOOK_*_TOKEN`
- `CONTROL_RESTART_ALERT_WEBHOOK_TOKEN`
- `RENDER_API_KEY` (nur für lokale Render-CLI-/Tooling-Workflows; kein Runtime-Secret)

Empfehlung: zufällige, lange Secrets verwenden (mindestens 32 zufällige Bytes / 64 Hex-Zeichen oder 43+ Base64-Zeichen).

### C. Externe API-Keys / Provider-Zugänge
Diese Werte bekommst du von Plattformen oder stecken in einer Provider-URL:

- `RPC_URL` → oft Helius oder Alchemy, API-Key meist **in der URL**
- `XAI_API_KEY`
- `OPENAI_API_KEY`
- `MORALIS_API_KEY`
- `JUPITER_API_KEY`

Für Live-Execution gilt inzwischen zusätzlich: Wenn `LIVE_TRADING=true`, schlägt der Bootvorgang fehl, sobald `MORALIS_API_KEY` oder `JUPITER_API_KEY` fehlt. Die Adapter bleiben trotzdem request-time abgesichert, falls sie direkt aufgerufen werden.

### D. Manuell aus bestehenden Systemen übernehmen
Diese Werte erzeugt BobbyExecution nicht selbst:

- `WALLET_ADDRESS`
- `BOT_KPI_URL`
- `NEXT_PUBLIC_API_URL`
- `NOTIFY_WEBHOOK_*_URL`
- `CONTROL_RESTART_ALERT_WEBHOOK_URL`
- `DASHBOARD_OPERATOR_DIRECTORY_JSON`

---

## 2. Wichtigste Audit-Findings zu deiner geposteten Env

### 2.1 Solana Public RPC ist okay für Tests, aber nicht für Produktion
Der öffentliche Solana-RPC ist laut offizieller Solana-Doku **nicht für Produktionsanwendungen gedacht**; er ist rate-limited und kann ohne Vorwarnung blockiert werden. Für echte Live-Trades sollte `RPC_URL` auf einen dedizierten Provider wie Helius oder Alchemy zeigen.  
Quelle: https://solana.com/docs/references/clusters

### 2.2 Moralis braucht laut offizieller Doku einen API-Key, im Template fehlt aber ein offensichtliches `MORALIS_API_KEY`
Die Moralis-Doku beschreibt den Zugriff über einen eigenen API-Key aus dem Dashboard. In deinem Template ist nur `MORALIS_BASE_URL` vorhanden. Das ist ein **Prüfpunkt**: Entweder nutzt der Code Moralis aktuell gar nicht, oder der Key wird anders injiziert.  
Quelle: https://docs.moralis.com/data-api/get-your-api-key

### 2.3 Jupiter verlangt heute typischerweise einen API-Key, im Template fehlt aber ein offensichtliches `JUPITER_API_KEY`
Die aktuelle Jupiter-Doku beschreibt das Setup über einen API-Key im Developer Portal. In deinem Template stehen nur die URLs. Das kann funktionieren, wenn euer Code bewusst einen älteren/anderen Pfad nutzt, sollte aber vor echtem Betrieb geprüft werden.  
Quelle: https://dev.jup.ag/portal/setup

### 2.4 Deine Jupiter-URLs zeigen auf `/swap/v1`, die aktuelle offizielle Overview zeigt `/swap/v2`
Das ist **nicht automatisch falsch** — es kann repo-bedingt bewusst auf eine ältere API zielen. Aber: **nicht blind aktualisieren**. Erst den Code prüfen, welche Request-Formate erwartet werden.  
Quelle: https://dev.jup.ag/docs/swap

### 2.5 `XAI_MODEL_PRIMARY=grok-beta` wirkt aus heutiger Sicht eher legacy
Die aktuelle xAI-Doku listet neuere Grok-Modelle wie Grok 4.20 und dokumentiert frühere `grok-beta`-Phasen in den Release Notes. Auch hier gilt: nur ändern, wenn der Code und das Antwortformat dazu passen.  
Quellen: https://docs.x.ai/developers/models, https://docs.x.ai/developers/release-notes

### 2.6 Es gibt bewusst **keinen** offensichtlichen `WALLET_PRIVATE_KEY` im Template
Das deutet darauf hin, dass der eigentliche Signer **nicht** über diese `.env` direkt injiziert werden soll, sondern über einen separaten Runtime-/Signer-Pfad. Das ist sicherheitstechnisch oft sinnvoll. Füge deshalb **nicht einfach** einen Private Key hinzu, nur weil er fehlt.

---

## 3. Minimal-Setups nach Einsatzmodus

## 3.1 Lokale Entwicklung / Stub
Geeignet für UI, API, Dry-Run, Tests ohne echte Chain-Interaktion.

Empfohlene Kernwerte:

```env
NODE_ENV=development
LIVE_TRADING=false
DRY_RUN=true
TRADING_ENABLED=false
RPC_MODE=stub
RPC_URL=https://api.mainnet-beta.solana.com
LIVE_TEST_MODE=false
LOG_LEVEL=info
PORT=3333
HOST=0.0.0.0
NEXT_PUBLIC_API_URL=http://localhost:3333
NEXT_PUBLIC_USE_MOCK=true
NEXT_PUBLIC_ENV=STUB
```

Zusätzlich sinnvoll:

- `CONTROL_TOKEN`
- `OPERATOR_READ_TOKEN`
- `DASHBOARD_SESSION_SECRET`

## 3.2 Paper / Real Data ohne echte Swaps
Geeignet für echte Datenpfade ohne echte Ausführung.

```env
LIVE_TRADING=false
DRY_RUN=true
TRADING_ENABLED=true
RPC_MODE=real
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
LIVE_TEST_MODE=false
```

Zusätzlich meist nötig:

- echte `WALLET_ADDRESS`
- `CONTROL_TOKEN`
- `OPERATOR_READ_TOKEN`
- falls LLM aktiv: `XAI_API_KEY` oder `OPENAI_API_KEY`

## 3.3 Live-Test mit kleiner Kapitalgrenze

```env
LIVE_TRADING=true
DRY_RUN=false
TRADING_ENABLED=true
RPC_MODE=real
LIVE_TEST_MODE=true
LIVE_TEST_MAX_CAPITAL_USD=100
LIVE_TEST_MAX_TRADES_PER_DAY=1
LIVE_TEST_MAX_DAILY_LOSS_USD=50
MAX_SLIPPAGE_PERCENT=5
REVIEW_POLICY_MODE=required
```

Zusätzlich:

- echte `WALLET_ADDRESS`
- dedizierter RPC-Provider
- Control-/Operator-Tokens
- Notification-Webhooks
- Dashboard-Session-Secret

## 3.4 Lokales Laden von `.env`

Die Bot-Entrypoints lesen `process.env` direkt. Sie laden `.env` nicht automatisch.

### macOS / Linux

```bash
set -a
. ./.env
set +a
cd bot && npm run premerge
```

### Windows PowerShell

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
    $name = $matches[1]
    $value = $matches[2].Trim().Trim('"')
    if ($name -notmatch '^#') {
      [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
  }
}
cd bot
npm run premerge
```

Für Codex App Sessions gilt das Gleiche: Starte die Session aus derselben Shell, nachdem die Variablen geladen wurden, damit die Session sie erbt.

---

## 4. Parameter-Referenz

## 4.1 Core Runtime

| Variable | Bedeutung | Wer setzt das? | Pflicht? | Beispiel / Hinweis |
|---|---|---:|---:|---|
| `NODE_ENV` | Node-Laufzeitmodus | du selbst | ja | `development`, `test`, `production` |
| `LOG_LEVEL` | Logging-Tiefe | du selbst | sinnvoll | `debug`, `info`, `warn`, `error` |
| `PORT` | HTTP-Port | du selbst / Hosting | ja | lokal meist `3333` |
| `HOST` | Bind-Adresse | du selbst / Hosting | ja | meist `0.0.0.0` |
| `JOURNAL_PATH` | Pfad für Journal/Audit-Log | du selbst | ja | z. B. `data/journal.jsonl` |

## 4.2 Trading-Sicherheitsflags

| Variable | Bedeutung | Wer setzt das? | Pflicht? | Empfehlung |
|---|---|---:|---:|---|
| `LIVE_TRADING` | schaltet Live-Execution grundsätzlich frei | du selbst | ja | in Dev meist `false` |
| `DRY_RUN` | erzwingt simulierte Trades | du selbst | ja | in Dev meist `true` |
| `TRADING_ENABLED` | globaler Feature-Flag für Trading-Modul | du selbst | ja | `false` in Dev, `true` in Paper/Live |
| `RPC_MODE` | verwendet Stub oder echte Solana RPC | du selbst | ja | `stub` in Dev, `real` für echte Daten |
| `LIVE_TEST_MODE` | aktiviert Live-Test-Limits | du selbst | optional | `true` nur für kontrollierte Micro-Live-Phase |
| `LIVE_TEST_MAX_CAPITAL_USD` | Maximalbetrag pro Trade im Live-Test | du selbst | bei `LIVE_TEST_MODE=true` | konservativ starten |
| `LIVE_TEST_MAX_TRADES_PER_DAY` | Tageslimit Trades im Live-Test | du selbst | bei `LIVE_TEST_MODE=true` | oft `1` |
| `LIVE_TEST_MAX_DAILY_LOSS_USD` | Tagesverlustlimit | du selbst | bei `LIVE_TEST_MODE=true` | klein halten |
| `MAX_SLIPPAGE_PERCENT` | maximal akzeptierte Slippage | du selbst | sehr wichtig | klein halten, z. B. `1-5` |
| `REVIEW_POLICY_MODE` | Freigabe-Policy vor Execution | du selbst | wichtig | `required` für Live nah an Produktion |

## 4.3 RPC / Chain

| Variable | Bedeutung | Wer setzt das? | Pflicht? | Woher? |
|---|---|---:|---:|---|
| `RPC_URL` | Solana RPC-Endpoint | externer Provider oder Solana public RPC | ja bei `RPC_MODE=real` | Solana public endpoint oder Helius/Alchemy Dashboard |
| `WALLET_ADDRESS` | öffentliche Solana Wallet-Adresse | aus deinem Wallet | ja für echte Wallet-bezogene Flows | Phantom / Backpack / Hardware-Wallet |

**Woher bekommst du `WALLET_ADDRESS`?**
- Phantom: Wallet öffnen → Account anklicken / Address kopieren
- Backpack: Wallet öffnen → öffentliche Adresse kopieren
- Hardware-Wallet: über die jeweilige Wallet-App die Receive-/Public-Adresse anzeigen

**Wichtig:** Eine Wallet-Adresse ist **nicht** geheim. Ein Private Key / Seed Phrase ist geheim und gehört **niemals** in Chat, Screenshots oder ein Repo.

## 4.4 Control / Security / Operator

| Variable | Bedeutung | Wer setzt das? | Pflicht? | Hinweis |
|---|---|---:|---:|---|
| `CONTROL_TOKEN` | Auth für mutierende Control-Routen | ihr intern | ja für Betrieb | langes zufälliges Secret |
| `OPERATOR_READ_TOKEN` | Reserviertes Read-Secret; kein aktueller Read-Route-HTTP-Auth-Token | ihr intern | live-boot-relevant | getrennt von `CONTROL_TOKEN` halten |
| `CONTROL_RESTART_ALERT_NOTIFICATION_COOLDOWN_MS` | Rate-Limit für Restart-Alerts | du selbst | optional | ms-Wert |
| `NOTIFY_ROUTING_POLICY_MODE` | Routing-Logik für Alerts | du selbst | optional | `default` oder repo-spezifische Modi |

**Secret-Erzeugungsempfehlung:**
- macOS/Linux: `openssl rand -hex 32`
- Windows PowerShell: `[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Maximum 256 }))`

## 4.5 Notification Webhooks

| Variable | Bedeutung | Wer setzt das? | Pflicht? | Woher? |
|---|---|---:|---:|---|
| `NOTIFY_WEBHOOK_PRIMARY_URL` | primärer Webhook-Endpunkt | aus Zielsystem | optional, aber empfohlen in Prod | Slack / Discord / eigener Webhook-Receiver |
| `NOTIFY_WEBHOOK_PRIMARY_TOKEN` | Auth-Token für primären Receiver | aus Zielsystem oder intern | optional | je nach Receiver |
| `NOTIFY_WEBHOOK_PRIMARY_HEADER` | Headername für Token | du selbst | optional | oft `authorization` |
| `NOTIFY_WEBHOOK_PRIMARY_ENABLED` | Ziel aktiv/inaktiv | du selbst | optional | `true` / `false` |
| `NOTIFY_PRIMARY_FORMAT` | Payload-Format | du selbst | optional | `generic` oder repo-spezifisch |
| `NOTIFY_PRIMARY_COOLDOWN_MS` | Cooldown | du selbst | optional | ms-Wert |
| `NOTIFY_PRIMARY_RECOVERY_ENABLED` | Recovery-Benachrichtigungen | du selbst | optional | `true` / `false` |
| `NOTIFY_PRIMARY_REPEATED_FAILURE_SUMMARY_ENABLED` | Sammelmeldung bei Wiederholungen | du selbst | optional | `true` / `false` |
| `NOTIFY_PRIMARY_ALLOW_WARNING` | Warnungen zulassen | du selbst | optional | `true` / `false` |
| `NOTIFY_PRIMARY_ENVIRONMENT_SCOPE` | Umfeld für dieses Ziel | du selbst | optional | z. B. `production` |
| `NOTIFY_PRIMARY_PRIORITY` | Priorität | du selbst | optional | kleinere Zahl = höher |
| `NOTIFY_PRIMARY_TAGS` | Tags | du selbst | optional | CSV |

Die gleichen Bedeutungen gelten analog für `SECONDARY` und `STAGING`.

**Woher bekommst du die Webhook-URL?**
- Slack: aus einer Slack-App / Incoming Webhook-Konfiguration
- Discord: aus Channel → Integrations → Webhooks
- Eigener Server: von eurem eigenen Alert-/Relay-Service

## 4.6 Dashboard / Legacy Bridge

| Variable | Bedeutung | Wer setzt das? | Pflicht? | Hinweis |
|---|---|---:|---:|---|
| `BOT_KPI_URL` | URL zum Bot-API-Server für KPI-Bridge | du selbst | nur falls Legacy-Dashboard genutzt wird | lokal oft `http://localhost:3333` |
| `NEXT_PUBLIC_API_URL` | Frontend-Ziel-URL zur Bot-API | du selbst | ja fürs Dashboard | muss zum API-Host passen |
| `NEXT_PUBLIC_USE_MOCK` | Frontend Mock-Daten statt echter API | du selbst | optional | `true` für rein lokale UI-Arbeit |
| `NEXT_PUBLIC_ENV` | UI-Label des Modus | du selbst | optional | `STUB`, `LIVE` etc. |

## 4.7 Dashboard Server Auth

| Variable | Bedeutung | Wer setzt das? | Pflicht? | Hinweis |
|---|---|---:|---:|---|
| `DASHBOARD_SESSION_SECRET` | Signiert Dashboard-Sessions | ihr intern | ja für Dashboard-Betrieb | langes zufälliges Secret |
| `DASHBOARD_OPERATOR_DIRECTORY_JSON` | eingebettete Operator-Userliste | ihr intern | ja falls dieser Pfad genutzt wird | JSON-Array mit Usern, Salts, Hashes |

**Was gehört in `DASHBOARD_OPERATOR_DIRECTORY_JSON`?**
Jeder Eintrag braucht laut Kommentar:
- `username`
- `displayName`
- `role`
- `passwordSalt`
- `passwordHash`

Das bedeutet: Die Passwörter selbst speicherst du **nicht** im Klartext, sondern als Salt + Hash.

## 4.8 LLM / Provider

| Variable | Bedeutung | Wer setzt das? | Pflicht? | Woher? |
|---|---|---:|---:|---|
| `LAUNCH_MODE` | Auswahl des LLM-Providers | du selbst | wichtig, wenn LLM aktiv | `xai`, `openai`, `openai_fallback` |
| `XAI_API_KEY` | API-Key für xAI | xAI Console | bei xAI-Modus | aus xAI Console → API Keys |
| `XAI_MODEL_PRIMARY` | xAI-Modellname | du selbst | optional | mit aktueller xAI Model-Liste abgleichen |
| `OPENAI_API_KEY` | API-Key für OpenAI oder kompatiblen Provider | OpenAI Platform / anderer Anbieter | bei OpenAI-Modus | aus Provider-Dashboard |
| `OPENAI_BASE_URL` | API-Basis für OpenAI-kompatible Endpoints | du selbst | optional | Default OpenAI, sonst z. B. Groq/Together |
| `OPENAI_MODEL` | Modellname | du selbst | optional | muss zum gewählten Endpoint passen |

## 4.9 Data Adapters

| Variable | Bedeutung | Wer setzt das? | Pflicht? | Woher? |
|---|---|---:|---:|---|
| `DEXPAPRIKA_BASE_URL` | Basis-URL für DexPaprika | meist fix | optional | Standard-API-URL |
| `MORALIS_BASE_URL` | Basis-URL für Moralis | meist fix | optional | Standard-URL |
| `MORALIS_API_KEY` | Moralis-Auth für Live-Execution | ihr intern / Moralis-Dashboard | live erforderlich | fehlt der Key, stoppt der Live-Boot |
| `JUPITER_QUOTE_URL` | Quote-Endpoint für Jupiter | meist fix / repo-spezifisch | optional | aktuelle Jupiter-Doku prüfen |
| `JUPITER_SWAP_URL` | Swap-Endpoint für Jupiter | meist fix / repo-spezifisch | optional | aktuelle Jupiter-Doku prüfen |
| `JUPITER_API_KEY` | Jupiter-Auth für Live-Execution | ihr intern / Jupiter-Portal | live erforderlich | fehlt der Key, stoppt der Live-Boot |

`MORALIS_API_KEY` und `JUPITER_API_KEY` werden in Live-Modus schon beim Booten geprüft. Wenn du die Adapter direkt aufrufst, bleiben ihre Request-Checks zusätzlich fail-closed.

## 4.10 Resilience

| Variable | Bedeutung | Wer setzt das? | Pflicht? | Hinweis |
|---|---|---:|---:|---|
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | Fehlerzahl bis Breaker öffnet | du selbst | optional, aber wichtig | konservativ halten |
| `CIRCUIT_BREAKER_RECOVERY_MS` | Wartezeit bis Retry nach Open State | du selbst | optional | ms-Wert |

---

## 5. Wo bekomme ich die externen Keys konkret her?

## 5.1 Helius RPC
**Wofür?** Solana-RPC für echte Chain-Daten und ggf. bessere Stabilität als Public RPC.

**So bekommst du den Wert:**
1. Helius-Account anlegen.
2. Im Dashboard ein Projekt / RPC-Key erzeugen.
3. Die komplette Endpoint-URL kopieren.
4. In `RPC_URL` eintragen.

**Beispiel:**
```env
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

## 5.2 Alchemy RPC
**Wofür?** Alternative zu Helius.

**So bekommst du den Wert:**
1. Alchemy-Account anlegen.
2. App / Solana-Projekt erstellen.
3. Endpoint kopieren.
4. In `RPC_URL` eintragen.

**Beispiel:**
```env
RPC_URL=https://solana-mainnet.g.alchemy.com/v2/YOUR_KEY
```

## 5.3 xAI API
**Wofür?** Grok/xAI als LLM-Provider.

**So bekommst du den Key:**
1. xAI-Account anlegen.
2. Guthaben/Credits hinterlegen.
3. In der xAI Console unter API Keys einen Key erzeugen.
4. Als `XAI_API_KEY` setzen.

**Beispiel:**
```env
LAUNCH_MODE=xai
XAI_API_KEY=...
```

## 5.4 OpenAI API
**Wofür?** OpenAI oder OpenAI-kompatibler Fallback.

**So bekommst du den Key:**
1. OpenAI Platform / Organization Settings öffnen.
2. API Key erzeugen.
3. Als `OPENAI_API_KEY` setzen.

**Beispiel:**
```env
LAUNCH_MODE=openai_fallback
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

## 5.5 Moralis
**Wofür?** Solana / Onchain / Data-API-Zugriffe, falls euer Adapter das nutzt.

**So bekommst du den Key:**
1. Moralis-Account anlegen.
2. In den Data APIs einen API Key erzeugen/kopieren.
3. Prüfen, **wie euer Code den Key erwartet**.

**Wichtig:** Dein Template enthält aktuell keinen offensichtlichen `MORALIS_API_KEY`.

## 5.6 Jupiter
**Wofür?** Quotes / Swaps.

**So bekommst du den Key:**
1. Jupiter Developer Portal öffnen.
2. API Key erzeugen.
3. Prüfen, ob euer Code den Key per Header, Query oder separater Env erwartet.

**Wichtig:** Dein Template enthält aktuell keinen offensichtlichen `JUPITER_API_KEY`.

---

## 6. Sichere Generierung interner Secrets

## 6.1 macOS / Linux

### Hex-Secret
```bash
openssl rand -hex 32
```

### Base64-Secret
```bash
openssl rand -base64 32
```

## 6.2 Windows PowerShell

### Hex-Secret
```powershell
[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### Base64-Secret
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Verwende solche Werte für:
- `CONTROL_TOKEN`
- `OPERATOR_READ_TOKEN`
- `DASHBOARD_SESSION_SECRET`
- interne Webhook-Tokens

---

## 7. Empfohlene `.env`-Beschaffung nach Variable

| Variable / Gruppe | Quelle |
|---|---|
| Modus-Flags (`LIVE_TRADING`, `DRY_RUN`, `TRADING_ENABLED`, `RPC_MODE`, `LIVE_TEST_MODE`) | selbst setzen |
| Limits (`LIVE_TEST_*`, `MAX_SLIPPAGE_PERCENT`) | selbst setzen |
| `RPC_URL` | Solana public RPC, Helius oder Alchemy |
| `WALLET_ADDRESS` | aus deiner Wallet-App |
| `CONTROL_TOKEN`, `OPERATOR_READ_TOKEN`, `DASHBOARD_SESSION_SECRET` | lokal selbst generieren |
| `NOTIFY_WEBHOOK_*_URL` | Zielsystem oder eigener Alert-Receiver |
| `NOTIFY_WEBHOOK_*_TOKEN` | Zielsystem oder intern generieren |
| `XAI_API_KEY` | xAI Console |
| `OPENAI_API_KEY` | OpenAI Platform / kompatibler Provider |
| `OPENAI_BASE_URL` | Standard OpenAI oder kompatibler Anbieter |
| `MORALIS_*` | Moralis Dashboard + Code-Prüfung |
| `JUPITER_*` | Jupiter Developer Portal + Code-Prüfung |
| `DASHBOARD_OPERATOR_DIRECTORY_JSON` | intern erzeugen aus eurer Operator-Liste |

---

## 8. Start-Reihenfolge für eine saubere Einrichtung

1. **Dev/Stub zuerst**
   - `LIVE_TRADING=false`
   - `DRY_RUN=true`
   - `TRADING_ENABLED=false`
   - `RPC_MODE=stub`

2. **Dann Real Data / Paper**
   - `RPC_MODE=real`
   - dedizierten RPC-Provider eintragen
   - echte Wallet-Adresse ergänzen
   - LLM-Key nur wenn der Pfad gebraucht wird

3. **Dann Live-Test**
   - Limits aktivieren
   - Tokens/Secrets/Webhooks setzen
   - Review Policy auf `required`
   - öffentliche RPCs vermeiden

4. **Erst danach Produktion**
   - Dashboard-Session-Secret
   - Operator-Directory sauber hashen
   - Alerts/Webhooks aktivieren
   - alle Secrets aus Secret Manager / Render Dashboard / sichere lokale Env laden

---

## 9. Vor dem ersten echten Deploy prüfen

- Ist `LIVE_TRADING` wirklich absichtlich `true`?
- Ist `DRY_RUN` wirklich absichtlich `false`?
- Ist `RPC_MODE=real` gesetzt?
- Nutzt `RPC_URL` einen dedizierten Provider statt Public RPC?
- Sind `CONTROL_TOKEN` und `OPERATOR_READ_TOKEN` gesetzt?
- Ist `DASHBOARD_SESSION_SECRET` gesetzt?
- Sind Alerts/Webhooks gesetzt?
- Ist klar, ob Moralis/Jupiter zusätzliche API-Keys brauchen?
- Ist `WALLET_ADDRESS` korrekt?
- Sind `.env` und Secrets **nicht** committed?

---

## 10. Offizielle Quellen

- Solana Public RPC / Cluster Docs: https://solana.com/docs/references/clusters
- Helius Docs / RPC Endpoints: https://www.helius.dev/docs/api-reference/endpoints
- Alchemy Solana Quickstart: https://www.alchemy.com/docs/reference/solana-api-quickstart
- Moralis API Key: https://docs.moralis.com/data-api/get-your-api-key
- Jupiter API Key Setup: https://dev.jup.ag/portal/setup
- Jupiter Swap API Overview: https://dev.jup.ag/docs/swap
- xAI Getting Started: https://docs.x.ai/developers/quickstart
- xAI Models: https://docs.x.ai/developers/models
- xAI Release Notes: https://docs.x.ai/developers/release-notes
- OpenAI API Quickstart / Auth: https://developers.openai.com/api/docs/quickstart/
- OpenAI API Overview / Auth: https://developers.openai.com/api/reference/overview/
