import { randomUUID } from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";

const PORT = parseInt(process.env["PORT"] ?? "3456", 10);

// ─── Express setup ────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Session registry — keyed by session ID
const transports: Record<string, StreamableHTTPServerTransport | SSEServerTransport> = {};

// ─── Health endpoint ──────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", sessions: Object.keys(transports).length });
});

// ─── Streamable HTTP transport  (MCP spec 2025-11-25) ────────────────────────
// Clients: Claude Code, modern MCP clients
// Config:  { "url": "http://host:3456/mcp" }

app.all("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId] instanceof StreamableHTTPServerTransport) {
      transport = transports[sessionId] as StreamableHTTPServerTransport;
    } else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
          console.error(`[cloud-migration-mcp] StreamableHTTP session: ${sid}`);
        },
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) delete transports[sid];
      };
      await createServer().connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: invalid session or missing init" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[cloud-migration-mcp] /mcp error:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  }
});

// ─── Legacy SSE transport  (MCP spec 2024-11-05) ─────────────────────────────
// Clients: Claude Desktop (current), older MCP clients
// Config:  { "url": "http://host:3456/sse" }

app.get("/sse", async (req, res) => {
  console.error("[cloud-migration-mcp] SSE connection from", req.ip);
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  res.on("close", () => delete transports[transport.sessionId]);
  await createServer().connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query["sessionId"] as string;
  const transport = transports[sessionId];
  if (transport instanceof SSEServerTransport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).json({ error: "Session not found or wrong transport type" });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.error(`[cloud-migration-mcp] HTTP server listening on :${PORT}`);
  console.error(`  Streamable HTTP : http://0.0.0.0:${PORT}/mcp`);
  console.error(`  SSE (legacy)    : http://0.0.0.0:${PORT}/sse`);
  console.error(`  Health          : http://0.0.0.0:${PORT}/health`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on("SIGTERM", async () => {
  console.error("[cloud-migration-mcp] SIGTERM received — closing sessions");
  for (const [sid, t] of Object.entries(transports)) {
    try { await t.close(); } catch { /* ignore */ }
    delete transports[sid];
  }
  process.exit(0);
});
