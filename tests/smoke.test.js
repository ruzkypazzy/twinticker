import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReader, fetchOndoTokenList } from '../src/agents/reader.js';
import { runAnalyzer } from '../src/agents/analyzer.js';
import { scanAll } from '../src/agents/scanner.js';

test('fetchOndoTokenList returns the live Ondo token universe', async () => {
  const list = await fetchOndoTokenList('56', 1);
  assert.ok(Array.isArray(list));
  assert.ok(list.length > 0, 'token list should not be empty');
  for (const t of list) {
    assert.ok(t.ticker, 'each entry has a ticker');
    assert.ok(t.contractAddress, 'each entry has a contractAddress');
    assert.ok(t.chainId);
  }
});

test('Reader returns structured data for a known symbol', async () => {
  const r = await runReader('NVDA');
  assert.equal(r.symbol, 'NVDA');
  assert.ok(r.chain);
  assert.equal(typeof r.multiplier, 'number');
  assert.ok(r.fetchedAt);
  assert.ok(r.usStock);
  assert.ok(['yahoo', 'stooq', 'fallback-curated', 'no-data'].includes(r.usStock.source));
  assert.equal(r.onchain.source, 'binance-tokenized-securities-info');
});

test('Reader rejects unknown symbol gracefully', async () => {
  const r = await runReader('NOTREAL123XYZ');
  // It won't reject — it'll just return NO_DATA verdict because no contract resolves
  assert.equal(r.symbol, 'NOTREAL123XYZ');
  assert.equal(r.onchain.contractAddress, null);
});

test('Analyzer returns a valid verdict shape', async () => {
  const reader = await runReader('AAPL');
  const verdict = await runAnalyzer(reader);
  assert.ok(['FAIR_VALUE', 'UNDERVALUED', 'OVERVALUED', 'NO_DATA', 'HALTED'].includes(verdict.verdict));
  if (verdict.verdict !== 'NO_DATA') {
    assert.ok(['PASS', 'BUY', 'SELL_OR_PASS'].includes(verdict.action));
  }
  assert.ok(typeof verdict.rationale === 'string' && verdict.rationale.length > 0);
});

test('Scanner returns ranked list', async () => {
  const results = await scanAll();
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0, 'scanner should return at least one result');
  for (const r of results) {
    assert.ok(r.symbol);
    assert.ok(r.verdict);
  }
});
