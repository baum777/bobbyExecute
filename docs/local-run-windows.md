# Windows Papertrade Quickstart

Use this first. Do not use the live-limited path until papertrade works.
Shared concepts and the mode map live in `docs/local-run.md`.

## Before You Start

- Windows PowerShell
- Node 22
- npm
- A local Postgres and Redis only if you want truthful multi-process papertrade

## Step 1: Generate Local Tokens

Run this once to create two distinct local secrets:

```powershell
function New-LocalToken {
  param([int]$Bytes = 32)
  $buffer = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  [Convert]::ToHexString($buffer).ToLowerInvariant()
}

$controlToken = New-LocalToken
$readToken = New-LocalToken
$controlToken
$readToken
```

Copy the values into `bot\.env.papertrade`:

```dotenv
CONTROL_TOKEN=<generated-token-1>
OPERATOR_READ_TOKEN=<generated-token-2>
```

Keep the two values different. Use the same style of generated values in `bot\.env.live-local` only when you are preparing live trade later.

## Helper: Import Env File Into The Current Shell

```powershell
function Import-EnvFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $name = $matches[1]
      $value = $matches[2]
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}
```

## Step 2: Prepare `bot\.env.papertrade`

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
npm install
Copy-Item ..\.env.papertrade.example .env.papertrade
# Fill the env file before continuing.
# Required for papertrade:
# - CONTROL_TOKEN
# - OPERATOR_READ_TOKEN
# - RUNTIME_POLICY_AUTHORITY=ts-env
# - ROLLOUT_POSTURE=paper_only
# - OPENAI_API_KEY if you want the main LLM path exercised
# - DATABASE_URL and REDIS_URL only if you want truthful multi-process papertrade
Import-EnvFile .\.env.papertrade
npm run build
```

If `DATABASE_URL` is set, check schema readiness before starting anything:

```powershell
npm run db:status
# If the status says missing_but_migratable or migration_required, run:
npm run db:migrate
```

If `DATABASE_URL` is blank, skip the DB scripts. That only gives you a boot smoke test, not truthful multi-process papertrade.

## Step 3: Start Papertrade Services

Use the same `bot\.env.papertrade` values in every bot window.

Window A: control service

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
Import-EnvFile .\.env.papertrade
npm run start:control
```

Window B: worker

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
Import-EnvFile .\.env.papertrade
npm run start:worker
```

Window C: public API server

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
Import-EnvFile .\.env.papertrade
npm run start:server
```

Window D: dashboard

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\dashboard
npm install
Copy-Item .env.example .env.local
# Fill CONTROL_SERVICE_URL, CONTROL_TOKEN, and OPERATOR_READ_TOKEN.
# Use the same generated tokens from bot\.env.papertrade.
npm run dev
```

## Verify Papertrade

Run these in the same PowerShell window where you executed `Import-EnvFile .\.env.papertrade`.
If you open a new window, the loaded env values such as tokens, URLs, and mode flags are gone.

```powershell
Invoke-RestMethod http://127.0.0.1:3333/health
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:OPERATOR_READ_TOKEN" } http://127.0.0.1:3334/control/status
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:OPERATOR_READ_TOKEN" } http://127.0.0.1:3334/control/runtime-status
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:OPERATOR_READ_TOKEN" } http://127.0.0.1:3334/control/release-gate
Invoke-RestMethod http://127.0.0.1:3000/api/auth/session
```

Success looks like:

- `runtime-status` reports paper mode, not live
- `release-gate` does not allow live execution
- no signer process is running
- the logs describe paper or simulated behavior only

## Common Failures

- `db:status` fails because `DATABASE_URL` is blank. That is expected for smoke tests, not for truthful multi-process runs.
- `db:status` and `db:migrate` are only needed when you have a real database URL configured, and `db:migrate` also accepts `DIRECT_URL`.
- The dashboard cannot talk to control because `CONTROL_SERVICE_URL`, `CONTROL_TOKEN`, or `OPERATOR_READ_TOKEN` do not match the bot env.
- The runtime behaves like a smoke test because `DATABASE_URL` or `REDIS_URL` are blank.
- `DRY_RUN=true` was used by mistake. That is dry mode, not papertrade.

## Live Trade

Do not switch directly from this page into live execution.

- Live-limited Windows commands: `docs/06_journal_replay/staging-live-preflight-runbook-windows.md`
