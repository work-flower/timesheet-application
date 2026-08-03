import { Router } from 'express';
import als from '../logging/asyncContext.js';
import { tools, handlers } from '../services/agentToolRegistry.js';

const router = Router();

// Tool definitions + handlers live in services/agentToolRegistry.js (shared
// with the agent layer). This route is the MCP JSON-RPC surface over them.

// -- JSON-RPC 2.0 handler ----------------------------------------------------

function jsonrpc(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonrpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

router.post('/', async (req, res) => {
  const { jsonrpc: version, id, method, params } = req.body;

  if (version !== '2.0') {
    return res.json(jsonrpcError(id, -32600, 'Invalid JSON-RPC version'));
  }

  if (method === 'initialize') {
    return res.json(jsonrpc(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'timesheet', version: '1.0.0' },
      capabilities: { tools: {} },
    }));
  }

  if (method === 'notifications/initialized') {
    return res.status(204).end();
  }

  if (method === 'tools/list') {
    // Strip agent-layer metadata (kind, access) — the MCP wire surface stays
    // exactly { name, description, inputSchema } as before the metadata existed.
    return res.json(jsonrpc(id, {
      tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    }));
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};
    const handler = handlers[toolName];

    // Enrich ALS context with tool name
    const store = als.getStore();
    if (store) store.toolName = toolName;

    if (!handler) {
      return res.json(jsonrpc(id, {
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        isError: true,
      }));
    }

    try {
      const text = await handler(toolArgs);
      return res.json(jsonrpc(id, {
        content: [{ type: 'text', text }],
      }));
    } catch (err) {
      console.error(err.message);
      return res.json(jsonrpc(id, {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      }));
    }
  }

  return res.json(jsonrpcError(id, -32601, `Unknown method: ${method}`));
});

export default router;
