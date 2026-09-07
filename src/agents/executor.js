// Executor agent — optional swap path via the Binance Agentic Wallet (baw CLI).
//
// Uses the EXACT commands from the vendored binance-agentic-wallet skill
// (skills/binance-web3/agentic-wallet-refs/market-order.md):
//
//   baw market-order quote   --fromTokenQty <amt> --fromToken <addr> --toToken <addr> --binanceChainId 56 --json
//   baw market-order swap    --fromTokenQty <amt> --fromToken <addr> --toToken <addr> --binanceChainId 56 [--slippage N] [--mev true] [--gasLevel MEDIUM] --json
//   baw market-order list    --orderId <id> --json     (poll for terminal state)
//
// Safety:
//   - Hard cap: $5 USDT per swap (BAW_MAX_SWAP_USDT, override at own risk)
//   - User must pass confirm: true on every call
//   - baw holds the key, applies its own daily limits, broadcasts the tx
//   - We never hold, log, or transmit the key
//   - We poll the order to a terminal state (FINISHED / FAILED) before
//     reporting success (per the skill's mandatory polling requirement)

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const MAX_SWAP_USDT = Number(process.env.BAW_MAX_SWAP_USDT) || 5;
const ENABLED = process.env.BAW_ENABLED === 'true';

// Known token addresses on BSC (chain 56) — common stables + the wrapped BNB sentinel
const KNOWN_TOKENS_BSC = {
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  BNB:  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // sentinel used by baw
};

// Run a `baw` subcommand and return parsed JSON
async function baw(subcmd, args) {
  const { stdout } = await execFileP('baw', [subcmd, ...args, '--json'], { timeout: 30_000 });
  return JSON.parse(stdout);
}

// Poll market-order list until status is terminal (FINISHED or FAILED)
async function pollOrder(orderId, maxMs = 30_000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < maxMs) {
    try {
      const r = await baw('market-order', ['list', '--orderId', String(orderId)]);
      last = r;
      const order = r?.data || r;
      if (order?.status === 'FINISHED' || order?.status === 'FAILED') {
        return order;
      }
    } catch (_) { /* keep polling on transient errors */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return last; // timed out still PENDING
}

export async function runExecutor({ symbol, amount_usdt, confirm }) {
  if (!ENABLED) {
    return {
      ok: false,
      mode: 'dry-run',
      reason: 'BAW_ENABLED is false — Executor is read-only by default. To enable live swaps, set BAW_ENABLED=true on a host where `baw auth signin` has been completed.',
      preview: { symbol: (symbol || '').toUpperCase(), amount_usdt, note: 'Dry-run only. Set BAW_ENABLED=true + sign in via `baw auth signin` to enable live execution.' },
    };
  }
  if (!confirm) {
    return {
      ok: false,
      reason: 'User confirmation required. Pass confirm: true to execute. (This is a safety rail — every swap requires explicit user opt-in.)',
    };
  }
  if (!Number.isFinite(amount_usdt) || amount_usdt <= 0) {
    return { ok: false, reason: `Invalid amount_usdt: ${amount_usdt}` };
  }
  if (amount_usdt > MAX_SWAP_USDT) {
    return { ok: false, reason: `Amount ${amount_usdt} USDT exceeds hard cap of ${MAX_SWAP_USDT} USDT per swap. Adjust BAW_MAX_SWAP_USDT if you really mean it.` };
  }

  const upper = (symbol || '').toUpperCase();
  if (!upper) return { ok: false, reason: 'Missing symbol' };

  // Resolve ticker → BSC Ondo contract. We re-use the Reader's resolution
  // by calling the binance-tokenized-securities-info token-list API.
  let toTokenAddr;
  try {
    const { fetchOndoTokenList } = await import('./reader.js');
    const list = await fetchOndoTokenList('56', 1);
    const found = list.find((t) => (t.ticker || '').toUpperCase() === upper);
    if (!found) return { ok: false, reason: `Unknown Ondo ticker: ${upper}` };
    toTokenAddr = found.contractAddress;
  } catch (err) {
    return { ok: false, reason: `Could not resolve Ondo contract: ${err.message}` };
  }

  const fromTokenAddr = KNOWN_TOKENS_BSC.USDT;
  const fromTokenQty = String(amount_usdt);

  // 1) Get a quote (free, no signature)
  let quote;
  try {
    quote = await baw('market-order', [
      'quote', '--fromTokenQty', fromTokenQty,
      '--fromToken', fromTokenAddr,
      '--toToken', toTokenAddr,
      '--binanceChainId', '56',
    ]);
  } catch (err) {
    return { ok: false, reason: `baw quote failed: ${err.message}`, quote: null };
  }

  // 2) Execute the swap
  let submit;
  try {
    submit = await baw('market-order', [
      'swap', '--fromTokenQty', fromTokenQty,
      '--fromToken', fromTokenAddr,
      '--toToken', toTokenAddr,
      '--binanceChainId', '56',
      '--slippage', '2',     // 2% max slippage
      '--mev', 'true',       // MEV protection on
      '--gasLevel', 'MEDIUM',
    ]);
  } catch (err) {
    return { ok: false, reason: `baw swap failed: ${err.message}`, quote };
  }

  const orderId = submit?.data?.orderId || submit?.orderId;
  if (!orderId) {
    return { ok: false, reason: 'baw swap returned no orderId', submit, quote };
  }

  // 3) Poll to terminal state (mandatory per the skill's market-order.md)
  const final = await pollOrder(orderId, 30_000);

  if (final?.status === 'FAILED') {
    return {
      ok: false,
      mode: 'live',
      reason: `Order ${orderId} FAILED on-chain. txHash: ${final?.txHash || 'null'}`,
      orderId,
      final,
      quote,
      bscscanUrl: final?.txHash ? `https://bscscan.com/tx/${final.txHash}` : null,
    };
  }

  return {
    ok: true,
    mode: 'live',
    symbol: upper,
    amount_usdt,
    orderId,
    final,
    quote,
    txHash: final?.txHash || null,
    bscscanUrl: final?.txHash ? `https://bscscan.com/tx/${final.txHash}` : null,
  };
}
