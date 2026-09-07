# TWINTICKER

> **Two tickers, one truth.**
> TWINTICKER is an AI agent on **Binance Agent OS** that watches Ondo tokenized US stocks on BNB Chain and compares them to the underlying US equity in real time. It flags divergence, explains why it matters, and — with user confirmation — can swap into the mispriced token via the **Binance Agentic Wallet**.

**Bucket:** Data Analysis
**Track:** A — Build an AI agent on Agent OS
**Binance Agent OS Mini Hackathon · 2026-09-08**

**Live demo:** https://twinticker.vercel.app
**MCP endpoint:** `https://twinticker.vercel.app/mcp`
**REST API:** `https://twinticker.vercel.app/api/scan/NVDA`
**GitHub:** https://github.com/ruzkypazzy/twinticker

---

## The problem

Ondo Global Markets tokenizes US equities on BNB Chain as 24/7-tradable on-chain tokens. Each token represents a fractional share of the underlying stock, with a `multiplier` that determines how many tokens equal one share.

But the on-chain price can drift from the real equity:
- The stock can be **halted for earnings** while the token keeps trading.
- The token can trade at a **premium or discount** in thin liquidity.
- **Corporate actions** (splits, dividends) update the underlying but lag on-chain.
- The `multiplier` semantics are easy to get wrong (1 token ≠ 1 share for SPY, QQQ, etc.).

No human can watch all of this. **TWINTICKER does.**

---

## What the agent does

TWINTICKER runs three sub-agents in sequence:

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Reader          │    │  Analyzer        │    │  Executor        │
│                  │    │                  │    │                  │
│  Reads:          │───▶│  Computes:       │───▶│  With confirm:   │
│  • On-chain token│    │  • Divergence    │    │  • baw market-   │
│    price from    │    │    (basis        │    │    order swap    │
│    binance-      │    │    points)       │    │  • Real on-chain │
│    tokenized-    │    │  • Verdict:      │    │    tx, signed by │
│    securities-   │    │    FAIR_VALUE /  │    │    Agentic       │
│    info skill    │    │    UNDERVALUED / │    │    Wallet        │
│  • US equity     │    │    OVERVALUED /  │    │                  │
│    price from    │    │    HALTED /      │    │  Returns:        │
│    public feed   │    │    NO_DATA       │    │  • tx hash       │
│  • Multiplier,   │    │  • Confidence    │    │  • BscScan URL   │
│    status,       │    │  • LLM rationale │    │  • Filled price  │
│    holders       │    │    (gpt-4o-mini) │    │  • Cap: $5/test  │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

### Supported symbols (10 Ondo Global Markets tokens on BNB Chain)

`NVDA` `TSLA` `AAPL` `MSFT` `GOOGL` `AMZN` `META` `JPM` `SPY` `QQQ`

### Verdict semantics

| Divergence (bps) | Verdict | Action | Confidence |
|---:|---|---|---|
| `\|d\| < 50` | `FAIR_VALUE` | PASS | high |
| `d < -50` | `UNDERVALUED` | BUY | medium if `\|d\|<200`, high otherwise |
| `d > 50` | `OVERVALUED` | SELL_OR_PASS | medium if `\|d\|<200`, high otherwise |
| status ≠ open | `HALTED` | (none) | high |
| price missing | `NO_DATA` | (none) | low |

### Multiplier handling

`SPY` and `QQQ` use `multiplier = 0.1` (each token = 0.1 share). TWINTICKER correctly applies the multiplier in both directions:
- `fairValue_per_token = sharePrice × multiplier`
- `divergence_bps = (observedTokenPrice - fairValue_per_token) / fairValue_per_token × 10000`

A 0.1-multiplier token at the right price is `$56.22` for SPY at a `$562.18` share price — not `$5621.80`.

---

## Quick start (30 seconds)

```bash
git clone https://github.com/ruzkypazzy/twinticker.git
cd twinticker
npm install
cp .env.example .env   # add your OPENAI_API_KEY
npm test               # 5/5 smoke tests
npm start              # http://localhost:3000
```

Open http://localhost:3000 and click any chip. The verdict card renders in ~1 second.

### Connect from any MCP client

Add to your Claude Code / Codex / Cursor MCP config:

```json
{
  "mcpServers": {
    "twinticker": {
      "url": "https://twinticker.vercel.app/mcp"
    }
  }
}
```

Then ask: *"Use twinticker_scan to check NVDA, then twinticker_scan_all to find the most mispriced Ondo stock."*

---

## API reference

### `GET /health`
Returns `{ ok: true, name: 'twinticker', time: ISO }`.

### `GET /api/scan/:symbol`
Returns the full verdict card for one symbol.

```bash
curl https://twinticker.vercel.app/api/scan/NVDA
```
```json
{
  "symbol": "NVDA",
  "name": "Nvidia Corporation",
  "chain": "BSC",
  "multiplier": 1,
  "usStock": { "price": 178.42, "source": "fallback-curated" },
  "onchain": { "observedPrice": 176.90, "spreadBps": -85 },
  "verdict": "UNDERVALUED",
  "action": "BUY",
  "divergenceBps": -85,
  "fairValue": 178.42,
  "observedPrice": 176.9,
  "confidence": "medium",
  "rationale": "Nvidia Corporation's tokenized stock is currently observed at $176.90, which is $1.52 below its fair value of $178.42, indicating an undervaluation of 85 basis points."
}
```

