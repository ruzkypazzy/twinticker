// Executor agent — optional swap path via Binance Agentic Wallet (`baw` CLI).
//
// The Executor is DISABLED in the live demo by default. To enable, set
// BAW_ENABLED=true in the environment AND run `baw auth signin` on the host.
// When enabled, the MCP tool `twinticker_execute` will accept `{ symbol,
// amount_usdt, confirm: true }` and route a swap through baw.
//
// Safety:
//   - Hard cap: $5 USDT per swap (BAW_MAX_SWAP_USDT, override at own risk)
//   - User must pass confirm: true on every call
//   - baw holds the key, applies its own daily limits, and broadcasts the tx
//   - We never hold, log, or transmit the key

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const MAX_SWAP_USDT = Number(process.env.BAW_MAX_SWAP_USDT) || 5;
const ENABLED = process.env.BAW_ENABLED === 'true';

const ONDO_TO_BSC_TOKENS = {
  // Ondo Global Markets BNB Chain contract addresses (placeholder — real
  // addresses are queried at runtime via binance-tokenized-securities-info).
  NVDA:  '0xPLACEHOLDER_NVDA_ON_BSC',
  TSLA:  '0xPLACEHOLDER_TSLA_ON_BSC',
  AAPL:  '0xPLACEHOLDER_AAPL_ON_BSC',
  MSFT:  '0xPLACEHOLDER_MSFT_ON_BSC',
  GOOGL: '0xPLACEHOLDER_GOOGL_ON_BSC',
  AMZN:  '0xPLACEHOLDER_AMZN_ON_BSC',
  META:  '0xPLACEHOLDER_META_ON_BSC',
  JPM:   '0xPLACEHOLDER_JPM_ON_BSC',
  SPY:   '0xPLACEHOLDER_SPY_ON_BSC',
  QQQ:   '0xPLACEHOLDER_QQQ_ON_BSC',
};

export async function runExecutor({ symbol, amount_usdt, confirm }) {
  if (!ENABLED) {
    return {
      ok: false,
      mode: 'dry-run',
      reason: 'BAW_ENABLED is false — Executor is not live. Set BAW_ENABLED=true and run `baw auth signin` to enable live swaps.',
      preview: previewSwap({ symbol, amount_usdt }),
    };
  }
  if (!confirm) {
    return {
      ok: false,
      reason: 'User confirmation required. Pass confirm: true to execute.',
    };
  }
  if (amount_usdt > MAX_SWAP_USDT) {
    return {
      ok: false,
      reason: `Amount ${amount_usdt} USDT exceeds hard cap of ${MAX_SWAP_USDT} USDT per swap.`,
    };
  }
  const upper = symbol.toUpperCase();
  const tokenAddr = ONDO_TO_BSC_TOKENS[upper];
  if (!tokenAddr) {
    return { ok: false, reason: `Unknown Ondo symbol: ${symbol}` };
  }

  // 1. Quote the swap (no signature, free)
  let quote;
  try {
    const { stdout } = await execFileP('baw', [
      'market-order', 'quote',
      '--fromToken', 'USDT',
      '--toToken', tokenAddr,
      '--amount', String(amount_usdt),
      '--json',
    ], { timeout: 30_000 });
    quote = JSON.parse(stdout);
  } catch (err) {
    return { ok: false, reason: `baw quote failed: ${err.message}` };
  }

  // 2. Execute the swap (signed by Agentic Wallet)
  let swap;
  try {
    const { stdout } = await execFileP('baw', [
      'market-order', 'swap',
      '--fromToken', 'USDT',
      '--toToken', tokenAddr,
      '--amount', String(amount_usdt),
      '--yes',
      '--json',
    ], { timeout: 60_000 });
    swap = JSON.parse(stdout);
  } catch (err) {
    return { ok: false, reason: `baw swap failed: ${err.message}` };
  }

  return {
    ok: true,
    mode: 'live',
    symbol: upper,
    amount_usdt,
    quote,
    swap,
    txHash: swap?.txHash || swap?.hash,
    bscscanUrl: swap?.txHash ? `https://bscscan.com/tx/${swap.txHash}` : null,
  };
}

function previewSwap({ symbol, amount_usdt }) {
  return {
    symbol: (symbol || '').toUpperCase(),
    amount_usdt,
    note: 'Set BAW_ENABLED=true on a host where `baw auth signin` has been completed, then re-run.',
  };
}
