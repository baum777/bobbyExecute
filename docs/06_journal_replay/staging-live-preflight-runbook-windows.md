# Windows Live-Limited Quickstart

Use this only after papertrade works.
Shared concepts and the gate map live in `docs/06_journal_replay/staging-live-preflight-runbook.md`.

## Before You Start

- Windows PowerShell
- Node 22
- npm
- A real RPC endpoint
- A remote signer service
- Shared Postgres and Redis if you want truthful multi-process live trade

## Step 1: Generate Local Tokens

Run this in PowerShell to create two distinct local secrets:

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

Copy the generated values into `bot\.env.live-local`:

```dotenv
CONTROL_TOKEN=<generated-token-1>
OPERATOR_READ_TOKEN=<generated-token-2>
```

Use the same generated values in `dashboard\.env.local` when the dashboard proxies control locally.

## Helper: Import Env File Into The Current PowerShell Session

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

## Step 2: Prepare the Signer

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\signer
npm install
Copy-Item .env.example .env.local
# Fill SIGNER_AUTH_TOKEN, SIGNER_WALLET_PRIVATE_KEY, and SIGNER_WALLET_ADDRESS.
Import-EnvFile .\.env.local
npm run build
npm start
```

## Step 3: Prepare `bot\.env.live-local`

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
npm install
Copy-Item ..\.env.live-local.example .env.live-local
# Fill the live-limited env values before continuing, including CONTROL_TOKEN,
# OPERATOR_READ_TOKEN, RUNTIME_POLICY_AUTHORITY=ts-env, ROLLOUT_POSTURE=micro_live,
# RPC_URL, SIGNER_URL, SIGNER_AUTH_TOKEN, WALLET_ADDRESS, JUPITER_API_KEY, and
# the OpenRouter/Qwen values above.
Import-EnvFile .\.env.live-local
npm run build
```

If `DATABASE_URL` is set, check schema readiness before starting anything:

```powershell
npm run db:status
# If the status says missing_but_migratable or migration_required, run:
npm run db:migrate
```

If `DATABASE_URL` is blank, skip the DB scripts. That only gives you a boot smoke test, not truthful multi-process live trade.

Then run the hard live gate:

```powershell
npm run live:preflight
```

What the first live-preflight error means:

- `Live-test preflight requires LIVE_TRADING=true.` usually means the wrong env file was loaded, or you are in the wrong PowerShell session. Load `bot\.env.live-local` in that same shell and retry.

## Step 4: Start Live-Limited Services

Use the same `bot\.env.live-local` values in every bot window.

Window B: bot control

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
Import-EnvFile .\.env.live-local
npm run start:control
```

Window C: bot worker

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
Import-EnvFile .\.env.live-local
npm run start:worker
```

Window D: bot runtime server

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
Import-EnvFile .\.env.live-local
# This script repeats live:preflight and then starts the server.
npm run live:test
```

Window E: dashboard

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\dashboard
npm install
Copy-Item .env.example .env.local
# Fill CONTROL_SERVICE_URL, CONTROL_TOKEN, and OPERATOR_READ_TOKEN.
# Use the same generated tokens from bot\.env.live-local.
npm run dev
```

## Verify Live-Limited State

```powershell
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:OPERATOR_READ_TOKEN" } http://127.0.0.1:3334/control/runtime-config
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:OPERATOR_READ_TOKEN" } http://127.0.0.1:3334/control/runtime-status
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:OPERATOR_READ_TOKEN" } http://127.0.0.1:3334/control/release-gate
Invoke-RestMethod http://127.0.0.1:3333/health
```

What you want to see:

- live mode, not paper or dry
- `workerSafeBoot: true`
- `release-gate` satisfied for the live posture
- rollout posture still `micro_live`
- the signer is remote and healthy

If `npm run live:preflight` fails, stop. Do not proceed to worker runtime.

## Common Failures

- `CONTROL_TOKEN` and `OPERATOR_READ_TOKEN` are the same value.
- `SIGNER_MODE` is not `remote`.
- `RPC_MODE` is not `real`.
- `DATABASE_URL` or `REDIS_URL` is blank and you assumed the run was multi-process truth rather than smoke-test fallback.
- The signer env does not match the bot env, so the control and worker processes cannot complete the same live boundary.

## Live Trade Pointer

The release and incident runbook is separate:

- `docs/06_journal_replay/operator-release-gate-and-incident-runbook.md`
