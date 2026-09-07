// Scanner agent — runs the Reader + Analyzer over all supported symbols
// and returns a ranked list. Used by /api/scan-all and the demo page.

import { runReader, ONDO_TOKENS } from './reader.js';
import { runAnalyzer } from './analyzer.js';

export async function scanAll() {
  const symbols = Object.keys(ONDO_TOKENS);
  const settled = await Promise.allSettled(
    symbols.map(async (s) => {
      const data = await runReader(s);
      const verdict = await runAnalyzer(data);
      return { ...data, ...verdict };
    }),
  );
  return settled
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .sort((a, b) => Math.abs(b.divergenceBps || 0) - Math.abs(a.divergenceBps || 0));
}
