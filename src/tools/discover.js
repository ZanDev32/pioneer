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
import {
  PioMcpError,
  ERROR_CODES,
  wrapToolError,
  assertPioProject,
} from '../errors.js';
import { runPioCommand } from '../utils.js';
import { resolveWorkspace } from '../workspace.js';

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

/**
 * Resolve platformio.ini including extra_configs to get full environment data.
 *
 * PlatformIO's `pio project config` returns a weird array-of-arrays format
 * that doesn't include per-environment board/platform/framework details.
 * Instead, we parse platformio.ini + all extra_configs to build the full picture.
 *
 * @param {string} projectDir
 * @returns {{ environments: Array<{env: string, board: string|null, platform: string|null, framework: string|null}>, defaultEnvs: string[] }}
 */
function resolveEnvironments(projectDir) {
  const iniPath = path.join(projectDir, 'platformio.ini');
  let iniContent;
  try {
    iniContent = fs.readFileSync(iniPath, 'utf8');
  } catch {
    throw new PioMcpError(
      ERROR_CODES.PROJECT_NOT_FOUND,
      `Cannot read platformio.ini at ${iniPath}`,
      { path: iniPath },
    );
  }

  // Collect all ini files to parse (main + extra_configs)
  const iniFiles = [{ content: iniContent, source: iniPath }];

  // Extract extra_configs from the main file
  const extraConfigsMatch = iniContent.match(/extra_configs\s*=\s*([\s\S]*?)(?=\n\[|\n\w+\s*=|$)/);
  if (extraConfigsMatch) {
    const extraPaths = extraConfigsMatch[1]
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith(';') && !l.startsWith('#'));

    for (const relPath of extraPaths) {
      // Handle glob patterns like src/SESA_*/config.ini
      const fullGlob = path.join(projectDir, relPath.replace(/\[\[?/g, '[').replace(/\]\]/g, ']'));
      try {
        // Try as glob first
        const matches = expandGlobSync(fullGlob);
        for (const match of matches) {
          const content = fs.readFileSync(match, 'utf8');
          iniFiles.push({ content, source: match });
        }
      } catch {
        // Try as direct path
        const fullPath = path.join(projectDir, relPath.replace(/\[\[?/g, '[').replace(/\]\]/g, ']'));
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          iniFiles.push({ content, source: fullPath });
        } catch {
          // File not found, skip
        }
      }
    }
  }

  // Parse all ini files and merge environments
  const envMap = new Map();
  let defaultEnvs = [];

  for (const { content, source } of iniFiles) {
    const parsed = parsePlatformioIniRaw(content);
    for (const env of parsed.environments) {
      if (!envMap.has(env.env)) {
        envMap.set(env.env, { ...env });
      } else {
        // Merge — override with non-null values from this file
        const existing = envMap.get(env.env);
        if (env.board) existing.board = env.board;
        if (env.platform) existing.platform = env.platform;
        if (env.framework) existing.framework = env.framework;
      }
    }
    if (parsed.defaultEnvs.length > 0) {
      defaultEnvs = parsed.defaultEnvs;
    }
  }

  // Also capture global [env] platform/framework as defaults
  const globalEnv = parseGlobalEnv(iniContent);

  const environments = Array.from(envMap.values()).map((env) => ({
    env: env.env,
    board: env.board,
    platform: env.platform || globalEnv.platform,
    framework: env.framework || globalEnv.framework,
  }));

  return { environments, defaultEnvs };
}

/**
 * Parse global [env] section for platform/framework defaults.
 */
function parseGlobalEnv(iniContent) {
  let platform = null;
  let framework = null;
  let inGlobalEnv = false;

  for (const line of iniContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    const sectionMatch = trimmed.match(/^\[(.+?)\]$/);
    if (sectionMatch) {
      if (sectionMatch[1] === 'env') {
        inGlobalEnv = true;
      } else {
        inGlobalEnv = false;
      }
      continue;
    }

    if (!inGlobalEnv) continue;

    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.*)$/);
    if (!kvMatch) continue;

    const [, key, value] = kvMatch;
    if (key === 'platform') platform = value.trim();
    if (key === 'framework') framework = value.trim();
  }

  return { platform, framework };
}

