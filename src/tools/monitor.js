/**
 * Serial monitor tools for pioarduino MCP server.
 *
 * Provides 3 separate tools (matches jl-codes/platformio-mcp design):
 *   - `pio_serial_start` — spawns `pio device monitor` as a detached daemon, spooling to log file
 *   - `pio_serial_stop` — kills the daemon, returns summary
 *   - `pio_serial_read` — reads tail of log file with optional regex filter
 *
 * Log file location: <projectDir>/.pio/monitor-<port-slug>.log
 * This is disk-spooled (not in-memory) for crash resilience and audit trail (D-06).
 */

import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, exec } from 'child_process';
import {
  PioMcpError,
  ERROR_CODES,
  wrapToolError,
  assertPioProject,
  assertWithinWorkspace,
} from '../errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a filesystem-safe slug from a port name.
 * /dev/ttyUSB0 → ttyUSB0, COM3 → COM3, /dev/cu.usbmodem14201 → cu.usbmodem14201
 *
 * @param {string} port
 * @returns {string}
 */
function slugifyPort(port) {
  if (!port) return 'auto';
  return path.basename(port).replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Ensure the .pio directory exists in projectDir.
 *
 * @param {string} projectDir
 */
function ensurePioDir(projectDir) {
  const pioDir = path.join(projectDir, '.pio');
  if (!fs.existsSync(pioDir)) {
    fs.mkdirSync(pioDir, { recursive: true });
  }
}

/**
 * Read last N lines of a file, with optional regex filter.
 *
 * @param {string} filePath
 * @param {number} lineCount
 * @param {string} [pattern] — regex pattern string
 * @returns {string[]}
 */
function tailFile(filePath, lineCount, pattern) {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  let lines = content.split('\n').filter((l) => l.length > 0);

  // Apply regex filter first (before tail) to avoid cutting filtered output
  if (pattern) {
    try {
      const re = new RegExp(pattern);
      lines = lines.filter((l) => re.test(l));
    } catch {
      // Invalid regex — return unfiltered
    }
  }

  // Take last N lines
  return lines.slice(-lineCount);
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register serial monitor tools on the MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {{ workspaceRoot: string, taskManager: import('../tasks.js').TaskManager }} ctx
 */
export function registerMonitorTools(server, ctx) {
  // -------------------------------------------------------------------------
  // pio_serial_start
  // -------------------------------------------------------------------------
  server.tool(
    'pio_serial_start',
    'Start a serial monitor daemon in the background. Spoons pio device monitor output to a log file at <project>/.pio/monitor-<port>.log. Use pio_serial_read to inspect and pio_serial_stop to halt.',
    {
      project_dir: z
        .string()
        .optional()
        .describe('Path to the PIO project. Defaults to workspace root.'),
      environment: z
        .string()
        .optional()
        .describe('PIO environment — used to inherit monitor settings from platformio.ini.'),
      port: z
        .string()
        .optional()
        .describe('Serial port (e.g., /dev/ttyUSB0, COM3). Auto-detected by pio if omitted.'),
      baud: z
        .number()
        .int()
        .optional()
        .default(115200)
        .describe('Baud rate. Default 115200 (standard for ESP32).'),
    },
    async (params) => {
      try {
        const projectDir = params.project_dir
          ? path.resolve(params.project_dir)
          : ctx.workspaceRoot;

        assertWithinWorkspace(projectDir, ctx.workspaceRoot);
        assertPioProject(projectDir);
        ensurePioDir(projectDir);

        const portSlug = slugifyPort(params.port);
        const logPath = path.join(projectDir, '.pio', `monitor-${portSlug}.log`);

        // Build pio device monitor args
        const pioArgs = ['device', 'monitor'];
        pioArgs.push('-b', String(params.baud));
        if (params.port) pioArgs.push('-p', params.port);
        if (params.environment) pioArgs.push('-e', params.environment);

        // Open log file for append
        let logFd;
        try {
          logFd = fs.openSync(logPath, 'a');
          fs.writeSync(logFd, `\n--- monitor started ${new Date().toISOString()} (baud=${params.baud}) ---\n`);
        } catch (err) {
          throw new PioMcpError(
            ERROR_CODES.INTERNAL_ERROR,
            `Cannot open log file ${logPath}: ${err.message}`,
            { log_path: logPath },
          );
        }

        // Spawn detached child — stdout goes to log file, stderr to pipe (for permission errors)
        let child;
        try {
          child = spawn('pio', pioArgs, {
            cwd: projectDir,
            detached: true,
            stdio: ['ignore', logFd, 'pipe'],
          });
        } catch (spawnErr) {
          // spawn failed (e.g., pio not in PATH) — close the fd we opened above
          try { fs.closeSync(logFd); } catch {}
          throw new PioMcpError(
            ERROR_CODES.PIO_COMMAND_NOT_FOUND,
            `Failed to start pio device monitor: ${spawnErr.message}`,
            { port: params.port, baud: params.baud },
          );
        }

        // Capture stderr for startup errors (e.g., permission denied)
        let stderrBuf = '';
        child.stderr?.on('data', (data) => {
          stderrBuf += data.toString();
        });

        // Unref so the MCP server can exit without killing the monitor
        child.unref();

        // Track in task manager
        const taskId = ctx.taskManager.createTask({
          type: 'monitor',
          message: `Serial monitor running on ${params.port || 'auto'} at ${params.baud} baud`,
          child,
          meta: {
            logPath,
            port: params.port || 'auto',
            baud: params.baud,
            environment: params.environment || null,
            projectDir,
          },
        });

        // After 2s, check if child died (permission errors, port busy, pio not found)
        setTimeout(() => {
          const raw = ctx.taskManager.getRaw(taskId);
          if (raw && raw.status === 'running' && child.exitCode !== null) {
            const errMsg = stderrBuf.trim() || `Monitor exited with code ${child.exitCode}`;
            ctx.taskManager.updateTask(taskId, {
              status: 'failed',
              exitCode: child.exitCode,
              message: `Monitor failed: ${errMsg}`,
            });
            server.server?.sendLoggingMessage?.({
              level: 'error',
              data: { task_id: taskId, event: 'monitor_failed', error: errMsg },
            });
          }
        }, 2000);

        // Cleanup on child exit (if not already stopped)
        child.on('exit', (code) => {
          const raw = ctx.taskManager.getRaw(taskId);
          if (raw && raw.status === 'running') {
            ctx.taskManager.updateTask(taskId, {
              status: 'completed',
              exitCode: code,
              message: code === 0 ? 'Monitor stopped (device disconnected)' : `Monitor exited with code ${code}`,
            });
          }
          // Close log file descriptor
          try { fs.closeSync(logFd); } catch {}
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  task_id: taskId,
                  log_file: logPath,
                  pid: child.pid,
                  port: params.port || 'auto',
                  baud: params.baud,
                  message: `Serial monitor started`,
                },
                null,
                2,
              ),
            },
          ],
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

  // -------------------------------------------------------------------------
  // pio_serial_stop
  // -------------------------------------------------------------------------
  server.tool(
    'pio_serial_stop',
    'Stop a running serial monitor daemon. Kills the pio device monitor process and returns a summary of captured output.',
    {
      task_id: z
        .string()
        .describe('Task ID returned from pio_serial_start.'),
      delete_log: z
        .boolean()
        .optional()
        .default(false)
        .describe('Delete the log file after stopping. Default false (keep for audit).'),
    },
    async ({ task_id, delete_log }) => {
      try {
        const raw = ctx.taskManager.getRaw(task_id);
        if (!raw) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Task not found', task_id }),
              },
            ],
            isError: true,
          };
        }

        if (raw.type !== 'monitor' && raw.child) {
          // Not a monitor task — still allow kill
        }

        const logPath = raw.meta?.logPath;
        let linesCaptured = 0;

        // Count lines in log before stopping
        if (logPath && fs.existsSync(logPath)) {
          try {
            const content = fs.readFileSync(logPath, 'utf8');
            linesCaptured = content.split('\n').filter((l) => l.length > 0).length;
          } catch {}
        }

        // Kill the child process
        const killed = ctx.taskManager.cancelTask(task_id);

        // Update status to 'stopped' (cancelTask sets 'cancelled', override it)
        ctx.taskManager.updateTask(task_id, {
          status: 'stopped',
          message: 'Stopped by user',
        });

        const duration = Math.floor((Date.now() - raw.startTime) / 1000);

        // Delete log file if requested
        if (delete_log && logPath && fs.existsSync(logPath)) {
          try {
            fs.unlinkSync(logPath);
          } catch {}
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  task_id,
                  killed,
                  log_file: logPath,
                  lines_captured: linesCaptured,
                  duration_seconds: duration,
                  message: `Monitor stopped after ${duration}s (${linesCaptured} lines)`,
                },
                null,
                2,
              ),
            },
          ],
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

  // -------------------------------------------------------------------------
  // pio_serial_read
  // -------------------------------------------------------------------------
  server.tool(
    'pio_serial_read',
    'Read the last N lines of a serial monitor log file. Optionally filter with a regex pattern. Use to inspect captured serial output without stopping the monitor.',
    {
      task_id: z
        .string()
        .optional()
        .describe('Active monitor task ID (resolves log file automatically).'),
      log_file: z
        .string()
        .optional()
        .describe('Direct log file path (alternative to task_id).'),
      lines: z
        .number()
        .int()
        .positive()
        .optional()
        .default(100)
        .describe('Number of lines to read from the end of the log. Default 100.'),
      search_pattern: z
        .string()
        .optional()
        .describe('Regex pattern to filter lines (JavaScript regex syntax). Applied before taking the tail.'),
    },
    async (params) => {
      try {
        // Resolve log file path
        let logPath = params.log_file || null;
        let fromTask = false;

        if (!logPath && params.task_id) {
          const raw = ctx.taskManager.getRaw(params.task_id);
          if (!raw) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: 'Task not found', task_id: params.task_id }),
                },
              ],
              isError: true,
            };
          }
          logPath = raw.meta?.logPath;
          fromTask = true;
        }

        if (!logPath) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: { message: 'Either task_id or log_file is required' },
                }),
              },
            ],
            isError: true,
          };
        }

        // Workspace boundary check on log file
        const projectDir = fromTask
          ? ctx.taskManager.getRaw(params.task_id)?.meta?.projectDir
          : ctx.workspaceRoot;
        if (projectDir) {
          assertWithinWorkspace(path.resolve(logPath), projectDir);
        }

        if (!fs.existsSync(logPath)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  lines_read: 0,
                  lines: [],
                  log_file: logPath,
                  message: 'Log file not found (monitor may not have started yet)',
                }),
              },
            ],
          };
        }

        const lines = tailFile(logPath, params.lines, params.search_pattern);

        // Count total lines in log for context
        const totalContent = fs.readFileSync(logPath, 'utf8');
        const totalLines = totalContent.split('\n').filter((l) => l.length > 0).length;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  log_file: logPath,
                  lines_read: lines.length,
                  total_lines: totalLines,
                  search_pattern: params.search_pattern || null,
                  lines,
                },
                null,
                2,
              ),
            },
          ],
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
