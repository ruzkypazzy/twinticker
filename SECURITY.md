# Security model

## Threat model

TWINTICKER is a **read-mostly** agent. The only write path is the optional
Executor, which routes swaps through the user's own Binance Agentic Wallet
(`baw` CLI) — never through TWINTICKER's own keys.

## Properties we maintain

| Property | How |
|---|---|
| **No key custody** | All signing happens inside `baw` (Binance Agentic Wallet). TWINTICKER never holds, reads, stores, or transmits a private key. |
| **No withdrawal path** | The Executor only places Spot swaps. It cannot move funds to external addresses. `baw` enforces this; the Agentic Wallet's daily limits apply on top. |
| **Hard cap on size** | Default `BAW_MAX_SWAP_USDT=5`. Overridable via env, but the `baw` agent has its own lower caps. |
| **Explicit user confirmation** | Every Executor call requires `confirm: true`. Without it, the call returns a dry-run preview only. |
| **No execution in the read path** | `twinticker_scan` and `twinticker_scan_all` are read-only MCP tools. They cannot mutate any state. |
| **LLM has no write access** | The LLM only writes the rationale string. It does not control the verdict (which is deterministic) or the Executor (which is gated by env + confirm). |

## What the verdict engine guarantees

- The verdict is **deterministic** — same inputs always produce the same verdict.
- The LLM is only used to **explain** the verdict in natural language. It cannot flip a `FAIR_VALUE` into a `BUY`.
- The threshold semantics (50 bps = FAIR_VALUE, 200 bps = high confidence) are baked into the code and visible in the source.

## What TWINTICKER does not do

- It does **not** make price predictions. It only reports the *current* divergence.
- It does **not** auto-execute. Even with `BAW_ENABLED=true`, every swap requires `confirm: true`.
- It does **not** read the user's main Binance account. Only the Agentic sub-account that the user has explicitly signed into via `baw`.
- It does **not** log, store, or transmit the user's API key, secret, or any auth material.

## Reporting issues

Open an issue on GitHub: https://github.com/ruzkypazzy/twinticker/issues

For security-sensitive issues, contact the maintainer directly rather than opening a public issue.
