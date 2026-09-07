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

// Serve the demo page
fastify.get('/', async (req, reply) => {
  const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf-8');
  reply.type('text/html').send(html);
});

fastify.get('/health', async () => ({ ok: true, name: 'twinticker', time: new Date().toISOString() }));

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

// MCP server endpoint (streamable HTTP transport)
fastify.post('/mcp', async (req, reply) => {
  // Minimal MCP streamable HTTP handler. We expose two tools: scan and scan_all.
  const { jsonrpc, id, method, params } = req.body || {};

  if (jsonrpc !== '2.0' || !id) {
    reply.code(400);
    return { error: 'invalid_jsonrpc' };
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

  if (method === 'notifications/initialized') {
    return reply.code(204).send();
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
