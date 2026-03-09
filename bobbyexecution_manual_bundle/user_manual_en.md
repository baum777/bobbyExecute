# BobbyExecution User Manual

## Beginner Guide for the Solana Meme Trading Bot

------------------------------------------------------------------------

## 1. Introduction

BobbyExecution is an automated trading bot designed to trade **Solana
tokens (especially meme tokens)** while prioritizing safety and
deterministic execution.

This manual explains:

-   How the bot works
-   How to configure it
-   How to safely start trading
-   How to monitor the system
-   How to avoid common mistakes

------------------------------------------------------------------------

## 2. Safety Notice

Automated trading involves risk.

Always start with **very small capital**.

Recommended beginner capital:

20--50 USD

Never test using your primary wallet.

------------------------------------------------------------------------

## 3. Bot Decision Pipeline

The bot performs several checks before trading:

1.  Market data ingestion
2.  Data quality validation
3.  Token scoring
4.  Signal generation
5.  Risk evaluation
6.  Manipulation / chaos detection
7.  Execution
8.  On-chain verification
9.  Persistent journaling

If any stage fails → the trade is blocked.

------------------------------------------------------------------------

## 4. Bot Modes

### Dry Run

Simulates trading with no transactions.

### Paper Mode

Uses real data but does not send transactions.

### Live Mode

Executes real trades.

Only use after successful testing.

------------------------------------------------------------------------

## 5. Wallet Setup

### Step 1 --- Create a Test Wallet

Use tools like:

-   Phantom
-   Solflare
-   Backpack

Fund it with a **small amount of SOL**.

Recommended test capital:

20--50 USD.

### Step 2 --- Copy Wallet Address

Example:

4Nd1mWExampleWalletAddress

### Step 3 --- Add to Config

Example `.env`:

WALLET_ADDRESS=YourWalletAddress WALLET_PRIVATE_KEY=YourPrivateKey

Never share your private key.

------------------------------------------------------------------------

## 6. Important Configuration Parameters

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

## 7. Restricting to Solana Meme Tokens

Example:

CHAIN=solana TOKEN_UNIVERSE=solana_meme ALLOW_MEME_TOKENS_ONLY=true

------------------------------------------------------------------------

## 8. Startup Workflow

1.  Run Dry Mode
2.  Validate logs
3.  Run Paper Mode for several days
4.  Enable micro live trading

------------------------------------------------------------------------

## 9. Monitoring Metrics

Important metrics:

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

## 10. Daily Checklist

Before running:

-   check system health
-   verify configuration
-   confirm wallet

During operation:

-   monitor logs
-   monitor metrics

After operation:

-   inspect journal
-   verify trades

------------------------------------------------------------------------

## 11. Beginner Safe Settings

GLOBAL_MAX_CAPITAL_USD=25 MAX_TRADE_USD=3 MAX_TRADES_PER_DAY=1
MAX_DAILY_LOSS_USD=5

------------------------------------------------------------------------

## 12. Scaling Strategy

Day 1--3: Paper Mode

Day 4--7: Micro trades

Week 2+: gradual scaling

------------------------------------------------------------------------

## 13. Final Advice

Focus on **system stability**, not quick profit.

Start small. Monitor carefully. Scale slowly.
