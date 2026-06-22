/**
 * Clean tools for pioarduino MCP server.
 *
 * Provides `pio_clean` — removes build artifacts for a specific environment.
 */

import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import {
  PioMcpError,
  ERROR_CODES,
  wrapToolError,
  assertPioProject,
  assertEnvExists,
  assertWithinWorkspace,
} from '../errors.js';
import { getDirSize } from '../metadata.js';
import { runPioCommand } from '../utils.js';

/**
 * Register clean tools on the MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {{ workspaceRoot: string }} ctx
 */
export function registerCleanTools(server, ctx) {
  server.tool(
    'pio_clean',
    'Clean build artifacts for a specific PlatformIO environment. Per-environment only (safe for multi-env projects).',
    {
      project_dir: z
        .string()
        .optional()
        .describe('Path to the PIO project. Defaults to workspace root.'),
      environment: z
        .string()
        .describe('Build environment to clean (e.g., "esp32dev"). Required.'),
      verbose: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include full output if true.'),
    },
    async (params) => {
      try {
        const projectDir = params.project_dir
          ? path.resolve(params.project_dir)
          : ctx.workspaceRoot;

        assertWithinWorkspace(projectDir, ctx.workspaceRoot);
        assertPioProject(projectDir);
        assertEnvExists(projectDir, params.environment);

        // Calculate build size before clean
        const buildDir = path.join(
          projectDir,
          '.pio',
          'build',
          params.environment,
        );
        const bytesBefore = getDirSize(buildDir);

        // Execute PIO clean
        let rawOutput = '';
        let exitCode = 0;
        let cleanSuccess = true;

        try {
          const result = await runPioCommand(['run', '-t', 'clean', '-e', params.environment], { projectDir });
          rawOutput = result.combined;
        } catch (cleanErr) {
          cleanSuccess = false;
          exitCode = cleanErr.code;
          rawOutput = cleanErr.combined;
        }

        // Calculate bytes freed
        const bytesAfter = getDirSize(buildDir);
        const bytes_freed = Math.max(0, bytesBefore - bytesAfter);

        const result = {
          success: cleanSuccess,
          environment: params.environment,
          bytes_freed,
        };

        if (params.verbose) {
          result.raw_output = rawOutput;
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const mcpErr = wrapToolError(err);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: { code: mcpErr.code, message: mcpErr.message, data: mcpErr.data },
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
