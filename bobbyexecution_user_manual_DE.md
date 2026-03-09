# BobbyExecution User Manual

## Solana Meme Token Trading Bot

### Beginner-Friendly Guide

------------------------------------------------------------------------

# 1. Introduction

Welcome to **BobbyExecution**, an automated trading bot designed to
trade **Solana tokens (especially meme tokens)** with strict safety
mechanisms.

This manual explains:

-   How the bot works
-   How to configure it
-   How to safely start trading
-   How to monitor the bot
-   How to avoid common mistakes

This guide assumes **no previous experience with trading bots**.

------------------------------------------------------------------------

# 2. Important Safety Warning

Automated trading involves risk.

Even well-built bots can lose money if:

-   the market behaves unexpectedly
-   liquidity disappears
-   infrastructure fails
-   configuration mistakes occur

Always start with **very small amounts**.

Recommended beginner test capital:

**20--50 USD maximum**

------------------------------------------------------------------------

# 3. How the Bot Works

The bot follows a strict pipeline before executing a trade.

Pipeline:

1.  Market data is fetched
2.  Data quality is validated
3.  Token metrics are calculated
4.  Signals are generated
5.  Risk checks run
6.  Manipulation / chaos checks run
7.  Trade execution occurs
8.  Transaction is verified
9.  Results are logged

If any step fails:

**The trade is blocked.**

This is called a **fail‑closed system**.

------------------------------------------------------------------------

# 4. Operating Modes

The bot supports three modes.

## Dry Run

Simulation only.

The bot behaves as if it trades but **no transactions are sent**.

Use this mode to:

-   test configuration
-   test adapters
-   check logs

Example:

EXECUTION_MODE=dry_run

------------------------------------------------------------------------

## Paper Mode

Uses **real market data**, but still does **not send real
transactions**.

Useful for:

-   validating strategy behavior
-   observing signal frequency
-   ensuring the system is stable

Example:

EXECUTION_MODE=paper

------------------------------------------------------------------------

## Live Mode

The bot executes real trades on-chain.

Only use after:

-   successful dry run
-   several days of paper testing

Example:

EXECUTION_MODE=live

------------------------------------------------------------------------

# 5. Wallet Setup (Important Section)

## Step 1 --- Create a Test Wallet

Never start with your main wallet.

Create a **separate Solana wallet**.

Example tools:

-   Phantom
-   Solflare
-   Backpack

Steps:

1.  Install wallet extension
2.  Create a new wallet
3.  Save the recovery phrase securely
4.  Fund with small amount of SOL

Recommended starting funds:

20--50 USD equivalent.

------------------------------------------------------------------------

## Step 2 --- Obtain Wallet Address

Inside the wallet app you will see your public address.

Example:

4Nd1mW...SolanaAddressExample

Copy this address.

------------------------------------------------------------------------

## Step 3 --- Add Wallet to Bot Configuration

Edit your `.env` configuration file.

Example:

WALLET_ADDRESS=YourSolanaWalletAddress

If your bot requires signing capability, also add:

WALLET_PRIVATE_KEY=your_private_key_here

Important:

Never share your private key publicly.

------------------------------------------------------------------------

## Step 4 --- Test Wallet Connectivity

Start the bot in **dry run mode**.

The bot should:

-   connect to RPC
-   detect wallet balance
-   confirm configuration is valid

If wallet detection fails, check:

-   RPC endpoint
-   wallet address formatting
-   environment variables

------------------------------------------------------------------------

# 6. Configuring the Bot

Configuration typically lives in a `.env` file.

Below are the most important parameters.

------------------------------------------------------------------------

## Execution Mode

EXECUTION_MODE=paper

Options:

-   dry_run
-   paper
-   live

------------------------------------------------------------------------

## Live Trading Switch

LIVE_TRADING_ENABLED=false

Must be **true** for live trading.

------------------------------------------------------------------------

## RPC Provider Mode

RPC_PROVIDER_MODE=real

Options:

-   mock
-   real

------------------------------------------------------------------------

## Maximum Capital Limit

GLOBAL_MAX_CAPITAL_USD=50

Limits the maximum capital the bot can use.

Even if wallet contains more.

------------------------------------------------------------------------

## Trade Size

MAX_TRADE_USD=5

Maximum size of a single trade.

------------------------------------------------------------------------

## Trades Per Day

MAX_TRADES_PER_DAY=1

Protects against over-trading.

------------------------------------------------------------------------

## Daily Loss Limit

MAX_DAILY_LOSS_USD=10

If exceeded → bot halts trading.

------------------------------------------------------------------------

## Slippage Protection

MAX_SLIPPAGE_PERCENT=3

Trade blocked if slippage too high.

------------------------------------------------------------------------

## Minimum Liquidity

MIN_POOL_LIQUIDITY_USD=50000

Avoids trading illiquid pools.

------------------------------------------------------------------------

## Minimum Token Age

MIN_TOKEN_AGE_HOURS=24

Avoids very new tokens.

------------------------------------------------------------------------

## Data Quality Threshold

DATA_QUALITY_THRESHOLD=0.8

Trades blocked when data quality is low.

------------------------------------------------------------------------

# 7. Restricting the Bot to Solana Meme Tokens

Example configuration:

CHAIN=solana TOKEN_UNIVERSE=solana_meme ALLOW_MEME_TOKENS_ONLY=true

This prevents trading outside your chosen market.

------------------------------------------------------------------------

# 8. Starting the Bot

Typical workflow:

1.  Start Dry Run
2.  Monitor logs
3.  Switch to Paper Mode
4.  Run several days
5.  Enable micro live trades

Example command:

npm start

------------------------------------------------------------------------

# 9. Monitoring Metrics

Key metrics to watch:

## Signal → Execution Rate

Shows how many signals become trades.

## Risk Block Rate

Indicates how often risk rules prevent trades.

## Chaos Fail Rate

Shows how often manipulation or suspicious conditions are detected.

## Data Quality Score

Measures reliability of market data.

## Adapter Success Rate

Shows API stability.

## Adapter Latency

Measures API response speed.

## Execution Success Rate

Percentage of successful trade executions.

## Verification Success Rate

Percentage of trades confirmed on-chain.

## Realized PnL

Actual profit or loss.

## Duplicate Incident Count

Tracks duplicate trade attempts.

------------------------------------------------------------------------

# 10. Daily Operator Checklist

Before running:

-   Check wallet balance
-   Confirm configuration
-   Verify system health

During operation:

-   watch logs
-   watch metrics

After operation:

-   inspect journal logs
-   review trades

------------------------------------------------------------------------

# 11. Common Beginner Mistakes

1.  Starting live trading too early
2.  Using main wallet
3.  Ignoring logs
4.  Trading tokens with low liquidity
5.  Increasing capital too fast

------------------------------------------------------------------------

# 12. Safe Beginner Configuration

Example:

GLOBAL_MAX_CAPITAL_USD=25 MAX_TRADE_USD=3 MAX_TRADES_PER_DAY=1
MAX_DAILY_LOSS_USD=5

------------------------------------------------------------------------

# 13. Scaling Strategy

Increase limits slowly.

Example timeline:

Day 1--3: Paper mode

Day 4--7: \$3 trades

Week 2: \$5 trades

Week 3+: gradual scaling

------------------------------------------------------------------------

# 14. Final Advice

The goal is not fast profit.

The goal is **stable operation**.

A trader who survives mistakes learns and improves.

Start small. Monitor carefully. Scale slowly.
