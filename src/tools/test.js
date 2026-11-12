/**
 * Test runner (pio test) tool for pioarduino MCP server.
 *
 * Provides `pio_run_tests` — executes PlatformIO unit tests via `pio test`
 * with `--json-output-path` for structured results.
 *
 * Falls back gracefully when `--json-output-path` is not supported (older PIO).
 */

import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import os from 'os';
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
// Test result summary helper
// ---------------------------------------------------------------------------

/**
 * Extract the pass/fail/skip status from a single test case entry.
 * Handles key-name variance across PlatformIO versions and test frameworks:
 *   - status / result / state / outcome (lowercase or uppercase)
 *   - PASSED/FAILED/SKIPPED or pass/fail/skip
 *
 * Returns 'passed', 'failed', 'skipped', or 'unknown'.
 *
 * @param {object} tc — single test case object
 * @returns {string}
 */
function resolveTestCaseStatus(tc) {
  for (const key of ['status', 'result', 'state', 'outcome', 'verdict']) {
    const v = (tc[key] || '').toString().toLowerCase();
    if (!v) continue;
    if (['passed', 'pass', 'ok', 'success'].includes(v)) return 'passed';
    if (['failed', 'fail', 'error', 'failure'].includes(v)) return 'failed';
    if (['skipped', 'skip', 'ignored', 'pending', 'disabled'].includes(v)) return 'skipped';
  }
  // PlatformIO also reports failure count fields at the suite level
  if (tc.passed != null && tc.failed != null) {
    if (tc.failed > 0) return 'fail-count';
    if (tc.passed > 0) return 'pass-count';
  }
  return 'unknown';
}

/**
 * Summarize test results into human-readable string.
 *
 * Handles both structured JSON results and fallback to text-based parsing.
 * Supports key-name variance across PlatformIO versions.
 *
 * @param {Array|null} jsonResults — JSON array from --json-output-path
 * @param {string} rawOutput — raw stdout/stderr for fallback parsing
 * @returns {string}
 */
