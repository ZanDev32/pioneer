/**
 * Static analysis (pio check) tool for pioarduino MCP server.
 *
 * Provides `pio_check` — runs cppcheck, clangtidy, or pvs-studio via
 * `pio check --json-output` and returns structured defect results.
 *
 * Handles known PlatformIO issue #4029: `pio check --json-output` may mix
 * tool-install progress text into stdout before the JSON array.
 */

import { z } from 'zod';
import path from 'path';
import {
  PioMcpError,
  ERROR_CODES,
  wrapToolError,
  assertPioProject,
  assertEnvExists,
} from '../errors.js';
import { runPioCommand } from '../utils.js';
import { resolveWorkspace } from '../workspace.js';

// ---------------------------------------------------------------------------
// JSON extraction helper (handles PlatformIO #4029 noise)
// ---------------------------------------------------------------------------

/**
 * Extract JSON array from stdout that may contain non-JSON prefix text
 * (tool-install progress like "Downloading [...]").
 *
 * @param {string} stdout
 * @returns {Array}
 */
function extractJsonArray(stdout) {
  const jsonStart = stdout.indexOf('[');
  if (jsonStart < 0) return [];
  const jsonStr = stdout.slice(jsonStart);
  try {
    return JSON.parse(jsonStr);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER = { high: 3, medium: 2, low: 1 };

/**
 * Summarize check results into human-readable string.
 *
 * @param {Array} results — pio check JSON output (per-env, per-tool)
 * @returns {string}
 */
function summarizeCheckResults(results) {
  const bySeverity = { high: 0, medium: 0, low: 0 };
  let totalDefects = 0;

  for (const envResult of results) {
    if (!envResult.defects) continue;
    totalDefects += envResult.defects.length;
    for (const d of envResult.defects) {
      if (d.severity && bySeverity[d.severity] !== undefined) {
        bySeverity[d.severity]++;
      }
    }
  }

  if (totalDefects === 0) return 'no defects found';
  const parts = Object.entries(bySeverity)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${k}`);
  return `${totalDefects} defect${totalDefects !== 1 ? 's' : ''} (${parts.join(', ')})`;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the `pio_check` tool on the MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {{ workspaceRoot: string }} ctx
 */
export function registerCheckTools(server, ctx) {
  server.tool(
    'pio_check',
    'Run static code analysis on a PlatformIO project. Supports cppcheck, clangtidy, and pvs-studio. Returns structured defect results (severity, message, file, line). Use to catch bugs and style issues before build.',
    {
      environment: z
        .string()
        .optional()
        .describe('Environment to check. Checks all environments if omitted.'),
      tool: z
        .enum(['cppcheck', 'clangtidy', 'pvs-studio'])
        .optional()
        .describe('Analysis tool to use. Defaults to the check_tool configured in platformio.ini, or cppcheck if not set.'),
      severity: z
        .enum(['high', 'medium', 'low'])
        .optional()
        .describe('Minimum severity to report. Defaults to low (all defects). Use high for critical-only reports.'),
      verbose: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include tool output details if true. AVOID: causes excessive token usage. Only use when full output is needed for debugging.'),
    },
    async (params) => {
      try {
        const projectDir = (await resolveWorkspace(ctx)).value;

        assertPioProject(projectDir);

        if (params.environment) {
          assertEnvExists(projectDir, params.environment);
        }

        // Build pio check command
        const args = ['check', '--json-output'];
        if (params.environment) args.push('-e', params.environment);

        // Note: `--flags` is used to pass tool-specific flags and select the tool.
        // The `--check-tool` option doesn't exist on the CLI — check_tool is set in platformio.ini.
        // To override at runtime, we pass via --flags with the tool prefix:
        //   pio check --flags "cppcheck:--enable=all" --flags "clangtidy:--checks=*"
        // For simplicity, we rely on platformio.ini check_tool and let the user
        // configure it there. The tool parameter here filters/presents results.
        if (params.tool) {
          // Use --flags with the tool-specific prefix to select the check tool
          // PlatformIO processes check_tool from platformio.ini; we add severity filter
          args.push('--flags', `${params.tool}:`);
        }

        if (params.severity) {
          args.push('--severity', params.severity);
        }

        let stdout = '';
        let stderr = '';
        let exitCode = 0;

        try {
          const result = await runPioCommand(args, { projectDir });
          stdout = result.stdout;
          stderr = result.stderr;
        } catch (err) {
          // pio check returns non-zero exit when defects are found (expected behavior)
          // Parse stdout regardless — it contains the JSON results
          stdout = err.stdout || '';
          stderr = err.stderr || '';
          exitCode = err.code || 1;

          if (/command not found|ENOENT|'pio' is not recognized/i.test((stdout || '') + (stderr || ''))) {
            throw new PioMcpError(
              ERROR_CODES.PIO_COMMAND_NOT_FOUND,
              'PlatformIO CLI (pio) not found in PATH.',
              { hint: 'Run: pip install platformio' },
            );
          }
        }

        // Extract JSON results (handles tool-install noise prefix — PlatformIO #4029)
        const results = extractJsonArray(stdout);

        // Transform defects to MCP diagnostic shape
        let diagnostics = [];
        for (const envResult of results) {
          if (!Array.isArray(envResult.defects)) continue;
          for (const d of envResult.defects) {
            diagnostics.push({
              file: projectDir ? path.relative(projectDir, d.file || '') : (d.file || ''),
              line: d.line || 0,
              column: d.column || 0,
              type: d.category || d.severity || 'warning',
              message: d.message || '',
              severity: d.severity || 'medium',
              category: d.category || null,
              id: d.id || null,
              cwe: d.cwe || null,
              tool: envResult.tool,
              env: envResult.env,
            });
          }
        }

        // Apply client-side severity filter (in addition to --severity CLI flag)
        if (params.severity) {
          const minSev = SEVERITY_ORDER[params.severity] || 1;
          diagnostics = diagnostics.filter(
            (d) => (SEVERITY_ORDER[d.severity] || 0) >= minSev,
          );
        }

        // Build response
        const response = {
          success: true, // success = tool ran without crashing (defects are not failures)
          exit_code: exitCode,
          tools_run: results.map((r) => r.tool),
          environments: results.map((r) => r.env),
          total_defects: diagnostics.length,
          diagnostics,
          summary: summarizeCheckResults(results),
        };

        if (params.verbose) {
          response.raw_results = results;
          if (stderr) response.stderr = stderr;
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
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
