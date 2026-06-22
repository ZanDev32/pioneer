/**
 * Discovery tools for pioarduino MCP server.
 *
 * Provides:
 *   - `pio_list_devices`  — lists connected serial/logical/mDNS devices via `pio device list --json-output`
 *   - `pio_list_boards`   — lists environments from platformio.ini with their board/platform/framework assignments
 */

import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import {
  PioMcpError,
  ERROR_CODES,
  wrapToolError,
  assertPioProject,
  assertWithinWorkspace,
} from '../errors.js';

// ---------------------------------------------------------------------------
// PIO command executor (local copy for isolation)
// ---------------------------------------------------------------------------

function runPioCommand(args, options) {
  return new Promise((resolve, reject) => {
    const cmd = `pio ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`;

    exec(cmd, {
      cwd: options.projectDir,
      maxBuffer: 10 * 1024 * 1024, // 10MB — discovery output is small
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      if (error) {
        reject({
          code: error.code || 1,
          stdout,
          stderr,
          combined: (stdout || '') + '\n' + (stderr || ''),
          message: error.message,
        });
      } else {
        resolve({ stdout, stderr, exitCode: 0 });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// platformio.ini parser (simple, no deps)
// ---------------------------------------------------------------------------

/**
 * Parse platformio.ini to extract environment definitions.
 *
 * Returns an array of { env, board, platform, framework } objects.
 * Also extracts default_envs from [platformio] section if present.
 *
 * @param {string} iniContent — raw platformio.ini text
 * @returns {{ environments: Array<object>, defaultEnvs: string[] }}
 */
function parsePlatformioIni(iniContent) {
  const environments = [];
  let currentEnv = null;
  let defaultEnvs = [];

  const lines = iniContent.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    // Section header: [env:name] or [env] or [platformio]
    const sectionMatch = line.match(/^\[(.+?)\]$/);
    if (sectionMatch) {
      const section = sectionMatch[1];
      if (section === 'platformio') {
        currentEnv = '__platformio__';
    } else if (section.startsWith('env:')) {
        currentEnv = section.slice(4); // strip 'env:' prefix
        environments.push({
          env: currentEnv,
          board: null,
          platform: null,
          framework: null,
        });
      } else if (section === 'env') {
        // [env] section is the base config, not a named environment
        currentEnv = '__base_env__';
      } else {
        currentEnv = null; // other sections (common, custom)
      }
      continue;
    }

    if (!currentEnv) continue;

    // Key = value parsing
    const kvMatch = line.match(/^(\w+)\s*=\s*(.*)$/);
    if (!kvMatch) continue;

    const [, key, value] = kvMatch;
    const v = value.trim();

    if (currentEnv === '__platformio__') {
      if (key === 'default_envs') {
        defaultEnvs = v.split(/[,\s]+/).filter(Boolean);
      }
    } else if (currentEnv !== '__base_env__') {
      const env = environments.find((e) => e.env === currentEnv);
      if (env) {
        if (key === 'board') env.board = v;
        if (key === 'platform') env.platform = v;
        if (key === 'framework') env.framework = v;
      }
    }
  }

  return { environments, defaultEnvs };
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register discovery tools on the MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {{ workspaceRoot: string }} ctx
 */
export function registerDiscoverTools(server, ctx) {
  // -------------------------------------------------------------------------
  // pio_list_devices
  // -------------------------------------------------------------------------
  server.tool(
    'pio_list_devices',
    'List connected serial, logical, or mDNS devices detected by PlatformIO. Use this to discover which port to use for pio_upload or pio_serial_start.',
    {
      project_dir: z
        .string()
        .optional()
        .describe('Path to the PIO project. Optional — device listing is system-wide.'),
      filter: z
        .enum(['serial', 'logical', 'mdns'])
        .optional()
        .default('serial')
        .describe('Device type to list. Default: serial (connected UART/USB ports).'),
    },
    async (params) => {
      try {
        const projectDir = params.project_dir
          ? path.resolve(params.project_dir)
          : ctx.workspaceRoot;

        // Workspace check is optional for device listing (system-wide), but enforce if path given
        if (params.project_dir) {
          assertWithinWorkspace(projectDir, ctx.workspaceRoot);
        }

        const args = ['device', 'list', `--${params.filter}`, '--json-output'];

        let devices;
        try {
          const result = await runPioCommand(args, { projectDir });
          devices = JSON.parse(result.stdout || '[]');
        } catch (err) {
          // pio not found
          if (/command not found|ENOENT|'pio' is not recognized/i.test(err.combined || '')) {
            throw new PioMcpError(
              ERROR_CODES.PIO_COMMAND_NOT_FOUND,
              'PlatformIO CLI (pio) not found in PATH.',
              { hint: 'Run: pip install platformio' },
            );
          }
          // Empty output or parse error — return empty list rather than crash
          devices = [];
        }

        // Normalize device shape
        const normalized = Array.isArray(devices)
          ? devices.map((d) => ({
              port: d.port || d.path || '',
              hwid: d.hwid || '',
              description: d.description || '',
              type: params.filter,
            }))
          : [];

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: true, filter: params.filter, devices: normalized, count: normalized.length },
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
  // pio_list_boards
  // -------------------------------------------------------------------------
  server.tool(
    'pio_list_boards',
    'List all build environments defined in platformio.ini with their board, platform, and framework assignments. Use this to discover which environments exist in the project before building.',
    {
      project_dir: z
        .string()
        .optional()
        .describe('Path to the PIO project. Defaults to workspace root.'),
    },
    async (params) => {
      try {
        const projectDir = params.project_dir
          ? path.resolve(params.project_dir)
          : ctx.workspaceRoot;

        assertWithinWorkspace(projectDir, ctx.workspaceRoot);
        assertPioProject(projectDir);

        const iniPath = path.join(projectDir, 'platformio.ini');
        let iniContent;
        try {
          iniContent = fs.readFileSync(iniPath, 'utf8');
        } catch (err) {
          throw new PioMcpError(
            ERROR_CODES.PROJECT_NOT_FOUND,
            `Cannot read platformio.ini at ${iniPath}`,
            { path: iniPath },
          );
        }

        const parsed = parsePlatformioIni(iniContent);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  environments: parsed.environments,
                  default_envs: parsed.defaultEnvs,
                  count: parsed.environments.length,
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
