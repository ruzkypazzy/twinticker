// Scanner agent — discovers the Ondo token universe and runs the full
// Reader+Analyzer pipeline. Picks the best chain per ticker (BSC preferred
// for liquidity) and de-dupes.

import { runReader, fetchOndoTokenList } from './reader.js';
import { runAnalyzer } from './analyzer.js';

// Curated list of the most liquid / best-known Ondo Global Markets tickers.
// Used as a fallback if the live token list is unreachable, and as the
// default for the demo UI chips.
const FALLBACK_TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'JPM', 'SPY', 'QQQ'];

export async function scanAll() {
  // Discover the live Ondo token universe. Filter to BSC + Ondo type=1,
  // and dedupe by ticker (BSC preferred over ETH for liquidity).
  let tickers = [];
  try {
    const list = await fetchOndoTokenList('56', 1);
    const seen = new Set();
    for (const t of list) {
      const tkr = (t.ticker || '').toUpperCase();
      if (!tkr) continue;
      if (String(t.chainId) !== '56') continue;
      if (seen.has(tkr)) continue;
      seen.add(tkr);
      tickers.push(tkr);
    }
  } catch (_) { /* fall through */ }

  if (tickers.length === 0) tickers = FALLBACK_TICKERS;

  const settled = await Promise.allSettled(
    tickers.map(async (s) => {
      const data = await runReader(s);
      const verdict = await runAnalyzer(data);
      return { ...data, ...verdict };
    }),
  );
  return settled
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .sort((a, b) => {
      // Put NO_DATA at the bottom
      if (a.verdict === 'NO_DATA' && b.verdict !== 'NO_DATA') return 1;
      if (b.verdict === 'NO_DATA' && a.verdict !== 'NO_DATA') return -1;
      return Math.abs(b.divergenceBps || 0) - Math.abs(a.divergenceBps || 0);
    });
}

export { FALLBACK_TICKERS };
