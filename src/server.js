#!/usr/bin/env node
/**
 * Pioneer — Standalone MCP Server Entry Point
 *
 * Usage:
 *   npx pioneer                                    # stdio mode
 *   PIO_WORKSPACE_ROOT=/path/to/project npx ...   # set workspace root
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { registerBuildTools } from './tools/build.js';
import { registerUploadTools } from './tools/upload.js';
import { registerCleanTools } from './tools/clean.js';
import { registerDiscoverTools } from './tools/discover.js';
import { registerMonitorTools } from './tools/monitor.js';
import { registerCheckTools } from './tools/check.js';
import { registerTestTools } from './tools/test.js';
import { TaskManager, registerTaskTools } from './tasks.js';
import { invalidateWorkspaceCache } from './workspace.js';
import http from 'node:http';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    // May be null when no explicit root is given — resolved lazily via
    // MCP roots or process.cwd() fallback at tool-call time.
    explicitRoot: process.env.PIO_WORKSPACE_ROOT || null,
    port: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1]) {
      config.explicitRoot = args[i + 1];
      i++;
    } else if (args[i] === '--port' && args[i + 1]) {
      config.port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Pioneer v${__PIONEER_VERSION__}

Usage:
  pioneer [options]

Options:
  --workspace <path>   Set workspace root (default: PIO_WORKSPACE_ROOT env or cwd)
  --port <port>        Start HTTP server for remote MCP (default: stdio mode)
  --help, -h           Show this help message

Environment Variables:
  PIO_WORKSPACE_ROOT   Path to the PlatformIO project workspace root
  PORT                 Alternative way to set HTTP port

Examples:
  pioneer
  PIO_WORKSPACE_ROOT=/path/to/project pioneer
  pioneer --port 3000
  PORT=3000 pioneer
`);
      process.exit(0);
    }
  }

  // Support PORT env var
  if (!config.port && process.env.PORT) {
    config.port = parseInt(process.env.PORT, 10);
  }

  return config;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main() {
  const config = parseArgs();

  const server = new McpServer({
    name: 'pioneer',
    version: __PIONEER_VERSION__,
    capabilities: { logging: {} },
  });

  // If --workspace was explicitly set, enforce the boundary check.
  // Otherwise the workspace is resolved lazily per tool-call (see
  // src/workspace.js): MCP roots capability first, then process.cwd().
  const workspaceFixed = config.explicitRoot !== null;
  const ctx = {
    explicitRoot: config.explicitRoot,
    // Kept for backwards-compat with code that reads ctx.workspaceRoot.
    // For non-fixed mode this is null until resolveWorkspace() is called.
    workspaceRoot: config.explicitRoot,
    taskManager: new TaskManager(),
    workspaceFixed,
  };

  // Register all tools BEFORE connecting to transport
  registerTaskTools(server, ctx);
  registerBuildTools(server, ctx);
  registerUploadTools(server, ctx);
  registerCleanTools(server, ctx);
  registerDiscoverTools(server, ctx);
  registerMonitorTools(server, ctx);
  registerCheckTools(server, ctx);
  registerTestTools(server, ctx);

  // Invalidate the cached workspace when the client signals its roots
  // changed (e.g., user switched projects in the host). Only meaningful
  // for hosts that advertise the `roots` capability (Antigravity, Claude
  // Desktop, Cursor). VS Code does not send this notification.
  server.server?.setNotificationHandler?.(
    RootsListChangedNotificationSchema,
    () => {
      console.error('workspace: roots/list_changed — invalidating cache');
      invalidateWorkspaceCache();
    },
  );

  console.error('Pioneer starting...');
  console.error(
    workspaceFixed
      ? `Workspace: ${config.explicitRoot} (fixed)`
      : 'Workspace: resolved lazily via MCP roots or cwd',
  );

  if (config.port) {
    console.error(`Mode: HTTP (Streamable HTTP transport on port ${config.port})`);

    // Streamable HTTP transport — single endpoint handles session + SSE
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    await server.connect(transport);

    const httpServer = http.createServer(async (req, res) => {
      // VS Code's MCP client sometimes omits the Mcp-Session-Id header on
      // post-initialize requests (e.g., notifications/initialized). The SDK
      // transport (via @hono/node-server) reads headers from req.rawHeaders,
      // NOT req.headers — so we must push into rawHeaders for the injection
      // to be visible to the transport.
      if (transport.sessionId && !req.headers['mcp-session-id']) {
        req.rawHeaders.push('mcp-session-id', transport.sessionId);
        // Keep req.headers in sync for any code that reads it directly
        req.headers['mcp-session-id'] = transport.sessionId;
      }
      await transport.handleRequest(req, res);
    });

    httpServer.listen(config.port, () => {
      console.error(`Server ready — http://localhost:${config.port}`);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.error('Shutting down...');
      server.close().finally(() => {
        httpServer.close();
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      console.error('Shutting down...');
      server.close().finally(() => {
        httpServer.close();
        process.exit(0);
      });
    });
  } else {
    console.error('Mode: stdio (JSON-RPC over stdin/stdout)');

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Server ready');

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.error('Shutting down...');
      server.close().finally(() => process.exit(0));
    });

    process.on('SIGTERM', () => {
      console.error('Shutting down...');
      server.close().finally(() => process.exit(0));
    });
  }
}

main().catch((err) => {
  console.error('Fatal: failed to start MCP server:', err.message);
  console.error(err.stack);
  process.exit(1);
});
