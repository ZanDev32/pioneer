/**
 * Build tools for pioarduino MCP server.
 *
 * Provides `pio_build` — the flagship MCP tool. Executes `pio run` via child_process
 * and parses compiler diagnostics into structured JSON (16x token reduction vs raw logs).
 *
 * This is the standalone version — uses child_process.exec instead of pioarduino-node-helpers.
 */

import { z } from 'zod';
import path from 'path';
import { execFile } from 'child_process';
import {
  PioMcpError,
  ERROR_CODES,
  wrapToolError,
  assertPioProject,
  assertEnvExists,
} from '../errors.js';
import { parseAllDiagnostics } from '../parsers.js';
import { parseBuildMetadata, parseIncrementalDiagnostics } from '../metadata.js';
import { runPioCommand } from '../utils.js';
import { resolveWorkspace } from '../workspace.js';

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Summarizes a diagnostics array into a human-readable string.
 *
 * @param {Array} diagnostics
 * @returns {string}
 */
export function summarizeDiagnostics(diagnostics) {
  const errors = diagnostics.filter((d) => d.type === 'error' || d.type === 'fatal error').length;
  const warnings = diagnostics.filter((d) => d.type === 'warning').length;
  const notes = diagnostics.filter((d) => d.type === 'note').length;

  const parts = [];
  if (errors > 0) parts.push(`${errors} error${errors !== 1 ? 's' : ''}`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings !== 1 ? 's' : ''}`);
  if (notes > 0) parts.push(`${notes} note${notes !== 1 ? 's' : ''}`);

  return parts.length > 0 ? parts.join(', ') : 'no diagnostics';
}

// ---------------------------------------------------------------------------
// PIO command executor — imported from ../utils.js (runPioCommand)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Registers the `pio_build` tool on the given MCP server instance.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {{ workspaceRoot: string }} ctx
 */
export function registerBuildTools(server, ctx) {
  server.tool(
    'pio_build',
    'Build a PlatformIO project for a specified environment. Returns build status with structured warnings and errors (not raw logs). Use this to get token-efficient build diagnostics.',
    {
      environment: z
        .string()
        .optional()
        .describe(
          'Build environment (e.g., "esp32dev"). Defaults to default_envs in platformio.ini.',
        ),
      verbose: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include full build output if true. AVOID: causes 16x token usage. Only use when diagnosing linker/compiler issues.'),
      build_only: z
        .boolean()
        .optional()
        .default(false)
        .describe('Generate compilation database (compile_commands.json) for IDE integration without full build.'),
      include_memory: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include RAM/Flash usage breakdown. AVOID: adds ~200 tokens per build. Only use when checking resource constraints.'),
      incremental: z
        .boolean()
        .optional()
        .default(false)
        .describe('Only return diagnostics for files modified since the last build.'),
      async: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Run build in the background. Returns a taskId immediately; poll with pio_task_status for results.',
        ),
    },
    async (params) => {
      try {
        const projectDir = (await resolveWorkspace(ctx)).value;

        assertPioProject(projectDir);

        // Validate environment if specified
        if (params.environment) {
          assertEnvExists(projectDir, params.environment);
        }

        // Build PIO command arguments
        const args = ['run'];
        if (params.environment) {
          args.push('-e', params.environment);
        }
        if (params.build_only) {
          args.push('-t', 'compiledb');
        }

        // ---------------------------------------------------------------
        // Async (background) path — return taskId immediately
        // ---------------------------------------------------------------
        if (params.async && ctx.taskManager) {
          const envLabel = params.environment || 'default';

          const execPromise = new Promise((resolve) => {
            execFile('pio', args, {
              cwd: projectDir,
              maxBuffer: 50 * 1024 * 1024,
              env: { ...process.env },
            }, (error, stdout, stderr) => {
              const combined = (stdout || '') + '\n' + (stderr || '');
              const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
              const diagnostics = parseAllDiagnostics(combined, projectDir);
              const fullMetadata = parseBuildMetadata(combined, projectDir, params.environment || '');
              const success = !error && !diagnostics.some((d) => d.type === 'error' || d.type === 'fatal error');

              // Conditionally include memory — discouraged to reduce token usage
              const metadata = params.include_memory
                ? fullMetadata
                : {
                    duration_seconds: fullMetadata.duration_seconds,
                    binary_size_bytes: fullMetadata.binary_size_bytes,
                  };

              resolve({
                exitCode,
                result: {
                  success,
                  exit_code: exitCode,
                  diagnostics,
                  summary: summarizeDiagnostics(diagnostics),
                  metadata,
                },
              });
            });
          });

          const child = null; // exec callback-based, not spawn
          const taskId = ctx.taskManager.createTask({
            type: 'build',
            message: `Building ${envLabel} in background...`,
            child,
            meta: { projectDir, environment: params.environment },
          });

          // Wire promise to update task state on completion
          execPromise.then(({ exitCode, result }) => {
            ctx.taskManager.updateTask(taskId, {
              status: result.success ? 'completed' : 'failed',
              exitCode,
              result,
              message: result.success
                ? `Build ${envLabel} complete: ${result.summary}`
                : `Build ${envLabel} failed: ${result.summary}`,
            });
            server.server?.sendLoggingMessage?.({ level: result.success ? 'info' : 'error', data: { task_id: taskId, event: 'build_complete' } });
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  task_id: taskId,
                  status: 'running',
                  message: `Building ${envLabel} in background`,
                }, null, 2),
              },
            ],
          };
        }

        // ---------------------------------------------------------------
        // Sync (blocking) path — existing behavior
        // ---------------------------------------------------------------

        // Execute PIO build
        let rawOutput = '';
        let exitCode = 0;
        let buildSuccess = true;

        try {
          const result = await runPioCommand(args, { projectDir });
          rawOutput = result.combined;
        } catch (buildErr) {
          // Non-zero exit — capture whatever output was available
          buildSuccess = false;
          exitCode = buildErr.code;
          rawOutput = buildErr.combined;

          // Check if pio command not found
          if (/command not found|ENOENT|'pio' is not recognized/i.test(rawOutput)) {
            throw new PioMcpError(
              ERROR_CODES.PIO_COMMAND_NOT_FOUND,
              'PlatformIO CLI (pio) not found in PATH. Install PlatformIO Core first.',
              { hint: 'Run: pip install platformio' },
            );
          }
        }

        // Parse diagnostics using advanced parsers (linker, Python, CMake, GCC)
        let diagnostics = parseAllDiagnostics(rawOutput, projectDir);

        // Apply incremental filtering if requested
        if (params.incremental && params.environment) {
          diagnostics = parseIncrementalDiagnostics(
            projectDir,
            params.environment,
            diagnostics,
          );
        }

        const summary = summarizeDiagnostics(diagnostics);

        // Extract build metadata (duration, memory, binary size)
        const fullMetadata = parseBuildMetadata(
          rawOutput,
          projectDir,
          params.environment || '',
        );

        // Conditionally include memory — discouraged to reduce token usage
        const metadata = params.include_memory
          ? fullMetadata
          : {
              duration_seconds: fullMetadata.duration_seconds,
              binary_size_bytes: fullMetadata.binary_size_bytes,
            };

        // Build result object
        const result = {
          success: buildSuccess && !diagnostics.some((d) => d.type === 'error' || d.type === 'fatal error'),
          exit_code: exitCode,
          diagnostics,
          summary,
          incremental: !!params.incremental,
          metadata,
        };

        // Include raw output only if verbose
        if (params.verbose) {
          result.raw_output = rawOutput;
        }

        // Return as MCP text content
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const mcpErr = wrapToolError(err);
        // Return error as structured content (not thrown — keeps server stable)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: {
                  code: mcpErr.code,
                  message: mcpErr.message,
                  data: mcpErr.data,
                },
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
