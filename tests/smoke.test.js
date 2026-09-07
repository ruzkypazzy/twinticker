// Smoke tests for TWINTICKER
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReader, ONDO_TOKENS } from '../src/agents/reader.js';
import { runAnalyzer } from '../src/agents/analyzer.js';
import { scanAll } from '../src/agents/scanner.js';

test('ONDO_TOKENS has the 10 expected symbols', () => {
  const expected = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'JPM', 'SPY', 'QQQ'];
  for (const s of expected) {
    assert.ok(ONDO_TOKENS[s], `missing ${s}`);
    assert.equal(typeof ONDO_TOKENS[s].multiplier, 'number');
  }
});

test('Reader returns structured data for a known symbol', async () => {
  const r = await runReader('NVDA');
  assert.equal(r.symbol, 'NVDA');
  assert.ok(r.name);
  assert.ok(r.chain);
  assert.equal(typeof r.multiplier, 'number');
  assert.ok(r.fetchedAt);
  // usStock is either { price: number, source: 'stooq'|'fallback' } or has an error
  assert.ok(r.usStock);
  assert.ok(['stooq', 'fallback'].includes(r.usStock.source));
});

test('Reader rejects unknown symbol gracefully', async () => {
  const r = await runReader('NOTREAL');
  assert.equal(r.error, 'unsupported_symbol');
  assert.ok(Array.isArray(r.supported));
});

test('Analyzer returns a valid verdict shape', async () => {
  const reader = await runReader('AAPL');
  const verdict = await runAnalyzer(reader);
  assert.ok(['FAIR_VALUE', 'UNDERVALUED', 'OVERVALUED', 'NO_DATA', 'HALTED'].includes(verdict.verdict));
  // action is one of {PASS, BUY, SELL_OR_PASS} for data verdicts; NO_DATA has no action
  if (verdict.verdict !== 'NO_DATA') {
    assert.ok(['PASS', 'BUY', 'SELL_OR_PASS'].includes(verdict.action));
  }
  assert.ok(typeof verdict.rationale === 'string' && verdict.rationale.length > 0);
});

test('Scanner returns ranked list', async () => {
  const results = await scanAll();
  assert.equal(results.length, Object.keys(ONDO_TOKENS).length);
  for (const r of results) {
    assert.ok(r.symbol);
    assert.ok(r.verdict);
  }
});
