/**
 * Upload tools for pioarduino MCP server.
 *
 * Provides `pio_upload` for standalone firmware upload without IPC coordination.
 * For VS Code integration with serial port coordination, use the extension version.
 */

import { z } from 'zod';
import { execFile } from 'child_process';
import {
  PioMcpError,
  ERROR_CODES,
  wrapToolError,
  assertPioProject,
  assertEnvExists,
} from '../errors.js';
import { parseAllDiagnostics } from '../parsers.js';
import { parseBuildMetadata } from '../metadata.js';
import { summarizeDiagnostics } from './build.js';
import { runPioCommand, hasErrors } from '../utils.js';
import { resolveWorkspace } from '../workspace.js';

// ---------------------------------------------------------------------------
// Helper — imported from ../utils.js (hasErrors)
// ---------------------------------------------------------------------------

/**
 * Executes a pio command and captures stdout + stderr.
 *
 * Uses shared `runPioCommand` from ../utils.js for the sync path.
 * The async path below uses `exec` directly for fire-and-forget behavior.
 */

/**
 * Register upload tools on the MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {{ workspaceRoot: string }} ctx
 */
export function registerUploadTools(server, ctx) {
  server.tool(
    'pio_upload',
    'Upload (flash) firmware to a connected ESP32, Arduino, or other embedded device. Builds the project first if needed, then flashes firmware via serial port. Use after pio_build when ready to deploy, or call directly to build + flash in one step. Supports auto-detecting the serial port, selecting a specific port, async background uploads, and structured diagnostics. ALWAYS confirm with the user before flashing — this overwrites the device firmware.',
    {
      environment: z
        .string()
        .optional()
        .describe('Build environment. Defaults to default_envs in platformio.ini.'),
      port: z
        .string()
        .optional()
        .describe('Serial port (e.g., /dev/ttyUSB0, COM3). Auto-detected if omitted.'),
      verbose: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include full output if true. AVOID: causes excessive token usage. Only use for debugging upload failures.'),
      async: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Run upload in the background. Returns a taskId immediately; poll with pio_task_status for results.',
        ),
    },
    async (params) => {
      try {
        const projectDir = (await resolveWorkspace(ctx)).value;

        assertPioProject(projectDir);

        if (params.environment) {
          assertEnvExists(projectDir, params.environment);
        }

        // Build PIO command
        const args = ['run', '-t', 'upload'];
        if (params.environment) args.push('-e', params.environment);
        if (params.port) args.push('-p', params.port);

        // ---------------------------------------------------------------
        // Async (background) path — return taskId immediately
        // ---------------------------------------------------------------
        if (params.async && ctx.taskManager) {
          const envLabel = params.environment || 'default';
          const portLabel = params.port || 'auto';

          const execPromise = new Promise((resolve) => {
            execFile('pio', args, {
              cwd: projectDir,
              maxBuffer: 50 * 1024 * 1024,
              env: { ...process.env },
            }, (error, stdout, stderr) => {
              const combined = (stdout || '') + '\n' + (stderr || '');
              const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
              const success = !error;

              // Detect NO_DEVICE in output
              if (/no serial ports? found|no device|serial port not found/i.test(combined)) {
                resolve({
                  exitCode,
                  result: {
                    success: false,
                    exit_code: exitCode,
                    error: { code: ERROR_CODES.NO_DEVICE, message: 'No serial device found' },
                    port: params.port || null,
                  },
                });
                return;
              }

              const diagnostics = parseAllDiagnostics(combined, projectDir);
              const metadata = parseBuildMetadata(combined, projectDir, params.environment || '');

              resolve({
                exitCode,
                result: {
                  success: success && !hasErrors(diagnostics),
                  exit_code: exitCode,
                  port: params.port || null,
                  diagnostics,
                  summary: summarizeDiagnostics(diagnostics),
                  metadata,
                },
              });
            });
          });

          const taskId = ctx.taskManager.createTask({
            type: 'upload',
            message: `Uploading ${envLabel} to ${portLabel} in background...`,
            meta: { projectDir, environment: params.environment, port: params.port },
          });

          execPromise.then(({ exitCode, result }) => {
            ctx.taskManager.updateTask(taskId, {
              status: result.success ? 'completed' : 'failed',
              exitCode,
              result,
              message: result.success
                ? `Upload to ${portLabel} complete`
                : `Upload to ${portLabel} failed (exit ${exitCode})`,
            });
            server.server?.sendLoggingMessage?.({ level: result.success ? 'info' : 'error', data: { task_id: taskId, event: 'upload_complete' } });
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  task_id: taskId,
                  status: 'running',
                  message: `Uploading ${envLabel} to ${portLabel} in background`,
                }, null, 2),
              },
            ],
          };
        }

        // ---------------------------------------------------------------
        // Sync (blocking) path — existing behavior
        // ---------------------------------------------------------------

        // Execute upload
        let rawOutput = '';
        let exitCode = 0;
        let uploadSuccess = true;

        try {
          const result = await runPioCommand(args, { projectDir });
          rawOutput = result.combined;
        } catch (uploadErr) {
          uploadSuccess = false;
          exitCode = uploadErr.code;
          rawOutput = uploadErr.combined;

          // Check if pio command not found
          if (/command not found|ENOENT|'pio' is not recognized/i.test(rawOutput)) {
            throw new PioMcpError(
              ERROR_CODES.PIO_COMMAND_NOT_FOUND,
              'PlatformIO CLI (pio) not found in PATH.',
              { hint: 'Run: pip install platformio' },
            );
          }
        }

        // Check for NO_DEVICE error
        if (
          /no serial ports? found|no device|serial port not found/i.test(rawOutput)
        ) {
          throw new PioMcpError(
            ERROR_CODES.NO_DEVICE,
            'No serial device found. Check that your device is connected and the port is correct.',
            { port: params.port },
          );
        }

        // Parse diagnostics and metadata
        const diagnostics = parseAllDiagnostics(rawOutput, projectDir);
        const summary = summarizeDiagnostics(diagnostics);
        const metadata = parseBuildMetadata(rawOutput, projectDir, params.environment || '');

        const result = {
          success: uploadSuccess && !hasErrors(diagnostics),
          exit_code: exitCode,
          port: params.port || null,
          diagnostics,
          summary,
          metadata,
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
