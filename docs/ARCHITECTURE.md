# TWINTICKER — architecture

## High level

```
                              ┌────────────────────────────────┐
                              │  Public demo (Vercel)          │
                              │  https://twinticker.vercel.app  │
                              └────────────────┬───────────────┘
                                               │
                ┌──────────────────────────────┼──────────────────────────┐
                │                              │                          │
                ▼                              ▼                          ▼
        ┌──────────────┐              ┌──────────────┐           ┌──────────────┐
        │  REST API    │              │  MCP server  │           │  Static UI   │
        │  /api/scan/* │              │  /mcp        │           │  /           │
        └──────┬───────┘              └──────┬───────┘           └──────────────┘
               │                             │
               └──────────────┬──────────────┘
                              ▼
                  ┌────────────────────┐
                  │  3-agent pipeline  │
                  │  Reader → Analyzer │
                  │  → Executor        │
                  └────────┬───────────┘
                           │
        ┌──────────────────┼─────────────────────┐
        ▼                  ▼                     ▼
  ┌──────────┐     ┌──────────────┐     ┌──────────────┐
  │ Yahoo /  │     │ binance-     │     │  OpenAI      │
  │ Stooq /  │     │ tokenized-   │     │  gpt-4o-     │
  │ fallback │     │ securities-  │     │  mini        │
  │ (US      │     │ info skill   │     │  (rationale) │
  │ equity)  │     │ (on-chain)   │     │              │
  └──────────┘     └──────────────┘     └──────────────┘
```

## Three agents

### 1. Reader (`src/agents/reader.js`)

Pure data layer. Pulls two prices for the requested symbol:

- **On-chain token price** — from the `binance-tokenized-securities-info`
  skill via the Binance MCP server (production) or a deterministic demo
  spread (this build).
- **US equity price** — from Yahoo Finance's public quote endpoint,
  with a Stooq CSV fallback, and a curated realistic fallback for
  blocked environments.

Also returns the `multiplier`, the chain (`BSC`), and a `fetchedAt`
timestamp. Output is a flat JSON object.

### 2. Analyzer (`src/agents/analyzer.js`)

Deterministic verdict engine. Computes `divergenceBps` from the two
prices, applies the multiplier, and picks one of:
`FAIR_VALUE` / `UNDERVALUED` / `OVERVALUED` / `HALTED` / `NO_DATA`.

Then asks the LLM to write a 1-2 sentence rationale. The LLM has no
authority over the verdict — it only explains it.

### 3. Executor (`src/agents/executor.js`)

Optional. Disabled by default. When enabled via `BAW_ENABLED=true` on a
host where `baw auth signin` has been run, accepts
`{ symbol, amount_usdt, confirm: true }` and routes a Spot swap through
the Binance Agentic Wallet.

## MCP transport

Streamable HTTP at `POST /mcp`. Compatible with any MCP client (Claude
Code, Cursor, Codex, ChatGPT, VS Code). Tools:

| Tool | Args | Read/Write |
|---|---|---|
| `twinticker_scan` | `{ symbol }` | read |
| `twinticker_scan_all` | `{}` | read |
| `twinticker_execute` | `{ symbol, amount_usdt, confirm }` | write (gated) |

## REST API

For non-MCP callers and for the demo UI:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Demo page (HTML) |
| `GET` | `/health` | Liveness check |
| `GET` | `/api/scan/:symbol` | Single-symbol verdict |
| `GET` | `/api/scan-all` | All 10 tokens, ranked |
| `POST` | `/mcp` | MCP streamable HTTP |

## Why Fastify over Express

Fastify 5 ships with built-in JSON schema validation, faster JSON
serialization, and native async/await. We get cleaner code and lower
latency on the verdict path. The server is small (~150 lines) so the
framework choice is a small surface area.

## Why undici over node-fetch

Node 22 ships undici natively. Using it avoids the extra dependency and
gives us connection pooling, HTTP/2, and predictable timeouts out of the
box.
