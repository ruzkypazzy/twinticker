// TWINTICKER — Two tickers, one truth.
// Detects divergence between Ondo tokenized US stocks on BNB Chain
// and their underlying US equity prices.
//
// Built for the Binance Agent OS Mini Hackathon (Track A, 2026-09-08).
// Repo: https://github.com/ruzkypazzy/twinticker

import Fastify from 'fastify';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runReader } from './agents/reader.js';
import { runAnalyzer } from './agents/analyzer.js';
import { scanAll } from './agents/scanner.js';
import { runExecutor } from './agents/executor.js';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const fastify = Fastify({
  logger: { level: LOG_LEVEL },
  // Trust proxy so headers like x-forwarded-for are honored (Vercel sets these)
  trustProxy: true,
});

// MCP streamable HTTP responses: always return text/event-stream.
// Claude Code and mcp-remote both require SSE for the notification
// handshake; clients that prefer JSON can still parse the SSE event
// body (the `data: <json>\n\n` format is well-defined and easy to
// strip). This is the most spec-compliant single response shape.
fastify.addHook('onSend', async (req, reply, payload) => {
  if (req.url !== '/mcp' && !req.url.startsWith('/mcp?')) return payload;
  const ct = reply.getHeader('content-type') || '';
  if (ct.startsWith('text/plain')) return payload; // the GET /mcp info page
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  reply.type('text/event-stream');
  reply.header('Cache-Control', 'no-cache');
  return `data: ${body}\n\n`;
});

// Serve the demo page
fastify.get('/', async (req, reply) => {
  const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf-8');
  reply.type('text/html').send(html);
});

// Serve static assets from public/ (logo images, etc.) with a 1-day
// cache so the browser doesn't re-fetch on every page load.
fastify.get('/logo-:file', async (req, reply) => {
  const { file } = req.params;
  if (!/^[a-z0-9_-]+\.(jpg|jpeg|png|svg|webp|gif|ico)$/i.test(file)) {
    reply.code(400);
    return { error: 'invalid file' };
  }
  try {
    const buf = readFileSync(join(__dirname, '..', 'public', file));
    const ext = file.split('.').pop().toLowerCase();
    const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp', gif: 'image/gif', ico: 'image/x-icon' }[ext];
    reply.type(mime).header('Cache-Control', 'public, max-age=86400').send(buf);
  } catch (err) {
    reply.code(404);
    return { error: 'not found' };
  }
});

fastify.get('/health', async () => ({ ok: true, name: 'twinticker', time: new Date().toISOString() }));

// Human-readable info page for browser visits to /mcp (so people get
// something useful instead of "Not Found"). The MCP endpoint itself is
// POST-only — this is just a courtesy.
//
// IMPORTANT: We return 405 Method Not Allowed here, not 200. The MCP
// streamable-HTTP client (Claude Code, mcp-remote, the official SDK)
// tries GET /mcp to open a server-initiated SSE stream. If we return
// 200 + a body, the client waits forever for events and never sends
// the POST. 405 is the spec-defined "this server doesn't offer a GET
// stream" signal that lets the client move on to POST.
fastify.get('/mcp', async (req, reply) => {
  reply.code(405).type('text/plain').send(`TWINTICKER MCP endpoint

This server uses streamable-HTTP transport (POST only). GET is not supported.

Try it with curl:

  curl -X POST https://twinticker.vercel.app/mcp \\
    -H "Content-Type: application/json" \\
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
`);
});

// OAuth 2.0 Authorization Server Metadata endpoint (RFC 8414). TWINTICKER
// does not require auth. Some MCP clients (mcp-remote, Claude Code) probe
// this endpoint before connecting and will fail if it's missing. We return
// a minimal metadata document that advertises only the "none" auth flow
// so clients that strictly require OAuth discovery will skip the flow
// entirely and proceed with the unauthenticated MCP request.
fastify.get('/.well-known/oauth-authorization-server', async (req, reply) => {
  reply.type('application/json').send({
    issuer: 'https://twinticker.vercel.app',
    authorization_endpoint: 'https://twinticker.vercel.app/.well-known/no-auth',
    token_endpoint: 'https://twinticker.vercel.app/.well-known/no-auth',
    response_types_supported: ['code'],
    grant_types_supported: ['none'],
    code_challenge_methods_supported: [],
    token_endpoint_auth_methods_supported: ['none'],
  });
});

// Catch-all for OAuth endpoints to prevent the client from hanging on a 404.
// These return 200 with a JSON body that signals "no auth required".
fastify.all('/.well-known/no-auth', async (req, reply) => {
  reply.type('application/json').send({ ok: true, no_auth_required: true });
});

// REST: scan a single symbol — returns the verdict card
fastify.get('/api/scan/:symbol', async (req, reply) => {
  const { symbol } = req.params;
  try {
    const data = await runReader(symbol.toUpperCase());
    const verdict = await runAnalyzer(data);
    return { ...data, ...verdict };
  } catch (err) {
    reply.code(500);
    return { error: err.message, symbol };
  }
});

