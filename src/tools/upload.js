/**
 * Upload tools for pioarduino MCP server.
 *
 * Provides `pio_upload` for standalone firmware upload without IPC coordination.
 * For VS Code integration with serial port coordination, use the extension version.
 */

import { z } from 'zod';
import path from 'path';
import { exec } from 'child_process';
import {
  PioMcpError,
  ERROR_CODES,
  wrapToolError,
  assertPioProject,
  assertEnvExists,
  assertWithinWorkspace,
} from '../errors.js';
import { parseAllDiagnostics } from '../parsers.js';
import { parseBuildMetadata } from '../metadata.js';
import { summarizeDiagnostics } from './build.js';

function hasErrors(diagnostics) {
  return diagnostics.some((d) => d.type === 'error' || d.type === 'fatal error');
}

/**
 * Executes a pio command and captures stdout + stderr.
 *
 * @param {string[]} args
 * @param {{ projectDir: string }} options
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
function runPioCommand(args, options) {
  return new Promise((resolve, reject) => {
    const cmd = `pio ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`;

    exec(cmd, {
      cwd: options.projectDir,
      maxBuffer: 50 * 1024 * 1024, // 50MB
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      const combined = (stdout || '') + '\n' + (stderr || '');

      if (error) {
        reject({
          code: error.code || 1,
          stdout,
          stderr,
          combined,
          message: error.message,
        });
      } else {
        resolve({
          stdout,
          stderr,
          combined,
          exitCode: 0,
        });
      }
    });
  });
}

/**
 * Register upload tools on the MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {{ workspaceRoot: string }} ctx
 */
export function registerUploadTools(server, ctx) {
  server.tool(
    'pio_upload',
    'Upload firmware to a connected device. Returns upload status with diagnostics.',
    {
      project_dir: z
        .string()
        .optional()
        .describe('Path to the PIO project. Defaults to workspace root.'),
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
        .describe('Include full output if true.'),
    },
    async (params) => {
      try {
        const projectDir = params.project_dir
          ? path.resolve(params.project_dir)
          : ctx.workspaceRoot;

        assertWithinWorkspace(projectDir, ctx.workspaceRoot);
        assertPioProject(projectDir);

        if (params.environment) {
          assertEnvExists(projectDir, params.environment);
        }

        // Build PIO command
        const args = ['run', '-t', 'upload'];
        if (params.environment) args.push('-e', params.environment);
        if (params.port) args.push('-p', params.port);

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
