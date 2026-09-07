# TWINTICKER — strategy note

## What is the agent actually doing?

TWINTICKER is a **read-mostly divergence watcher** for Ondo Global Markets
tokenized US stocks on BNB Chain. It does not attempt to predict price, time
the market, or generate alpha. It does one thing: compare the on-chain
tokenized stock price to the underlying US equity, and surface a clear
verdict.

## Why this is useful

Ondo's BNB Chain tokenized US stocks trade 24/7, but the underlying US
equities trade only during US market hours (9:30–16:00 ET, Mon–Fri). At
all other times, the on-chain price is the only price. Three things can
happen during those off-hours:

1. **The stock is halted for an event** (earnings, dividend, news). The
   on-chain token keeps trading. Without a halt-aware agent, you can be
   trading a stock whose reference price is hours old or paused.
2. **The token trades at a premium or discount** to the last-known
   underlying price, because liquidity is thin or a market-maker stepped
   away. This is a real, executable edge.
3. **A corporate action** (split, dividend) lands and changes the fair
   value of the underlying. The on-chain token's `multiplier` updates
   asynchronously, leaving a window where the two disagree.

TWINTICKER surfaces all three of these as a single, easy-to-parse verdict.

## Edge math

The agent computes:
```
fairValue_per_token = sharePrice × multiplier
divergence_bps = (observedTokenPrice - fairValue_per_token) / fairValue_per_token × 10000
```

A divergence of `-85 bps` means the on-chain token is trading 0.85%
**below** the fair value implied by the underlying equity. At that size
on a $5 swap, the gross edge is ~$0.04 before fees — too small to be a
real trade, but the *agent's job* is to surface the signal, not to size
the trade.

## What TWINTICKER does NOT do

- It does not backtest. The verdict is a point-in-time observation, not
  a P&L series.
- It does not run a strategy loop. The Executor is a single-shot
  per-call, gated by `confirm: true`.
- It does not handle the case where the on-chain token is illiquid (no
  recent trades, no order book depth). That is an open extension.

## Why a real on-chain price, not just the on-chain market-cap snapshot

The `binance-tokenized-securities-info` skill returns the *latest trade
price* on the on-chain order book. That is what we use as the observed
price. We do not use the `multiplier × lastEquityClose` heuristic, because
the whole point of the agent is to detect when the market is disagreeing
with the multiplier-implied fair value.
