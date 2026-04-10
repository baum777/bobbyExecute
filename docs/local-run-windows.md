# Windows Papertrade Onboarding

This page contains the Windows PowerShell commands for the papertrade path.
Shared concepts, safety boundaries, and the live-limited index live in [docs/local-run.md](C:/workspace/main_projects/dotBot/bobbyExecute/docs/local-run.md).

## Prerequisites

- Windows PowerShell
- Node 22
- npm
- local Postgres and Redis if you want truthful multi-process papertrade

## Generate Local Auth Tokens

Run these in PowerShell to create two distinct local secrets:

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

Paste the generated values into `bot\.env.papertrade`:

```dotenv
CONTROL_TOKEN=<generated-token-1>
OPERATOR_READ_TOKEN=<generated-token-2>
```

If you are preparing live-limited mode later, paste the same style of generated values into `bot\.env.live-local`.

## Use Qwen 3.6 Free via OpenRouter

Set these in `bot\.env.papertrade` before booting the bot services:

```dotenv
LAUNCH_MODE=openai
OPENAI_API_KEY=<openrouter-api-key>
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=qwen/qwen3.6-plus:free
OPENROUTER_HTTP_REFERER=http://127.0.0.1
OPENROUTER_X_TITLE=BobbyExecute
ADVISORY_LLM_ENABLED=false
ADVISORY_LLM_PROVIDER=openai
```

There is no separate `ADVISORY_LLM_MODEL` env key in this repo. If you intentionally switch the advisory provider to `qwen`, use `QWEN_API_KEY`, `QWEN_BASE_URL`, and `QWEN_MODEL=qwen/qwen3.6-plus:free`.

## Helper: Import env file into the current PowerShell session

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

## PowerShell Window A: Bot Control

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
npm install
Copy-Item ..\.env.papertrade.example .env.papertrade
# Fill the env file before continuing, including CONTROL_TOKEN, OPERATOR_READ_TOKEN,
# and the OpenRouter/Qwen values above.
Import-EnvFile .\.env.papertrade
npm run build
npm run db:migrate
npm run start:control
```

## PowerShell Window B: Bot Worker

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
Import-EnvFile .\.env.papertrade
npm run start:worker
```

## PowerShell Window C: Bot Server

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
Import-EnvFile .\.env.papertrade
npm run start:server
```

## PowerShell Window D: Dashboard

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\dashboard
npm install
Copy-Item .env.example .env.local
# Fill CONTROL_SERVICE_URL, CONTROL_TOKEN, and OPERATOR_READ_TOKEN.
# Use the same generated tokens from bot\.env.papertrade.
npm run dev
```

## Verification

```powershell
Invoke-RestMethod http://127.0.0.1:3333/health
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:OPERATOR_READ_TOKEN" } http://127.0.0.1:3334/control/status
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:OPERATOR_READ_TOKEN" } http://127.0.0.1:3334/control/runtime-status
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:OPERATOR_READ_TOKEN" } http://127.0.0.1:3334/control/release-gate
Invoke-RestMethod http://127.0.0.1:3000/api/auth/session
```

Success looks like:

- `runtime-status` reports paper mode, not live.
- `release-gate` does not allow live execution.
- No signer process is running.
- The logs describe paper or simulated behavior only.

If `DATABASE_URL` and `REDIS_URL` are blank, stop after boot smoke testing.
Do not claim full papertrade coverage.

## Dry Mode

Dry mode is separate from papertrade.

- `LIVE_TRADING=false`
- `DRY_RUN=true`

Do not label dry mode as papertrade.

## Live-Limited Pointer

Live-limited onboarding is separate.

- Index: [docs/06_journal_replay/staging-live-preflight-runbook.md](C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-runbook.md)