// REST: scan all available tokenized US stocks — ranked by absolute divergence
fastify.get('/api/scan-all', async (req, reply) => {
  try {
    const results = await scanAll();
    return { count: results.length, results };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
});

// ============================================================================
// Bridge to the VPS-hosted Binance Agentic Wallet (baw) instance.
//
// The Vercel-hosted site is a serverless function. It cannot run the
// `baw` CLI directly (it holds a wallet key and requires a long-running
// process). Instead, the site calls into a tiny Fastify bridge that
// lives on the user's VPS (185.2.101.34) and is exposed to the public
// internet via a Cloudflare quick-tunnel.
//
// URLs:
//   TT_BAW_BRIDGE_URL  — e.g. https://<random>.trycloudflare.com
//   TT_BAW_BRIDGE_SECRET — shared secret for the X-TT-Secret header
//
// The browser hits Vercel's /api/quote and /api/execute, which
// forward to the bridge. The secret never leaves the server.
// ============================================================================

const BAW_BRIDGE = process.env.TT_BAW_BRIDGE_URL || '';
const BAW_SECRET = process.env.TT_BAW_BRIDGE_SECRET || '';

async function callBawBridge(path, init = {}) {
  if (!BAW_BRIDGE) {
    return { ok: false, error: 'BAW bridge not configured (set TT_BAW_BRIDGE_URL on the host)' };
  }
  const headers = { ...(init.headers || {}), 'x-tt-secret': BAW_SECRET };
  const res = await fetch(BAW_BRIDGE + path, { ...init, headers });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: text };
  }
}

fastify.get('/api/bridge/health', async (req, reply) => {
  if (!BAW_BRIDGE) {
    reply.code(503);
    return { ok: false, error: 'BAW bridge not configured' };
  }
  return await callBawBridge('/health');
});

// GET /api/quote?fromToken=<addr>&toToken=<addr>&fromTokenQty=<usdt>
fastify.get('/api/quote', async (req, reply) => {
  const { fromToken, toToken, fromTokenQty } = req.query;
  if (!fromToken || !toToken || !fromTokenQty) {
    reply.code(400);
    return { ok: false, error: 'fromToken, toToken, fromTokenQty required' };
  }
  const qs = new URLSearchParams({ fromToken, toToken, fromTokenQty: String(fromTokenQty) });
  return await callBawBridge('/quote?' + qs.toString());
});

// POST /api/execute  body: { fromToken, toToken, fromTokenQty, slippage?, mev?, gasLevel? }
fastify.post('/api/execute', async (req, reply) => {
  if (!BAW_BRIDGE) {
    reply.code(503);
    return { ok: false, error: 'BAW bridge not configured' };
  }
  const body = req.body || {};
  if (!body.fromToken || !body.toToken || !body.fromTokenQty) {
    reply.code(400);
    return { ok: false, error: 'fromToken, toToken, fromTokenQty required' };
  }
  return await callBawBridge('/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
});

// MCP server endpoint (streamable HTTP transport)
fastify.post('/mcp', async (req, reply) => {
  // If the client sent a session ID, echo it back. If this is the
  // initialize request, generate a new session ID.
  if (req.headers['mcp-session-id']) {
    reply.header('mcp-session-id', req.headers['mcp-session-id']);
  } else if (req.body && req.body.method === 'initialize' && req.body.id) {
    reply.header('mcp-session-id', `tt-${req.body.id}-${Date.now()}`);
  }
  // Accept the request even if the body is empty (clients use this as a liveness
  // probe) and even if there's no id (notifications have no id).
  const { jsonrpc, id, method, params } = req.body || {};

  // If the body is empty, just ack — useful for liveness probes.
  // Return 200 with a JSON ack so the SSE wrapper still has a body.
  if (!req.body || Object.keys(req.body).length === 0) {
    reply.code(200);
    return { jsonrpc: '2.0', result: { ack: 'liveness' } };
  }

  if (jsonrpc !== '2.0') {
    reply.code(400);
    return { jsonrpc: '2.0', error: { code: -32600, message: 'invalid_jsonrpc' } };
  }

  // Notifications (no id, no response expected) — accept any of them, even
  // liveness probes that omit the method field. Return 200 with a JSON ack.
  if (!id) {
    reply.code(200);
    return { jsonrpc: '2.0', result: { ack: method || 'notification' } };
  }

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'twinticker', version: '0.1.0' },
      },
    };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'twinticker_scan',
            description: 'Scan a single Ondo tokenized US stock for divergence vs its underlying equity. Returns a verdict card with status, fair value, divergence in bps, and a trade recommendation.',
            inputSchema: {
              type: 'object',
              properties: {
                symbol: { type: 'string', description: 'Ticker symbol, e.g. NVDA, TSLA, AAPL' },
              },
              required: ['symbol'],
            },
          },
          {
            name: 'twinticker_scan_all',
            description: 'Scan all available Ondo tokenized US stocks. Returns ranked list by absolute divergence.',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'twinticker_execute',
            description: 'OPTIONAL: Execute a swap via the Binance Agentic Wallet (baw CLI) into the Ondo tokenized stock. Disabled by default. Requires BAW_ENABLED=true and confirm:true.',
            inputSchema: {
              type: 'object',
              properties: {
                symbol: { type: 'string', description: 'Ticker symbol' },
                amount_usdt: { type: 'number', description: 'USDT amount to swap (capped at $5 by default)' },
                confirm: { type: 'boolean', description: 'Must be true to execute. Dry-run if false or missing.' },
              },
              required: ['symbol', 'amount_usdt', 'confirm'],
            },
          },
        ],
      },
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    try {
      let result;
      if (name === 'twinticker_scan') {
        const data = await runReader((args?.symbol || 'NVDA').toUpperCase());
        const verdict = await runAnalyzer(data);
        result = { ...data, ...verdict };
      } else if (name === 'twinticker_scan_all') {
        const items = await scanAll();
        result = { count: items.length, results: items };
      } else if (name === 'twinticker_execute') {
        result = await runExecutor({
          symbol: args?.symbol,
          amount_usdt: Number(args?.amount_usdt),
          confirm: args?.confirm === true,
        });
      } else {
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } };
      }
      return {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: err.message },
      };
    }
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } };
});

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`TWINTICKER listening on :${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
