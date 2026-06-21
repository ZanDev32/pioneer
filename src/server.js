#!/usr/bin/env node
/**
 * pioarduino MCP Server — Standalone Entry Point
 *
 * Usage:
 *   npx pioarduino-mcp-server                    # stdio mode
 *   PIO_WORKSPACE_ROOT=/path/to/project npx ...   # set workspace root
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerBuildTools } from './tools/build.js';
import { registerUploadTools } from './tools/upload.js';
import { registerCleanTools } from './tools/clean.js';

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    workspaceRoot: process.env.PIO_WORKSPACE_ROOT || process.cwd(),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1]) {
      config.workspaceRoot = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
pioarduino MCP Server v${process.env.npm_package_version || '0.1.0'}

Usage:
  pioarduino-mcp-server [options]

Options:
  --workspace <path>   Set workspace root (default: PIO_WORKSPACE_ROOT env or cwd)
  --help, -h           Show this help message

Environment Variables:
  PIO_WORKSPACE_ROOT   Path to the PlatformIO project workspace root

Examples:
  pioarduino-mcp-server
  PIO_WORKSPACE_ROOT=/path/to/project pioarduino-mcp-server
`);
      process.exit(0);
    }
  }

  return config;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main() {
  const config = parseArgs();

  const server = new McpServer({
    name: 'pioarduino',
    version: process.env.npm_package_version || '0.1.0',
  });

  const ctx = { workspaceRoot: config.workspaceRoot };

  // Register all tools BEFORE connecting to transport
  registerBuildTools(server, ctx);
  registerUploadTools(server, ctx);
  registerCleanTools(server, ctx);

  console.error('pioarduino MCP Server starting...');
  console.error(`Workspace: ${config.workspaceRoot}`);
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

main().catch((err) => {
  console.error('Fatal: failed to start MCP server:', err.message);
  console.error(err.stack);
  process.exit(1);
});
