# TWINTICKER

> **Two tickers, one truth.**
> TWINTICKER is an AI agent on **Binance Agent OS** that watches Ondo tokenized US stocks on BNB Chain and compares them to the underlying US equity in real time. It flags divergence, explains why it matters, and — with user confirmation — can swap into the mispriced token via the **Binance Agentic Wallet**.

**Live demo:** https://twinticker.vercel.app
**MCP endpoint:** `https://twinticker.vercel.app/mcp` (streamable HTTP, POST)
**GitHub:** https://github.com/ruzkypazzy/twinticker

---

## Use the live endpoint in 10 seconds

The hosted endpoint is live at `https://twinticker.vercel.app/mcp`. Point any
MCP-capable LLM client at it and start scanning. No signup, no API key, no
deploy.

**Claude Code (one command):**

```bash
claude mcp add twinticker --transport http https://twinticker.vercel.app/mcp
```

**Any other MCP client** — paste this into its MCP config:

```json
{
  "mcpServers": {
    "twinticker": {
      "url": "https://twinticker.vercel.app/mcp"
    }
  }
}
```

**`curl` / raw HTTP:**

```bash
# 1. List available tools
curl -X POST https://twinticker.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# 2. Scan a single ticker
curl -X POST https://twinticker.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"twinticker_scan","arguments":{"symbol":"NVDA"}}}'

# 3. Scan all tokenized US stocks at once
curl -X POST https://twinticker.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"twinticker_scan_all","arguments":{}}}'
```

Three tools are exposed:

| Tool | What it does |
|---|---|
| `twinticker_scan` | Scan a single Ondo tokenized US stock (e.g. `NVDA`, `TSLA`, `AAPL`) for divergence vs its underlying equity. Returns a verdict card. |
| `twinticker_scan_all` | Scan every available Ondo tokenized US stock. Returns a ranked list by absolute divergence. |
| `twinticker_execute` | (Optional) Execute a USDT → Ondo swap via the Binance Agentic Wallet. Dry-run by default. Requires `confirm:true`. |

REST shortcuts (no JSON-RPC needed):

| Endpoint | What it returns |
|---|---|
| `GET https://twinticker.vercel.app/health` | Liveness probe (`{ok:true,...}`) |
| `GET https://twinticker.vercel.app/api/scan/NVDA` | Verdict card for one symbol |
| `GET https://twinticker.vercel.app/api/scan-all` | All 444 tokenized tickers, ranked |

