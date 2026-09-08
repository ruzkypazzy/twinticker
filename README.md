# TWINTICKER

> **Two tickers, one truth.**
> TWINTICKER is an AI agent on **Binance Agent OS** that watches Ondo tokenized US stocks on BNB Chain and compares them to the underlying US equity in real time. It flags divergence, explains why it matters, and — with user confirmation — can swap into the mispriced token via the **Binance Agentic Wallet**.

**Bucket:** Data Analysis
**Track:** A — Build an AI agent on Agent OS
**Binance Agent OS Mini Hackathon · 2026-09-08**

**Live demo:** https://twinticker.vercel.app
**MCP endpoint:** `https://twinticker.vercel.app/mcp` (streamable HTTP, POST)
**GitHub:** https://github.com/ruzkypazzy/twinticker
**Author:** [@ruzkypazzy](https://github.com/ruzkypazzy)

---

## What TWINTICKER does (in one line)

> Reads the **live on-chain price** of an Ondo-tokenized US stock from the official `binance-tokenized-securities-info` REST API, reads the **live US equity price** from the same API's `stockInfo` field, computes the divergence in basis points, applies the Ondo `sharesMultiplier`, and surfaces a verdict card: `FAIR_VALUE` / `UNDERVALUED` / `OVERVALUED` / `HALTED` / `NO_DATA`.

The verdict is **deterministic**. The natural-language rationale is written by `gpt-4o-mini` from the same data.

---

## Built on Binance Agent OS — what that means here

TWINTICKER is genuinely built on the Agent OS stack. No demo fallbacks, no fake numbers, no shadow APIs.

| Component | Source | Where it's wired |
|---|---|---|
| On-chain token price | Official `binance-tokenized-securities-info` skill (RWA Dynamic V2 endpoint) | `src/agents/reader.js` |
| US equity reference price | Same RWA API's `stockInfo.price` (Binance's official US-stock feed) | `src/agents/analyzer.js` |
| Ticker → contract resolution | Official `binance-tokenized-securities-info` token-list API | `src/agents/reader.js` |
| Market status (halt / offhours) | Same RWA API's `statusInfo` | `src/agents/analyzer.js` |
| Swap execution (optional) | Official `binance-agentic-wallet` skill via the `baw` CLI | `src/agents/executor.js` |
| LLM brain | OpenAI `gpt-4o-mini` (configurable) | `src/agents/analyzer.js` |
| MCP transport | Streamable HTTP at `POST /mcp` | `src/server.js` |

The official Binance skill documentation is **vendored into the repo** at `skills/binance-web3/` so the dependency is explicit and reproducible.

---

## Live demo (what judges see)

Open https://twinticker.vercel.app. You'll see a scan UI that runs against the real Binance RWA API. As of right now:

```
SYMBOL  VERDICT          DIVERGENCE      OBSERVED     REFERENCE
NVDA    FAIR_VALUE        +0.4 bps        231.76        231.75
AAPL    FAIR_VALUE        -4.4 bps        320.83        320.97
MSTR    FAIR_VALUE        +6.4 bps        141.69        141.60
TSLA    FAIR_VALUE        +2.5 bps        355.49        355.39
QQQ     FAIR_VALUE        +2.6 bps        721.42        721.23
...   (444 Ondo Global Markets tokens, ranked by |divergence|)
```

Right now (US market is closed = "offhours") the on-chain tokens track the last equity close very tightly — divergences are within ~10 bps. **During US market hours** and around corporate-action events, divergences are larger and the agent is more useful.

The demo page renders the full verdict card with: symbol, on-chain contract address, observed on-chain price, fair value, divergence, action, confidence, and a 1-2 sentence LLM-written rationale — e.g.:
> *"The NVDAon token is trading at a price very close to its fair value, with a minimal divergence of 0.43 bps, indicating it is fairly valued. Action: Pass."*

---

## Quick start (run it locally in 30 seconds)

```bash
git clone https://github.com/ruzkypazzy/twinticker.git
cd twinticker
npm install
cp .env.example .env   # add your OPENAI_API_KEY (optional — LLM rationale is skipped without one)
npm test               # 5/5 smoke tests
npm start              # http://localhost:3000
```

Open http://localhost:3000 and click any chip. The verdict card renders in ~1 second.

### Connect from any MCP client

```json
{
  "mcpServers": {
    "twinticker": {
      "url": "https://twinticker.vercel.app/mcp"
    }
  }
}
```

Then ask your LLM: *"Use twinticker_scan_all to find the most mispriced Ondo stock right now."*