function summarizeTestResults(jsonResults, rawOutput) {
  // Try structured JSON first
  if (jsonResults && Array.isArray(jsonResults) && jsonResults.length > 0) {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let suitesCount = jsonResults.length;

    for (const suite of jsonResults) {
      // Try several likely keys for the nested test cases
      const cases =
        suite.test_cases ||
        suite.tests ||
        suite.cases ||
        suite.results ||
        [];

      if (Array.isArray(cases) && cases.length > 0) {
        for (const tc of cases) {
          const status = resolveTestCaseStatus(tc);
          if (status === 'passed' || status === 'pass-count') passed++;
          else if (status === 'failed' || status === 'fail-count') failed++;
          else if (status === 'skipped') skipped++;
          else passed++; // unknown default
        }
      } else if (suite.passed != null || suite.failed != null || suite.skipped != null) {
        // Suite-level aggregate counts (some PlatformIO shapes)
        passed += suite.passed || 0;
        failed += suite.failed || 0;
        skipped += suite.skipped || 0;
      } else {
        // No test cases and no aggregate counts — count suite as 1 passed test
        passed++;
      }
    }

    const parts = [`${passed} passed`];
    if (failed > 0) parts.push(`${failed} failed`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    return `${suitesCount} suite${suitesCount !== 1 ? 's' : ''}, ${parts.join(', ')}`;
  }

  // Fallback: parse from raw text output (handles "12 tests passed" style output)
  if (rawOutput) {
    // Standard PlatformIO text output patterns
    const passMatch = rawOutput.match(/(\d+)\s+passed/i);
    const failMatch = rawOutput.match(/(\d+)\s+failed/i);
    const skipMatch = rawOutput.match(/(\d+)\s+skipped/i);
    const allTestsMatch = rawOutput.match(/[Aa]ll\s+(\d+)\s+tests?\s+(?:passed|succeeded)/);
    const singleSuiteMatch = rawOutput.match(/(\d+)\s+tests?\s+in\s+(\d+)\s+test\s+suites?/i);

    if (allTestsMatch) return `All ${allTestsMatch[1]} tests passed`;
    if (passMatch || failMatch) {
      const parts = [];
      if (passMatch) parts.push(`${passMatch[1]} passed`);
      if (failMatch) parts.push(`${failMatch[1]} failed`);
      if (skipMatch) parts.push(`${skipMatch[1]} skipped`);
      if (singleSuiteMatch) parts.push(`${singleSuiteMatch[2]} suite${parseInt(singleSuiteMatch[2], 10) !== 1 ? 's' : ''}`);
      return parts.join(', ') || 'test output captured';
    }
  }

  return 'test output captured (no structured data available)';
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the `pio_run_tests` tool on the MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {{ workspaceRoot: string, taskManager: import('../tasks.js').TaskManager }} ctx
 */
export function registerTestTools(server, ctx) {
  server.registerTool(
    'pio_run_tests',
    {
      description: 'Run PlatformIO unit tests for a project. Returns structured pass/fail results per test suite. Use to verify code correctness before build and upload. Supports both native (desktop) and target device testing.',
      inputSchema: {
        environment: z
          .string()
          .optional()
          .describe('Environment to test. Tests all environments if omitted.'),
        filter: z
          .string()
          .optional()
          .describe('Run only tests matching this name/pattern (passed to pio test --filter).'),
        timeout_seconds: z
          .number()
          .int()
          .positive()
          .optional()
          .default(300)
          .describe('Timeout in seconds. Default 300 (5 minutes). Increase for large test suites.'),
        verbose: z
          .boolean()
          .optional()
          .default(false)
          .describe('Include raw pio test output if true.'),
        async: z
          .boolean()
          .optional()
          .default(false)
          .describe('Run tests in the background. Returns a taskId immediately; poll with pio_task_status for results.'),
      },
    },
    async (params) => {
      try {
        const projectDir = (await resolveWorkspace(ctx)).value;

        assertPioProject(projectDir);

        if (params.environment) {
          assertEnvExists(projectDir, params.environment);
        }

        // Build pio test command
        const args = ['test'];
        if (params.environment) args.push('-e', params.environment);
        if (params.filter) args.push('-f', params.filter);

        // Use --json-output-path for structured results (pio test does NOT support --json-output)
        const pioDir = path.join(projectDir, '.pio');
        if (!fs.existsSync(pioDir)) {
          fs.mkdirSync(pioDir, { recursive: true });
        }
        const jsonOutputPath = path.join(pioDir, 'test-results.json');
        args.push(`--json-output-path=${jsonOutputPath}`);

        const timeout = (params.timeout_seconds || 300) * 1000;

        // ---------------------------------------------------------------
        // Async (background) path
        // ---------------------------------------------------------------
        if (params.async && ctx.taskManager) {
          const envLabel = params.environment || 'all';

          const execPromise = (async () => {
            let combined = '';
            let exitCode = 0;
            try {
              combined = (await runPioCommand(args, { projectDir, timeout })).combined;
            } catch (execErr) {
              // Non-zero exit — a background run must record the failure, not throw it
              exitCode = execErr.code;
              combined = execErr.combined ?? '';
            }

            // Try to read structured JSON results
            let jsonResults = null;
            try {
              if (fs.existsSync(jsonOutputPath)) {
                const content = fs.readFileSync(jsonOutputPath, 'utf8');
                jsonResults = JSON.parse(content);
                fs.unlinkSync(jsonOutputPath); // cleanup
              }
            } catch {}

            const success = exitCode === 0;
            return {
              exitCode,
              result: {
                success,
                exit_code: exitCode,
                results: jsonResults,
                summary: summarizeTestResults(jsonResults, combined),
              },
            };
          })();

          const taskId = ctx.taskManager.createTask({
            type: 'test',
            message: `Running tests for ${envLabel} in background...`,
            meta: { projectDir, environment: params.environment },
          });

          execPromise.then(({ exitCode, result }) => {
            ctx.taskManager.updateTask(taskId, {
              status: result.success ? 'completed' : 'failed',
              exitCode,
              result,
              message: `Tests ${result.success ? 'passed' : 'failed'}: ${result.summary}`,
            });
            server.sendLoggingMessage?.({
              level: result.success ? 'info' : 'error',
              data: { task_id: taskId, event: 'test_complete' },
            });
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  task_id: taskId,
                  status: 'running',
                  message: `Running tests for ${envLabel} in background`,
                }, null, 2),
              },
            ],
          };
        }

        // ---------------------------------------------------------------
        // Sync (blocking) path
        // ---------------------------------------------------------------
        let stdout = '';
        let stderr = '';
        let exitCode = 0;

        try {
          const result = await runPioCommand(args, { projectDir, timeout });
          stdout = result.stdout;
          stderr = result.stderr;
        } catch (err) {
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

          if (err.timedOut) {
            throw new PioMcpError(
              ERROR_CODES.BUILD_FAILED,
              `Test execution timed out after ${params.timeout_seconds}s`,
              { timeout_seconds: params.timeout_seconds },
            );
          }
        }

        // Try to read structured JSON results
        let jsonResults = null;
        try {
          if (fs.existsSync(jsonOutputPath)) {
            const content = fs.readFileSync(jsonOutputPath, 'utf8');
            jsonResults = JSON.parse(content);
            fs.unlinkSync(jsonOutputPath); // cleanup
          }
        } catch {
          // JSON file not generated or invalid — graceful degradation
        }

        const combined = (stdout || '') + '\n' + (stderr || '');
        const summary = summarizeTestResults(jsonResults, combined);

        const response = {
          success: exitCode === 0,
          exit_code: exitCode,
          results: jsonResults,
          summary,
        };

        if (params.verbose) {
          response.raw_output = combined;
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
    });
}
