/**
 * Workspace root resolution.
 *
 * Resolves the PlatformIO project directory the server should operate on.
 *
 * Resolution order (first match wins):
 *   1. Explicit override — `--workspace` CLI flag or `PIO_WORKSPACE_ROOT` env.
 *      Boundary is fixed and enforced (project must live under this root).
 *   2. MCP `roots` capability — ask the connected client for its workspace
 *      roots and pick the first one that contains a `platformio.ini`.
 *      This is what hosts like Antigravity, Claude Desktop, and Cursor
 *      provide; VS Code's MCP client does NOT advertise `roots`, so this
 *      path is skipped there.
 *   3. Fallback — `process.cwd()`. Works for hosts (VS Code) that spawn the
 *      stdio server with cwd set to the workspace folder.
 *
 * Why this exists: hosts that launch the MCP server as a detached/global
 * process without inheriting the project's cwd cause `process.cwd()` to
 * resolve to the user's home directory. The `roots` capability is the
 * spec-compliant way for the server to discover the active project.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Cached resolution result. Invalidated on `roots/list_changed`.
 * @type {{ value: string|null, source: string } | null}
 */
let cache = null;

/**
 * Returns true if the given directory is a PlatformIO project.
 *
 * @param {string} dir
 * @returns {boolean}
 */
function isPioProject(dir) {
  if (!dir || typeof dir !== 'string') return false;
  try {
    return fs.existsSync(path.join(dir, 'platformio.ini'));
  } catch {
    return false;
  }
}

/**
 * Normalize a list of MCP Root objects into filesystem paths.
 *
 * Strips `file://` prefixes and decodes percent-escaping. Returns only
 * non-empty string paths; invalid entries are dropped.
 *
 * @param {Array<{ uri: string, name?: string }>} roots
 * @returns {string[]}
 */
function rootsToPaths(roots) {
  if (!Array.isArray(roots)) return [];
  const paths = [];
  for (const r of roots) {
    if (!r || typeof r.uri !== 'string') continue;
    let p = r.uri;
    if (p.startsWith('file://')) {
      try {
        p = fileUriToPath(p);
      } catch {
        // leave as-is on parse failure
      }
    }
    if (p && p.length > 0) paths.push(p);
  }
  return paths;
}

/**
 * Search a list of directories for the first that is a PlatformIO project,
 * looking one level down into immediate subdirectories if needed (monorepo
 * layout where the workspace root wraps a single PIO project).
 *
 * @param {string[]} dirs
 * @returns {string|null}
 */
function findPioProjectAmong(dirs) {
  // Prefer a root that is itself a PIO project
  for (const p of dirs) {
    if (isPioProject(p)) return p;
  }
  // Then look one level down (monorepo: root contains a single PIO project)
  for (const p of dirs) {
    let entries;
    try {
      entries = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const child = path.join(p, e.name);
      if (isPioProject(child)) return child;
    }
  }
  return null;
}

/**
 * Pick the best root from a list of MCP Root objects.
 *
 * Prefers roots that directly contain a `platformio.ini`. If none do, falls
 * back to the first root (the host's primary workspace) so downstream
 * `assertPioProject` can produce a precise error.
 *
 * @param {Array<{ uri: string, name?: string }>} roots
 * @returns {string|null} — absolute path, or null if no usable root
 */
export function pickRoot(roots) {
  const candidates = rootsToPaths(roots);
  if (candidates.length === 0) return null;

  const found = findPioProjectAmong(candidates);
  if (found) return found;

  // Last resort: the first candidate (let assertPioProject give a clear error)
  return candidates[0];
}

/**
 * Convert a file:// URI to a filesystem path. Cross-platform.
 *
 * @param {string} uri
 * @returns {string}
 */
function fileUriToPath(uri) {
  // POSIX: file:///home/user/proj  -> /home/user/proj
  // Windows: file:///C:/Users/...  -> C:/Users/...
  const parsed = new URL(uri);
  let p = decodeURIComponent(parsed.pathname);
  // Strip leading slash from Windows drive paths (/C:/... -> C:/...)
  if (/^\/[A-Za-z]:/.test(p)) {
    p = p.slice(1);
  }
  return p;
}

/**
 * Resolve the active project directory.
 *
 * Called lazily by each tool invocation (the MCP `roots/list` round-trip is
 * only possible after the client has initialized). Results are cached and
 * invalidated when the client sends `notifications/roots/list_changed`.
 *
 * @param {object} ctx — server context
 * @param {string|null} ctx.explicitRoot — root set via --workspace/PIO_WORKSPACE_ROOT
 * @param {boolean} ctx.workspaceFixed — true if explicit root is set
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} ctx.server
 * @returns {Promise<{ value: string, source: string }>}
 */
export async function resolveWorkspace(ctx) {
  // 1. Explicit override — always wins, never cached across changes
  if (ctx.workspaceFixed && ctx.explicitRoot) {
    return { value: ctx.explicitRoot, source: 'explicit' };
  }

  // 2. Cached result from a previous roots lookup
  if (cache) {
    return cache;
  }

  // 3. Ask the client for its roots (if it advertises the capability)
  const lowLevel = ctx.server?.server;
  const clientCaps = lowLevel?.getClientCapabilities?.();
  if (clientCaps?.roots && typeof lowLevel.listRoots === 'function') {
    try {
      const result = await lowLevel.listRoots();
      const picked = pickRoot(result?.roots || []);
      if (picked) {
        cache = { value: picked, source: 'roots' };
        return cache;
      }
    } catch (err) {
      console.error(`workspace: roots/list failed: ${err?.message || err}`);
      // fall through to cwd fallback
    }
  }

  // 4. Fallback to process.cwd() (works for VS Code which sets cwd correctly)
  cache = { value: process.cwd(), source: 'cwd' };
  return cache;
}

/**
 * Invalidate the cached workspace resolution.
 *
 * Wire this to the client's `notifications/roots/list_changed` so that
 * switching projects in the host updates the server's target directory.
 */
export function invalidateWorkspaceCache() {
  cache = null;
}