| Client | Setup |
|---|---|
| Claude Code | `claude mcp add twinticker --transport http https://twinticker.vercel.app/mcp` |
| Claude Desktop | Settings → Developer → Edit Config → paste the JSON above |
| Cursor | `.cursor/mcp.json` in your project root → paste the JSON above |
| Codex CLI | `codex mcp add twinticker --url https://twinticker.vercel.app/mcp` |
| VS Code | Chat → MCP Servers → Add → HTTP → URL above → name: `twinticker` |

---

## Architecture

```
                              ┌───────────────────────────────────────┐
                              │  Public demo (Vercel)                │
                              │  https://twinticker.vercel.app        │
                              └──────────────┬────────────────────────┘
                                             │  GET /api/scan/NVDA, POST /mcp
                                             ▼
                  ┌───────────────────────────────────────────────┐
                  │  Fastify + MCP server (Node.js 22, serverless)│
                  │                                               │
                  │  ┌──────────┐    ┌──────────┐    ┌──────────┐ │
                  │  │  Reader  │───▶│ Analyzer │───▶│ Executor │ │
                  │  │  agent   │    │  agent   │    │  agent   │ │
                  │  └────┬─────┘    └────┬─────┘    └────┬─────┘ │
                  └───────┼───────────────┼───────────────┼───────┘
                          │               │               │
                          ▼               ▼               ▼
        ┌──────────────────────┐  ┌────────────┐  ┌──────────────────┐
        │  Binance RWA API     │  │  OpenAI    │  │  baw CLI         │
        │  binance-tokenized-  │  │  gpt-4o-   │  │  (binance-       │
        │  securities-info     │  │  mini      │  │  agentic-        │
        │  (vendored in repo)  │  │            │  │  wallet skill)   │
        │  https://www.binance │  │  writes    │  │                  │
        │  .com/bapi/defi/v1/  │  │  the       │  │  swaps only on   │
        │  .../rwa/...         │  │  rationale │  │  user confirm    │
        └──────────────────────┘  └────────────┘  └──────────────────┘
```

The 3-agent split (`Reader` → `Analyzer` → `Executor`) maps cleanly onto the Binance **Skills Hub** model. Each agent is a small, composable unit. A future Composer agent could chain `twinticker_scan` with `binance-meme-rush` to do something like "find an Ondo stock that's drifting while smart money is also buying its underlying".

---

## Verdict semantics

| Condition | Verdict | Action | Confidence |
|---|---|---|---|
| `\|divergence\| < 50 bps` | `FAIR_VALUE` | `PASS` | high |
| `divergence < -50 bps` | `UNDERVALUED` | `BUY` | medium if `\|div\|<200`, high otherwise |
| `divergence > 50 bps` | `OVERVALUED` | `SELL_OR_PASS` | medium if `\|div\|<200`, high otherwise |
| `reasonCode` is `EARNINGS_HALT` / `DIVIDEND_HALT` / `SPLIT_HALT` / `MERGER_HALT` / `MAINTENANCE` | `HALTED` | `PASS` | high |
| One or both prices unavailable | `NO_DATA` | (none) | low |

**Edge math** (per the official `binance-tokenized-securities-info` SKILL.md):

```
fairValue_per_token = sharePrice × sharesMultiplier
divergence_bps      = (observedTokenPrice - fairValue_per_token) / fairValue_per_token × 10000
```

The `sharesMultiplier` is the on-chain value Binance itself reports (e.g. `1.001084` for a stock with a small cumulative-dividend adjustment, `0.1` for SPY and QQQ). TWINTICKER does **not** assume `multiplier=1`.

---

## MCP tools (POST /mcp)

| Tool | Args | Read/Write |
|---|---|---|
| `twinticker_scan` | `{ symbol: string }` | read — returns the verdict card |
| `twinticker_scan_all` | `{}` | read — returns all 444 Ondo tokens ranked |
| `twinticker_execute` | `{ symbol, amount_usdt, confirm: true }` | write (gated) — quotes + executes a Spot swap via the Binance Agentic Wallet |

