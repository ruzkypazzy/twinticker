# TWINTICKER — Submission package

Everything you need to submit the Track A entry. Use the contents verbatim
or edit as you wish.

---

## 1. X (Twitter) post — to quote-repost @Binance/status/2094810011557838988

**Header text** (the quote-repost caption, 280 char limit):

> Submitting **TWINTICKER** to @binance Agent OS Hackathon (Track A — Data Analysis).
>
> Two tickers, one truth. An AI agent that watches Ondo tokenized US stocks on BNB Chain, compares them to the underlying equity, and flags divergence in real time.
>
> 🔗 https://twinticker.vercel.app
> 💻 https://github.com/ruzkypazzy/twinticker
>
> Built on binance-tokenized-securities-info + binance-agentic-wallet.
>
> #BinanceAgentOS #BinanceHackathon

**Required follow-up steps before posting:**

1. Follow @Binance
2. Repost (not quote-repost) the original announcement post
3. Then quote-repost with the caption above (attach proof screenshots if you want)

---

## 2. Survey form answer

URL: https://app.binance.com/uni-qr/user-survey/2913aa200aac462c89a737779393f3d4

### Question 1: *Which theme does your submission fall under?*

> **Data Analysis** (e.g. Creating daily, monthly reports, market analysis, analyse your financial portfolio)

### Question 2: *Please provide a text description of your project, including a brief introduction to your agent or workflow.*

> **TWINTICKER — Two tickers, one truth.**
>
> TWINTICKER is an AI agent on Binance Agent OS that watches Ondo Global Markets tokenized US stocks on BNB Chain and compares them to their underlying US equity in real time. It reads the live on-chain token price from the official `binance-tokenized-securities-info` skill (RWA Dynamic V2 endpoint), reads the live US equity reference price from the same API's `stockInfo` field, applies the Ondo `sharesMultiplier`, and surfaces a structured verdict card per symbol: `FAIR_VALUE`, `UNDERVALUED`, `OVERVALUED`, `HALTED`, or `NO_DATA`.
>
> The agent is a 3-stage pipeline (Reader → Analyzer → Executor) and exposes three tools over MCP streamable HTTP: `twinticker_scan`, `twinticker_scan_all`, and `twinticker_execute` (the last routes a Spot swap through the `binance-agentic-wallet` skill's `baw` CLI, gated by `confirm: true` and a $5 hard cap). The LLM (gpt-4o-mini) only writes the natural-language rationale — the verdict itself is deterministic.
>
> The agent covers all 444 Ondo Global Markets tokens on BSC. It correctly handles `sharesMultiplier` (e.g. SPY/QQQ at 0.1x) and distinguishes real corporate-action halts (EARNINGS_HALT, DIVIDEND_HALT, SPLIT_HALT) from offhours, where the US market is closed and the on-chain token just tracks the last equity close.
>
> Live demo: https://twinticker.vercel.app
> MCP endpoint: POST https://twinticker.vercel.app/mcp
> Repo: https://github.com/ruzkypazzy/twinticker

### Question 3: *Which platform did you post your video on?*

> YouTube (or Loom — see the demo video upload instructions below)

---

## 3. Demo video (60-90 sec) — how to record

If you record it yourself, here's the exact 8-step script:

| Step | What to show on screen | Time |
|---:|---|---:|
| 1 | `https://twinticker.vercel.app` loading | 0-5s |
| 2 | The hero text "Watch Ondo tokenized US stocks on BNB Chain. Live." | 5-10s |
| 3 | Click the `AMZN` chip — watch the verdict card render with the LLM rationale and the live on-chain price | 10-25s |
| 4 | Scroll the page to show the "How it works" panel — call out the 3-agent architecture | 25-35s |
| 5 | Open a new tab → `https://github.com/ruzkypazzy/twinticker` — show the README, the `skills/binance-web3/` vendored docs, the project structure | 35-50s |
| 6 | In the GitHub tab, click into `src/agents/reader.js` and show the live `binance-tokenized-securities-info` API call (highlight the URL) | 50-60s |
| 7 | In a third tab, open a terminal. Run: `curl -X POST https://twinticker.vercel.app/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` — show the 3 MCP tools | 60-75s |
| 8 | End on the live demo page, with the verdict card visible | 75-90s |

**Voiceover suggestions** (or just record screen and let the visual carry it):

> *"TWINTICKER is an AI agent on Binance Agent OS that watches Ondo tokenized US stocks on BNB Chain and compares them to the underlying US equity in real time. Every price here is real — pulled from the official binance-tokenized-securities-info skill. The verdict is deterministic, the rationale is written by gpt-4o-mini. Three MCP tools, streamable HTTP, ready for Claude Code, Codex, Cursor, ChatGPT. Two tickers, one truth."*

Upload to YouTube as **unlisted**, then paste the link in the survey form.

---

## 4. Files to attach (if the form allows)

If the form has an "attach files" or "supplementary materials" field, the most important files in the repo are:

- `README.md` — full architecture, API reference, security model
- `SECURITY.md` — threat model
- `docs/ARCHITECTURE.md` — system diagram
- `docs/STRATEGY.md` — edge math
- `skills/binance-web3/SKILL.tokenized-securities.md` — vendored Binance skill (proves we're using the real API)
- `src/agents/reader.js` — the live RWA API integration
- `src/agents/analyzer.js` — the deterministic verdict + LLM rationale
- `src/agents/executor.js` — the optional baw swap path
- `tests/smoke.test.js` — 5/5 passing smoke tests

---

## 5. Quote-repost screenshot plan (optional but recommended)

If you want a strong quote-repost, capture these screenshots before posting:

1. The demo page with a non-trivial verdict (e.g. AMZN showing OVERVALUED, or NVDA showing HALTED if Nvidia happens to be in a corporate-action window during your demo). Save as `demo-verdict.png`.
2. The `/api/scan-all` response (or a screenshot of the demo page showing the ranked grid). Save as `scan-all.png`.
3. The MCP `tools/list` output showing 3 tools. Save as `mcp-tools.png`.

These are not required, but they make the quote-repost much stronger.
