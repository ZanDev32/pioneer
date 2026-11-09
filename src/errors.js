import fs from 'fs';
import path from 'path';

/**
 * Custom error class for pioarduino MCP tool failures.
 *
 * Wraps errors with JSON-RPC-compatible error codes and a `data` field
 * for domain-specific context. All thrown `PioMcpError` instances are
 * caught by the tool handler's catch block and returned as structured
 * MCP error responses.
 */
export class PioMcpError extends Error {
  /**
   * @param {number} code — JSON-RPC error code (negative integer)
   * @param {string} message — Human-readable error description
   * @param {object} data — Domain-specific context (e.g., available environments)
   */
  constructor(code, message, data = {}) {
    super(message);
    this.name = 'PioMcpError';
    this.code = code;
    this.data = data;
  }
}

/**
 * Standard and custom error codes for pioarduino MCP tools.
 *
 * Codes in the -32000 range are reserved for tool-specific errors
 * (JSON-RPC spec allows -32000 to -32099 for server-defined errors).
 */
export const ERROR_CODES = {
  // JSON-RPC standard codes
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // pioarduino tool-specific codes
  PROJECT_NOT_FOUND: -32001,
  ENV_NOT_FOUND: -32002,
  BUILD_FAILED: -32003,
  UPLOAD_FAILED: -32004,
  PIO_NOT_INSTALLED: -32005,
  /** Serial port is currently in use by another process (e.g., serial monitor) */
  PORT_BUSY: -32006,
  /** Project path is outside the workspace root */
  PROJECT_OUTSIDE_WORKSPACE: -32007,
  /** No serial device found */
  NO_DEVICE: -32008,
  /** pio command not found in PATH */
  PIO_COMMAND_NOT_FOUND: -32009,
};

/**
 * Wraps any thrown error into a `PioMcpError`.
 *
 * Used in every tool handler's catch block to ensure consistent
 * error responses. If the error is already a `PioMcpError`, it is
 * returned as-is.
 *
 * @param {Error} err — The caught error
 * @returns {PioMcpError}
 */
export function wrapToolError(err) {
  if (err instanceof PioMcpError) {
    return err;
  }
  return new PioMcpError(ERROR_CODES.INTERNAL_ERROR, err.message || 'Unknown error', {
    stack: err.stack,
  });
}

/**
 * Validates that the given project directory is within the workspace root.
 * Prevents MCP clients from targeting arbitrary filesystem paths.
 *
 * When `ctx.workspaceFixed` is `true` (server started with `--workspace`
 * or `PIO_WORKSPACE_ROOT`), this enforces the boundary check. When `false`
 * (workspace resolved lazily via MCP `roots` capability, or HTTP mode
 * without fixed workspace), this only validates that the path exists and
 * contains a valid PlatformIO project — the root is trusted because it
 * came from the host client.
 *
 * @param {string} projectDir - Absolute path to the project directory
 * @param {string} workspaceRoot - Absolute path to the workspace root
 * @param {object} [ctx] - Optional context with `workspaceFixed` boolean
 */
export function assertWithinWorkspace(projectDir, workspaceRoot, ctx) {
  const workspaceFixed = ctx?.workspaceFixed ?? true;

  if (workspaceFixed) {
    // Strict mode: project must be within workspace root
    const resolvedProject = path.resolve(projectDir);
    const resolvedWorkspace = path.resolve(workspaceRoot);
    if (
      !resolvedProject.startsWith(resolvedWorkspace + path.sep) &&
      resolvedProject !== resolvedWorkspace
    ) {
      throw new PioMcpError(
        ERROR_CODES.PROJECT_OUTSIDE_WORKSPACE,
        `Project path '${projectDir}' is outside the workspace root '${workspaceRoot}'.`,
        { projectDir, workspaceRoot },
      );
    }
  } else {
    // Relaxed mode: just verify the path exists and has platformio.ini
    const pioIniPath = path.join(projectDir, 'platformio.ini');
    try {
      if (!fs.existsSync(pioIniPath)) {
        throw new PioMcpError(
          ERROR_CODES.INVALID_PARAMS,
          `No platformio.ini found at '${projectDir}'.`,
          { projectDir },
        );
      }
    } catch (err) {
      if (err instanceof PioMcpError) throw err;
      throw new PioMcpError(
        ERROR_CODES.INVALID_PARAMS,
        `Invalid project directory: ${err.message}`,
        { projectDir },
      );
    }
  }
}

/**
 * Validates that the given path is a PlatformIO project (contains platformio.ini).
 *
 * Throws `PioMcpError` with code `PROJECT_NOT_FOUND` if not.
 *
 * @param {string} projectDir — Absolute path to the project directory
 */
export function assertPioProject(projectDir) {
  const iniPath = path.join(projectDir, 'platformio.ini');
  if (!fs.existsSync(iniPath)) {
    throw new PioMcpError(
      ERROR_CODES.PROJECT_NOT_FOUND,
      `No platformio.ini found in ${projectDir}. This is not a valid PlatformIO project.`,
      { projectDir },
    );
  }
}

/**
 * Validates that the specified environment exists in platformio.ini.
 *
 * Throws `PioMcpError` with code `ENV_NOT_FOUND` and a list of available
 * environments in `data.available` if not found.
 *
 * @param {string} projectDir — Absolute path to the project directory
 * @param {string} envName — Name of the environment (without the "env:" prefix)
 */
export function assertEnvExists(projectDir, envName) {
  const iniPath = path.join(projectDir, 'platformio.ini');
  const iniContent = fs.readFileSync(iniPath, 'utf8');

  // Match env names including hyphens (e.g., [env:my-env], [env:esp32-s3])
  const envSectionPattern = /\[env:([\w][\w-]*)\]/g;
  const envs = [];
  let match;
  while ((match = envSectionPattern.exec(iniContent)) !== null) {
    envs.push(match[1]);
  }

  if (!envs.includes(envName)) {
    throw new PioMcpError(
      ERROR_CODES.ENV_NOT_FOUND,
      `Environment '${envName}' not found in platformio.ini. Available environments: ${envs.join(', ')}`,
      { envName, available: envs },
    );
  }
}