/**
 * Simple glob expansion (supports * only, no **).
 */
function expandGlobSync(pattern) {
  const dir = path.dirname(pattern);
  const base = path.basename(pattern);
  const entries = fs.readdirSync(dir);
  const regex = new RegExp('^' + base.replace(/\*/g, '[^/]*').replace(/\?/g, '.') + '$');
  return entries
    .filter((e) => regex.test(e))
    .map((e) => path.join(dir, e))
    .filter((p) => fs.statSync(p).isFile());
}

/**
 * Raw platformio.ini parser — doesn't resolve extra_configs.
 * Used internally by resolveEnvironments.
 */
function parsePlatformioIniRaw(iniContent) {
  const environments = [];
  let currentEnv = null;
  let defaultEnvs = [];

  for (const rawLine of iniContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const sectionMatch = line.match(/^\[(.+?)\]$/);
    if (sectionMatch) {
      const section = sectionMatch[1];
      if (section === 'platformio') {
        currentEnv = '__platformio__';
      } else if (section.startsWith('env:')) {
        currentEnv = section.slice(4);
        environments.push({
          env: currentEnv,
          board: null,
          platform: null,
          framework: null,
        });
      } else if (section === 'env') {
        currentEnv = '__base_env__';
      } else {
        currentEnv = null;
      }
      continue;
    }

    if (!currentEnv || currentEnv === '__platformio__' || currentEnv === '__base_env__') {
      if (currentEnv === '__platformio__') {
        const kvMatch = line.match(/^(\w+)\s*=\s*(.*)$/);
        if (kvMatch && kvMatch[1] === 'default_envs') {
          defaultEnvs = kvMatch[2].split(/[,\s]+/).filter(Boolean);
        }
      }
      continue;
    }

    const kvMatch = line.match(/^(\w+)\s*=\s*(.*)$/);
    if (!kvMatch) continue;

    const [, key, value] = kvMatch;
    const v = value.trim();
    const env = environments.find((e) => e.env === currentEnv);
    if (env) {
      if (key === 'board') env.board = v;
      if (key === 'platform') env.platform = v;
      if (key === 'framework') env.framework = v;
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
  server.registerTool(
    'pio_list_devices',
    {
      description: 'List connected serial, logical, or mDNS devices detected by PlatformIO. Use this to discover which port to use for pio_upload or pio_serial_start.',
      inputSchema: {
        filter: z
          .enum(['serial', 'logical', 'mdns'])
          .optional()
          .default('serial')
          .describe('Device type to list. Default: serial (connected UART/USB ports).'),
      },
    },
    async (params) => {
      try {
        const projectDir = (await resolveWorkspace(ctx)).value;

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
        let normalized = Array.isArray(devices)
          ? devices.map((d) => ({
              port: d.port || d.path || '',
              hwid: d.hwid || '',
              description: d.description || '',
              type: params.filter,
            }))
          : [];

        // Filter out virtual/kernel serial ports — keep only real USB devices
        if (params.filter === 'serial') {
          normalized = normalized.filter((d) => {
            // Skip kernel virtual ports: /dev/ttyS* (8250 UART, loopback)
            if (/^\/dev\/ttyS\d+$/.test(d.port)) return false;
            // Skip ports with no hardware ID (not real devices)
            if (d.hwid === 'n/a' || !d.hwid) return false;
            return true;
          });
        }

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
    });

  // -------------------------------------------------------------------------
  // pio_list_boards
  // -------------------------------------------------------------------------
  server.registerTool(
    'pio_list_boards',
    {
      description: 'List all build environments defined in platformio.ini with their board, platform, and framework assignments. Use this to discover which environments exist in the project before building.',
      inputSchema: {},
    },
    async (params) => {
      try {
        const projectDir = (await resolveWorkspace(ctx)).value;

        assertPioProject(projectDir);

        const resolved = resolveEnvironments(projectDir);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  environments: resolved.environments,
                  default_envs: resolved.defaultEnvs,
                  count: resolved.environments.length,
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
    });
}
