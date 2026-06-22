/**
 * Shared utilities for pioarduino MCP tool modules.
 *
 * Central copy of the `runPioCommand` executor to avoid duplication across
 * tool files. Imported by `tools/build.js`, `tools/upload.js`, `tools/clean.js`,
 * `tools/discover.js`, `tools/check.js`, `tools/test.js`.
 */

import { exec } from 'child_process';

/**
 * Executes a PIO CLI command and captures stdout + stderr.
 *
 * Wraps `child_process.exec` with a large buffer and workspace-aware cwd.
 * Resolves on exit code 0; rejects on non-zero with combined output.
 *
 * @param {string[]} args — PIO command arguments (e.g., ['run', '-e', 'esp32dev'])
 * @param {{ projectDir: string, maxBuffer?: number, timeout?: number }} options
 * @returns {Promise<{ stdout: string, stderr: string, combined: string, exitCode: number }>}
 */
export function runPioCommand(args, options) {
  return new Promise((resolve, reject) => {
    const cmd = `pio ${args
      .map((a) => (a.includes(' ') ? `"${a}"` : a))
      .join(' ')}`;

    const maxBuffer = options.maxBuffer ?? 50 * 1024 * 1024; // default 50MB
    const execOptions = {
      cwd: options.projectDir,
      maxBuffer,
      env: { ...process.env },
    };

    // Only pass timeout if supplied — otherwise let exec default (no limit)
    if (options.timeout) execOptions.timeout = options.timeout;

    exec(cmd, execOptions, (error, stdout, stderr) => {
      const combined = (stdout || '') + '\n' + (stderr || '');

      if (error) {
        reject({
          code: error.code || 1,
          stdout,
          stderr,
          combined,
          message: error.message,
          timedOut: !!error.killed,
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
 * Returns true if any diagnostic in the array is an error or fatal error.
 *
 * @param {Array<{ type: string }>} diagnostics
 * @returns {boolean}
 */
export function hasErrors(diagnostics) {
  return diagnostics.some(
    (d) => d.type === 'error' || d.type === 'fatal error',
  );
}