### `GET /api/scan-all`
Returns all 10 Ondo tokens ranked by absolute divergence.

```bash
curl https://twinticker.vercel.app/api/scan-all
```

### `POST /mcp`
MCP streamable-HTTP endpoint. Two tools:

| Tool | Description |
|---|---|
| `twinticker_scan` | Scan one symbol. Args: `{ symbol: string }` |
| `twinticker_scan_all` | Scan all 10 Ondo tokens. Args: `{}` |

Initialize handshake:
```bash
curl -X POST https://twinticker.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Browser (any user)                                            │
│  https://twinticker.vercel.app/                                │
│  Renders verdict cards, ranked grid, quick chips               │
└────────────┬───────────────────────────────────────────────────┘
             │  GET /api/scan/NVDA
             ▼
┌────────────────────────────────────────────────────────────────┐
│  Vercel serverless function (Node.js 22, Fastify)              │
│                                                                │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐           │
│  │  Reader    │───▶│  Analyzer  │───▶│  Scanner   │           │
│  │  agent     │    │  agent     │    │  agent     │           │
│  └────────────┘    └────────────┘    └────────────┘           │
│        │                  │                                  │
│        │                  ▼                                  │
│        │           ┌────────────┐                             │
│        │           │  OpenAI    │                             │
│        │           │  gpt-4o-   │                             │
│        │           │  mini      │                             │
│        │           └────────────┘                             │
└────────┼──────────────────────────────────────────────────────┘
         │
         ├──▶ Yahoo Finance (public, no auth) ──▶ NVDA close = $178.42
         ├──▶ Stooq (public CSV)               ──▶ fallback
         ├──▶ Curated fallback (clearly tagged) ──▶ fallback
         │
         └──▶ binance-tokenized-securities-info skill (live)
             via Binance Agent OS MCP server
             (in production) — observedTokenPrice = $176.90
```

The 3-agent architecture maps cleanly onto the **Skills Hub** model: each agent is a small, composable skill, and a future Composer agent can chain them.

---

## What TWINTICKER does NOT do

- It does **not custody user funds**. The Executor is wired to the Binance Agentic Wallet (`baw` CLI) which holds the key, applies its own daily limits, and signs the swap. The agent only orchestrates the call.
- It does **not place orders without confirmation** in the default mode. The MCP `twinticker_scan` tool is read-only. The `twinticker_execute` tool (when enabled) requires `confirm: true` and is capped at **$5 USDT per swap** in demo mode.
- It does **not** make predictions about future prices. It reports the *current* divergence, with a deterministic verdict and an LLM-written rationale.

---

## On-chain swap path (Executor)

When the verdict is `UNDERVALUED` and the user opts in:

```bash
# 1. Preview the swap (free, no signature)
baw market-order quote --fromToken USDT --toToken NVDAonBSC --amount 5

# 2. Confirm with the user (the agent asks, user replies yes)
# 3. Execute (signed by Agentic Wallet, not by us)
baw market-order swap --fromToken USDT --toToken NVDAonBSC --amount 5 --yes

# 4. Verify on BscScan
# 5. Return tx hash, filled price, divergence at execution
```

The Executor is **not** running in the live demo because it requires the user to have signed into the Agentic Wallet. The verdict path is fully live. To enable the Executor, set `BAW_ENABLED=true` in the environment and `baw auth signin` first.

---

## Testing

```bash
npm test
```

5 smoke tests, all passing:

```
ok 1 - ONDO_TOKENS has the 10 expected symbols
ok 2 - Reader returns structured data for a known symbol
ok 3 - Reader rejects unknown symbol gracefully
ok 4 - Analyzer returns a valid verdict shape
ok 5 - Scanner returns ranked list
```

---

## Project layout

```
twinticker/
├── public/
│   └── index.html               # Demo page (verdict cards, ranked grid)
├── src/
│   ├── server.js                # Fastify app, MCP endpoint, REST routes
│   └── agents/
│       ├── reader.js            # Pulls on-chain + off-chain prices
│       ├── analyzer.js          # Verdict + LLM rationale
│       └── scanner.js           # Scans all 10 tokens
├── tests/
│   └── smoke.test.js            # node:test, 5/5 pass
├── vercel.json                  # Vercel deploy config
├── package.json
├── .env.example
├── .gitignore
├── LICENSE                      # MIT
└── README.md                    # This file
```

---

## Tech stack

- **Runtime:** Node.js 22+ (ESM, top-level await)
- **Server:** Fastify 5
- **MCP:** `@modelcontextprotocol/sdk` (streamable HTTP transport)
- **HTTP client:** undici (Node 22 native)
- **LLM:** OpenAI gpt-4o-mini (configurable via `OPENAI_MODEL`)
- **Deploy:** Vercel (serverless)
- **Tests:** `node --test`

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Built for the Binance Agent OS Mini Hackathon

- **Bucket:** Data Analysis
- **Track:** A
- **Submission deadline:** 2026-09-08 23:59 UTC
- **Author:** [@ruzkypazzy](https://github.com/ruzkypazzy)
- **Live:** https://twinticker.vercel.app
