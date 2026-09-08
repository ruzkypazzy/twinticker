#!/usr/bin/env node
/**
 * TWINTICKER stdio MCP server.
 *
 * This is a thin shim that speaks the Model Context Protocol over stdio
 * (the format Claude Code, Codex, Cursor, Windsurf, and most other MCP
 * clients use) and proxies the JSON-RPC messages to the hosted TWINTICKER
 * HTTP API at https://twinticker.vercel.app.
 *
 * Why this exists: the MCP streamable-HTTP transport is technically the
 * most modern, but client support is uneven and we've observed clients
 * (including the official SDK with default options) failing to complete
 * the handshake against self-hosted servers. Stdio is boring, universally
 * supported, and works everywhere.
 *
 * Install + use from Claude Code:
 *
 *   claude mcp add twinticker -- npx -y twinticker
 *
 * (or just point Claude Code / Cursor / etc at `node src/mcp-stdio.js`).
 *
 * No environment variables required. The hosted server is public.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const TWINTICKER_BASE = process.env.TWINTICKER_BASE || 'https://twinticker.vercel.app';

// Tool definitions — these mirror what's exposed on the hosted HTTP /mcp
// endpoint, so behaviour is identical regardless of transport.
const TOOLS = [
  {
    name: 'twinticker_scan',
    description:
      'Scan a single Ondo tokenized US stock for divergence vs its underlying equity. ' +
      'Returns a verdict card with status, fair value, divergence in bps, and a trade recommendation.',
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
    description:
      'Scan all available Ondo tokenized US stocks. Returns ranked list by absolute divergence.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'twinticker_execute',
    description:
      'OPTIONAL: Execute a swap via the Binance Agentic Wallet (baw CLI) into the Ondo ' +
      'tokenized stock. Disabled by default. Requires BAW_ENABLED=true on the host and ' +
      'confirm:true. The stdio shim does not execute — it forwards the call to the host, ' +
      'where BAW_ENABLED is checked.',
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
];

const server = new Server(
  { name: 'twinticker', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'twinticker_scan') {
    const symbol = String(args?.symbol || '').toUpperCase();
    if (!symbol) throw new Error('symbol is required');
    const res = await fetch(`${TWINTICKER_BASE}/api/scan/${encodeURIComponent(symbol)}`);
    if (!res.ok) {
      const text = await res.text();
      return { content: [{ type: 'text', text: `Error ${res.status}: ${text}` }], isError: true };
    }
    const data = await res.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  if (name === 'twinticker_scan_all') {
    const res = await fetch(`${TWINTICKER_BASE}/api/scan-all`);
    if (!res.ok) {
      const text = await res.text();
      return { content: [{ type: 'text', text: `Error ${res.status}: ${text}` }], isError: true };
    }
    const data = await res.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  if (name === 'twinticker_execute') {
    // Forward to the hosted /mcp so BAW_ENABLED is checked on the host.
    const res = await fetch(`${TWINTICKER_BASE}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'twinticker_execute', arguments: args },
      }),
    });
    const text = await res.text();
    return { content: [{ type: 'text', text: text }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
