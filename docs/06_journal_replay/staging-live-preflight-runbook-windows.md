# Windows Live-Limited Onboarding

This page contains the Windows PowerShell commands for the live-limited path.
Shared concepts and the gate map live in [staging-live-preflight-runbook.md](C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/staging-live-preflight-runbook.md).

## Prerequisites

- Windows PowerShell
- Node 22
- npm
- a real RPC endpoint
- a remote signer service
- shared Postgres and Redis if you want truthful multi-process live-limited state

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

Paste the generated values into `bot\.env.live-local`:

```dotenv
CONTROL_TOKEN=<generated-token-1>
OPERATOR_READ_TOKEN=<generated-token-2>
```

Also use the same generated values in `dashboard\.env.local` when the dashboard proxies control locally.

## Use Qwen 3.6 Free via OpenRouter

Set these in `bot\.env.live-local` before running live preflight:

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

## PowerShell Window 0: Signer

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\signer
npm install
Copy-Item .env.example .env.local
# Fill SIGNER_AUTH_TOKEN, SIGNER_WALLET_PRIVATE_KEY, and SIGNER_WALLET_ADDRESS.
Import-EnvFile .\.env.local
npm run build
npm start
```

## PowerShell Window A: Bot Preflight

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
npm install
Copy-Item ..\.env.live-local.example .env.live-local
# Fill the live-limited env values before continuing, including CONTROL_TOKEN,
# OPERATOR_READ_TOKEN, and the OpenRouter/Qwen values above.
Import-EnvFile .\.env.live-local
npm run build
npm run live:preflight
```

## PowerShell Window B: Bot Control

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
Import-EnvFile .\.env.live-local
npm run start:control
```

## PowerShell Window C: Bot Worker

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
Import-EnvFile .\.env.live-local
npm run start:worker
```

## PowerShell Window D: Bot Server

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\bot
Import-EnvFile .\.env.live-local
npm run live:test
```

## PowerShell Window E: Dashboard

```powershell
Set-Location C:\workspace\main_projects\dotBot\bobbyExecute\dashboard
npm install
Copy-Item .env.example .env.local
# Fill CONTROL_SERVICE_URL, CONTROL_TOKEN, and OPERATOR_READ_TOKEN.
# Use the same generated tokens from bot\.env.live-local.
npm run dev
```

## Verification

```powershell
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:OPERATOR_READ_TOKEN" } http://127.0.0.1:3334/control/runtime-config
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:OPERATOR_READ_TOKEN" } http://127.0.0.1:3334/control/runtime-status
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:OPERATOR_READ_TOKEN" } http://127.0.0.1:3334/control/release-gate
```

What you want to see:

- live mode, not paper or dry
- `workerSafeBoot: true`
- `release-gate` satisfied for the live posture
- rollout posture still `micro_live`
- the signer is remote and healthy

If `npm run live:preflight` fails, stop. Do not proceed to worker runtime.

## Live-Limited Pointer

The release and incident runbook is separate:

- [docs/06_journal_replay/operator-release-gate-and-incident-runbook.md](C:/workspace/main_projects/dotBot/bobbyExecute/docs/06_journal_replay/operator-release-gate-and-incident-runbook.md)