> **If `claude mcp add --transport http` hangs on first connect** (a known bug
> in Claude Code 2.x's streamable-HTTP client, unrelated to this server), use
> the stdio fallback in [Path C](#path-c--connect-from-your-llm-client-works-with-both-path-a-and-path-b)
> instead. The HTTP endpoint itself is fine — any other client (MCP Inspector,
> `curl`, custom SDK code) works against it.

---

## What TWINTICKER does (in one line)

> Reads the **live on-chain price** of an Ondo-tokenized US stock from the official `binance-tokenized-securities-info` REST API, reads the **live US equity price** from the same API's `stockInfo` field, computes the divergence in basis points, applies the Ondo `sharesMultiplier`, and surfaces a verdict card: `FAIR_VALUE` / `UNDERVALUED` / `OVERVALUED` / `HALTED` / `NO_DATA`.

The verdict is **deterministic**. The natural-language rationale is written by `gpt-4o-mini` from the same data.

---

## Built on Binance Agent OS

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

## Live demo

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

## Setup

Pick the path that matches your goal.

### Path A — Use the hosted instance (zero setup, recommended for trying it out)

The hosted endpoint is already running and free to use. No API keys, no signup, no install.

**In a browser:** open https://twinticker.vercel.app and click any chip.

**From a terminal:**
```bash
curl https://twinticker.vercel.app/api/scan/NVDA
```

**From an MCP client:** point it at `https://twinticker.vercel.app/mcp`. The server returns 3 tools (`twinticker_scan`, `twinticker_scan_all`, `twinticker_execute`). See the client setup table below.

**Limits:** the hosted instance is read-mostly — you can scan as much as you want, but live swaps (the Executor) require you to self-host with your own `baw` wallet session.

### Path B — Self-host (full control, including live swaps)

Requirements: Node.js 22+, npm 10+.

```bash
git clone https://github.com/ruzkypazzy/twinticker.git
cd twinticker
npm install
cp .env.example .env
npm test               # 5/5 smoke tests
npm start              # http://localhost:3000
```

**Environment variables** (all optional, with sensible defaults):

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | _(unset)_ | Enables the LLM-written rationale. Without it, the verdict still works; you get a stub rationale instead. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Any OpenAI-compatible model works (gpt-4o, claude-3-5-sonnet via proxy, ollama models, etc.). |
| `PORT` | `3000` | HTTP port for the server. |
| `LOG_LEVEL` | `info` | Fastify log level. `debug` for verbose. |
| `BAW_ENABLED` | `false` | Enables the live swap Executor. Must also have `baw auth signin` run on the host. |
| `BAW_MAX_SWAP_USDT` | `5` | Hard cap on swap size in USDT. The Agentic Wallet applies its own lower caps on top. |

**Deploy to Vercel** (one-click, same as the hosted instance):

1. Push the repo to GitHub
2. Go to https://vercel.com/new and import the repo
3. Vercel auto-detects Node.js. Add `OPENAI_API_KEY` in **Environment Variables**
4. Click **Deploy**. Your instance is live in ~60 seconds at `<project-name>.vercel.app`

To use a custom domain (e.g. `twinticker.xyz`), add it in Vercel → **Settings** → **Domains**. DNS propagation is usually <5 min.

### Path C — Connect from your LLM client (works with both Path A and Path B)

**Recommended (stdio, works with every MCP client):**

```bash
git clone https://github.com/ruzkypazzy/twinticker
cd twinticker && npm install
claude mcp add twinticker -- node $(pwd)/src/mcp-stdio.js
```

The stdio shim speaks the JSON-RPC protocol over stdin/stdout (the format
Claude Code, Codex, Cursor, Windsurf, and every other MCP client supports
natively) and proxies the calls to the hosted API. No env vars needed.

**Alternative (streamable HTTP, for clients that prefer direct HTTP):**

```bash
claude mcp add twinticker --transport http https://twinticker.vercel.app/mcp
```

Or in any MCP client config:

```json
{
  "mcpServers": {
    "twinticker": {
      "url": "https://twinticker.vercel.app/mcp"
    }
  }
}
```

| Client | Setup | Verified by the project? |
|---|---|---|
| `curl` / any HTTP client | `POST https://twinticker.vercel.app/mcp` with JSON-RPC body | ✅ Yes — `tools/list`, `tools/call` (twinticker_scan), `tools/call` (twinticker_scan_all), and `tools/call` (twinticker_execute dry-run) all return correct responses |
| Claude Code (stdio) | `claude mcp add twinticker -- node /path/to/twinticker/src/mcp-stdio.js` | ✅ Yes — registered on Claude Code 2.1.263, `✔ Connected`, all 3 tools listed |
| MCP Inspector | `npx @modelcontextprotocol/inspector --stdio node /path/to/twinticker/src/mcp-stdio.js` | ✅ Yes — `initialize`, `tools/list`, and `tools/call twinticker_scan` (NVDA) all return correct responses |
| Official MCP SDK (any client built on it) | Streamable HTTP via `@modelcontextprotocol/sdk/client/streamableHttp.js` | ✅ Yes — `initialize` returns in 269ms, `tools/list` in 600ms, `notifications/initialized` acks in <50ms |
| Claude Code (HTTP transport) | `claude mcp add twinticker --transport http https://twinticker.vercel.app/mcp` | ⚠️ Claude Code's specific streamable-HTTP client reports "connection timed out" on its liveness probe. The transport works against the official SDK but Claude Code's client has a bug here. Use the stdio path above instead. |
| Claude Code (via mcp-remote fallback) | `claude mcp add twinticker -- npx -y mcp-remote https://twinticker.vercel.app/mcp` | ⚠️ Tested — `mcp-remote` hangs on its OAuth discovery step. Use the stdio path above instead. |
| Claude Desktop | Add stdio entry pointing at `node /path/to/twinticker/src/mcp-stdio.js` | Should work (uses the same MCP SDK as Claude Code's stdio path) but not tested in this sandbox |
| Cursor | `.cursor/mcp.json` in your project root → `{ "mcpServers": { "twinticker": { "command": "node", "args": ["/path/to/twinticker/src/mcp-stdio.js"] } } }` | Should work but not tested in this sandbox |
| Codex CLI | `codex mcp add twinticker -- node /path/to/twinticker/src/mcp-stdio.js` | Should work but not tested in this sandbox |
| VS Code | Chat → MCP Servers → Add → Stdio → command `node`, args `["/path/to/twinticker/src/mcp-stdio.js"]` | Should work but not tested in this sandbox |

Then ask your LLM: *"Use twinticker_scan_all to find the most mispriced Ondo stock right now."*

### Path D — Fork and customize

The architecture is intentionally small — 3 agents, ~600 lines of code total. To build your own variant:

```bash
git clone https://github.com/ruzkypazzy/twinticker.git my-ticker-watcher
cd my-ticker-watcher
npm install
```

**What to edit for what:**

| You want to... | Edit this file |
|---|---|
| Add or change on-chain data sources | `src/agents/reader.js` — add new skill calls alongside the existing `fetchOndoDynamic()` |
| Change the verdict logic (thresholds, new verdicts) | `src/agents/analyzer.js` — `computeVerdict()` is ~20 lines of math |
| Use a different wallet / DEX for execution | `src/agents/executor.js` — replace the `baw` calls with your own |
| Add new MCP tools | `src/server.js` — add to both `tools/list` and `tools/call` |
| Change the demo page UI | `public/index.html` — single self-contained HTML file, no build step |
| Use a different LLM (Claude, MiniMax, local Ollama) | Set `OPENAI_BASE_URL` + `OPENAI_API_KEY` in `.env` — anything OpenAI-compatible works |

Then test with `npm test` (5/5) and run with `npm start`.

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

## License

MIT — see [LICENSE](./LICENSE).