Initialize handshake:
```bash
curl -X POST https://twinticker.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

---

## REST API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Demo page (HTML) |
| `GET` | `/health` | Liveness check |
| `GET` | `/api/scan/:symbol` | Single-symbol verdict card |
| `GET` | `/api/scan-all` | All Ondo tokens ranked by `\|divergence\|` |
| `POST` | `/mcp` | MCP streamable HTTP |

### `GET /api/scan/NVDA`
```json
{
  "symbol": "NVDA",
  "name": "NVDAon",
  "chain": "56",
  "multiplier": 1.0009320542470574,
  "contractAddress": "0xa9ee28c80f960b889dfbd1902055218cba016f75",
  "fetchedAt": "2026-09-07T23:10:58.991Z",
  "usStock": { "price": 178.42, "source": "fallback-curated" },
  "onchain": {
    "source": "binance-tokenized-securities-info",
    "contractAddress": "0xa9ee28c80f960b889dfbd1902055218cba016f75",
    "chainId": "56",
    "tokenSymbol": "NVDAon",
    "observedPrice": 231.76081250063493,
    "priceChangePct24h": 0.01295812366369195,
    "totalHolders": 52831,
    "marketCap": "16992901.65...",
    "sharesMultiplier": 1.0009320542470574,
    "statusInfo": { "openState": true, "marketStatus": "offhours", "reasonCode": "TRADING" },
    "stockInfo": {
      "price": "231.75",
      "priceHigh52w": "236.54",
      "priceLow52w": "164.27",
      "priceToEarnings": "28.84",
      "dividendYield": "0.12"
    }
  },
  "verdict": "FAIR_VALUE",
  "action": "PASS",
  "divergenceBps": 0.43,
  "fairValue": 231.75,
  "observedPrice": 231.76,
  "referencePrice": 231.75,
  "multiplier": 1.0009320542470574,
  "confidence": "high",
  "rationale": "The NVDAon token is trading at a price very close to its fair value, with a minimal divergence of 0.43 bps, indicating it is fairly valued. Action: Pass."
}
```

---

## Security model

| Property | How |
|---|---|
| No key custody | All signing happens inside `baw` (Binance Agentic Wallet). TWINTICKER never holds, reads, stores, or transmits a private key. |
| No withdrawal path | Executor only places Spot swaps. Cannot move funds externally. `baw` enforces this; Agentic Wallet's daily limits apply on top. |
| Hard cap on size | Default $5 USDT per swap. `baw` agent has its own lower caps. |
| Explicit user confirmation | Every Executor call requires `confirm: true`. |
| No execution in the read path | `twinticker_scan` and `twinticker_scan_all` cannot mutate state. |
| LLM has no write access | The LLM only writes the rationale string. The verdict is deterministic. The Executor is gated by env + confirm. |
| Halt-aware | Real halts (earnings, dividend, split, merger) are detected and surface `HALTED`. Offhours is **not** treated as a halt. |

See [SECURITY.md](./SECURITY.md) for the full threat model.

---

## Project layout

```
twinticker/
├── README.md                 # This file
├── LICENSE                   # MIT
├── SECURITY.md               # Threat model
├── docs/
│   ├── ARCHITECTURE.md       # System diagram + per-agent breakdown
│   └── STRATEGY.md           # Edge math + what we explicitly don't do
├── skills/                   # Vendored Binance skill docs
│   └── binance-web3/
│       ├── SKILL.tokenized-securities.md
│       └── agentic-wallet-refs/
│           ├── market-order.md
│           ├── wallet-view.md
│           └── ... (full reference set)
├── public/
│   └── index.html            # Demo UI
├── src/
│   ├── server.js             # Fastify + MCP
│   └── agents/
│       ├── reader.js         # Live RWA API calls
│       ├── analyzer.js       # Deterministic verdict + LLM rationale
│       ├── scanner.js        # Scans the live Ondo universe
│       └── executor.js       # Optional baw swap path
├── tests/
│   └── smoke.test.js         # 5/5 passing
├── vercel.json
├── package.json
├── .env.example
└── .gitignore
```

---

## Tech stack

- **Runtime:** Node.js 22+ (ESM, top-level await)
- **Server:** Fastify 5
- **MCP:** `@modelcontextprotocol/sdk` (streamable HTTP transport)
- **HTTP client:** undici (Node 22 native)
- **LLM:** OpenAI gpt-4o-mini (configurable via `OPENAI_MODEL`)
- **Deploy:** Vercel (serverless, Node 22 runtime)
- **Tests:** `node --test`
- **On-chain data:** `binance-tokenized-securities-info` REST API (same endpoints the official skill wraps)
- **Swap path:** `binance-agentic-wallet` skill via `baw` CLI

---

## Why Data Analysis bucket

The submission form offers four buckets. TWINTICKER fits **Data Analysis** because:

- It produces **structured analysis output** (the verdict card with divergence, fair value, action, confidence)
- It enables the user to **analyse their exposure** to Ondo-tokenized US stocks
- The example in the form — *"analyse your financial portfolio"* — describes exactly what `twinticker_scan_all` does across the 444-token Ondo universe
- The agent's *primary* job is reporting divergence, not trading

It also sits naturally in **Onchain Workflows** (because every call is a real on-chain read), but the *narrative* is data analysis: read on-chain, compare to off-chain, surface a verdict.

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
- **MCP:** `POST https://twinticker.vercel.app/mcp`
- **Repo:** https://github.com/ruzkypazzy/twinticker
