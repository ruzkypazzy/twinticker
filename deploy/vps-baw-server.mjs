#!/usr/bin/env node
// TWINTICKER VPS-side executor wrapper.
//
// Exposes a tiny HTTP API on 127.0.0.1:8088 that wraps the `baw` CLI.
// Cloudflare Tunnel exposes this to the public internet as
// https://baw.<your-domain>. A shared-secret header protects the
// /execute endpoint so a leaked URL alone can't drain the wallet.
//
// Endpoints:
//   GET  /health     → {ok:true, baw: <version>, address: <bsc addr>}
//   POST /quote      → runs `baw market-order quote` (no key needed)
//   POST /execute    → runs `baw market-order swap`  (requires X-TT-Secret)
//
// IMPORTANT: this server binds to 127.0.0.1 only. Cloudflare Tunnel
// is the only public entry. There is no direct internet exposure.

import Fastify from 'fastify';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const SECRET = process.env.TT_BRIDGE_SECRET || '';
const BIND = '127.0.0.1';
const PORT = Number(process.env.TT_BRIDGE_PORT) || 8088;

if (!SECRET) {
  console.error('TT_BRIDGE_SECRET env var is required. Refusing to start.');
  process.exit(1);
}

const fastify = Fastify({ logger: { level: 'info' } });

// BSC addresses we know about — the executor already has these.
// USDT on BSC = 0x55d398326f99059fF775485246999027B3197955
const BSC_CHAIN = '56';

async function baw(subcmd, args) {
  try {
    const { stdout } = await execFileP('baw', [subcmd, ...args, '--json'], { timeout: 30_000 });
    return { ok: true, data: JSON.parse(stdout) };
  } catch (err) {
    return { ok: false, error: err.message, stdout: err.stdout, stderr: err.stderr };
  }
}

fastify.get('/health', async () => {
  const status = await baw('wallet', ['status']);
  const addr = await baw('wallet', ['address']);
  return {
    ok: true,
    baw: status?.data?.data,
    addresses: addr?.data?.data?.addresses || [],
  };
});

// GET /quote?fromToken=<addr>&toToken=<addr>&fromTokenQty=<amt>
fastify.get('/quote', async (req) => {
  const { fromToken, toToken, fromTokenQty } = req.query;
  if (!fromToken || !toToken || !fromTokenQty) {
    return { ok: false, error: 'fromToken, toToken, fromTokenQty required' };
  }
  const r = await baw('market-order', ['quote', '--fromTokenQty', String(fromTokenQty), '--fromToken', fromToken, '--toToken', toToken, '--binanceChainId', BSC_CHAIN]);
  return r;
});

// POST /execute
//   headers: X-TT-Secret: <secret>
//   body: { fromToken, toToken, fromTokenQty, slippage?, mev?, gasLevel? }
fastify.post('/execute', async (req, reply) => {
  if (req.headers['x-tt-secret'] !== SECRET) {
    reply.code(401);
    return { ok: false, error: 'unauthorized' };
  }
  const { fromToken, toToken, fromTokenQty, slippage, mev, gasLevel } = req.body || {};
  if (!fromToken || !toToken || !fromTokenQty) {
    reply.code(400);
    return { ok: false, error: 'fromToken, toToken, fromTokenQty required' };
  }
  // Hard cap: 5 USDT per swap (defense in depth — the executor on the
  // twinticker server has the same cap)
  if (Number(fromTokenQty) > 5) {
    reply.code(400);
    return { ok: false, error: 'fromTokenQty exceeds 5 USDT cap' };
  }
  const args = ['swap', '--fromTokenQty', String(fromTokenQty), '--fromToken', fromToken, '--toToken', toToken, '--binanceChainId', BSC_CHAIN];
  if (slippage) args.push('--slippage', String(slippage));
  if (mev) args.push('--mev', String(mev));
  if (gasLevel) args.push('--gasLevel', String(gasLevel));
  return await baw('market-order', args);
});

fastify.listen({ host: BIND, port: PORT }, (err) => {
  if (err) {
    console.error('listen failed:', err);
    process.exit(1);
  }
  console.log(`[tt-bridge] listening on http://${BIND}:${PORT}`);
});
