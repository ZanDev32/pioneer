---
last_mapped_commit: db5db691cd9960e04ae8fe13e2d6a6f62eebeb56
last_mapped_at: 2026-11-09
---
# Coding Conventions

**Analysis Date:** 2026-11-09

## Naming Patterns

**Files:**
- Single-word lowercase modules at the root of `src/`: `src/parsers.js`, `src/metadata.js`, `src/workspace.js`, `src/tasks.js`.
- Tool-family modules live in `src/tools/` and are named after the domain verb: `src/tools/build.js`, `src/tools/upload.js`, `src/tools/clean.js`, `src/tools/discover.js`, `src/tools/monitor.js`, `src/tools/check.js`.
- Standalone scripts use hyphenated lowercase with an `.mjs` extension: `test/uat-sesaiotnode.mjs`. Skill shell assets use plain lowercase: `.agents/skills/pio-mcp-manager/assets/test.sh`.
- Relative imports always carry the `.js` extension — required by ESM: `import { runPioCommand } from '../utils.js';` in `src/tools/build.js`.

**Functions:**
- camelCase, verb-first: `runPioCommand` (`src/utils.js`), `parseAllDiagnostics` (`src/parsers.js`), `resolveWorkspace` (`src/workspace.js`), `registerTaskTools` (`src/tasks.js`).
- Validation helpers are named `assert<Thing>`: `assertWithinWorkspace`, `assertPioProject`, `assertEnvExists` in `src/errors.js`.
- Registration functions are exported one per tool family and named `register<Family>Tools(server, ctx)`: `registerBuildTools` (`src/tools/build.js`), `registerMonitorTools` (`src/tools/monitor.js`).
- Module-private helpers are non-exported, plain functions: `relativize` (`src/parsers.js`), `parsePlatformioIni` (`src/tools/discover.js`), `slugifyPort` / `formatTimestamp` / `ensureLogsDir` (`src/tools/monitor.js`).
- Error-transform helper is `wrapToolError` in `src/errors.js`.

**Variables:**
- Internal JS state is camelCase: `projectDir`, `rawOutput`, `exitCode`, `logPath`, `bytesBefore`.
- Serialized/MCP-facing keys are snake_case: `exit_code`, `binary_size_bytes`, `duration_seconds`, `raw_output`, `bytes_freed`, `task_id` (see `src/tools/build.js`, `src/tools/clean.js`, `src/tasks.js`).
- Module-level constants are SCREAMING_SNAKE: `ERROR_CODES` (`src/errors.js`), `GCC_DIAGNOSTIC_RE` (`src/parsers.js`), `SEVERITY_ORDER` (`src/tools/check.js`). Function-local constants follow the same style: `MAX_READ_BYTES` in `src/tools/monitor.js`.
- Class-private fields use a leading underscore: `this._ttlMs`, `this._cleanupTimer` in `src/tasks.js`.

**Types (JSDoc):**
- Classes are PascalCase: `PioMcpError` (`src/errors.js`), `TaskManager` (`src/tasks.js`).
- Cross-module types are expressed with inline `import('...')`: `@param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server` (`src/tools/clean.js`).

**MCP tool names:**
- Always `pio_` + snake_case verb phrase, matching the table in `.agents/skills/pio-mcp-manager/SKILL.md`: `pio_build`, `pio_upload`, `pio_clean`, `pio_list_devices`, `pio_list_boards`, `pio_task_status`, `pio_task_list`, `pio_serial_start`, `pio_serial_stop`, `pio_serial_read`, `pio_check`, `pio_run_tests`.
- Tool input parameters are snake_case: `task_id`, `build_only`, `include_memory`, `environment`, `port`.

## Code Style

**Formatting:**
- No formatter config exists — no `.prettierrc*`, `.editorconfig`, or `eslint.config.*` in the repository root.
- Hand-maintained style, consistent across `src/`: 2-space indentation, single quotes, semicolons, trailing commas in multi-line literals, arrow functions for callbacks.
- Keep lines near 100 characters. A few tool-description strings exceed it (`src/tools/build.js`, `src/tools/check.js`); do not reformat them without reason.
- Language is ES2022 JavaScript with ESM (`"type": "module"` in `package.json`), bundled by esbuild for Node 18 in `build.mjs`.
- TypeScript is configured but unused: `tsconfig.json` sets `allowJs: true`, `checkJs: false`, `strict: false`, `rootDir: "src"`. Types are JSDoc-only — do not add `.ts` files without a project decision.
- One style defect to avoid copying: inconsistent indentation in `src/tools/discover.js` around the `platformio.ini` section parser (`} else if (section.startsWith('env:')) {`).

**Linting:**
- `package.json` declares `"lint": "eslint src/"` with ESLint 8, but no config file is committed, so the rule set is not defined. Until a config is added, match the surrounding file by hand.

## Import Organization

**Order (use in new files):**
1. Third-party packages — `zod`, `@modelcontextprotocol/sdk/*`.
2. Node built-ins — `path`, `fs`, `child_process`, `crypto`.
3. Local relative modules with explicit `.js`.

Existing files follow the spirit but not the exact order: `src/errors.js` opens with `fs`/`path`; `src/tools/build.js` orders `zod`, `path`, `child_process`, then local imports. `src/workspace.js` and `src/server.js` use the `node:` prefix (`node:fs`, `node:http`), while most modules import bare (`fs`, `path`). Prefer the `node:` prefix for new built-in imports; leave existing bare imports alone unless the file is being reworked.

**Path Aliases:**
- None. All intra-repo imports are relative (`../errors.js`, `./tools/build.js`).

## Tool Definition Pattern

Every MCP tool follows the same skeleton, implemented in `src/tools/*.js` and `src/tasks.js`. Copy `src/tools/clean.js` as the reference implementation:

```js
export function registerCleanTools(server, ctx) {
  server.tool(
    'pio_clean',
    'Clean build artifacts for a specific PlatformIO environment. ...',
    {
      environment: z.string().describe('Build environment to clean (e.g., "esp32dev"). Required.'),
      verbose: z.boolean().optional().default(false).describe('Include full output if true.'),
    },
    async (params) => {
      try {
        const projectDir = (await resolveWorkspace(ctx)).value;

        assertPioProject(projectDir);
        assertEnvExists(projectDir, params.environment);

        const result = { success: true, bytes_freed: 0 };
        if (params.verbose) result.raw_output = rawOutput;

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
```

Rules that hold across all tools:

- Resolve the workspace inside the handler on every call: `const projectDir = (await resolveWorkspace(ctx)).value;`. Never capture `ctx.workspaceRoot` at registration time — it is `null` until lazy resolution runs (`src/server.js`, `src/workspace.js`).
- Validate before executing: `assertPioProject`, then `assertEnvExists` when an environment is given.
- Serialize results with `JSON.stringify(result, null, 2)` as a single `text` content block.
- Omit heavy fields by default. Full CLI output is gated behind `verbose`; memory breakdown behind `include_memory`; incremental filtering behind `incremental`. Parameter descriptions warn about cost with `AVOID: ...` (`src/tools/build.js`, `src/tools/check.js`).
- Register every tool family from `src/server.js` before `server.connect(...)`; do not register tools inside other tool modules.
- Optional flags use `.optional().default(false)` so handlers can read plain booleans.

## Async / Background Task Pattern

Long-running operations accept `async: true` and follow one shape (`src/tools/build.js`, `src/tools/upload.js`, `src/tools/test.js`, `src/tools/monitor.js`):

1. Build a promise for the operation.
2. Register it with `ctx.taskManager.createTask({ type, message, child, meta })` (`src/tasks.js`). `child` is `null` for `exec`-based tools (`src/tools/build.js:162`); `spawn`-based serial monitoring passes the real process.
3. Attach `.then(...)` to call `ctx.taskManager.updateTask(taskId, { status: 'completed' | 'failed', exitCode, result, message })`.
4. Notify the client with `server.server?.sendLoggingMessage?.({ level, data: { task_id, event } })` — optional chaining is required because not all transports expose logging.
5. Return immediately with `{ task_id, status: 'running', message }`.

Task state is exposed through the safe copy in `TaskManager.getTask`, which strips the internal `child` reference and maps camelCase state to snake_case output (`src/tasks.js`). TTL cleanup is 30 minutes with a 5-minute sweep interval.

## Error Handling

**Model:**
- Domain failures are thrown as `PioMcpError(code, message, data = {})` (`src/errors.js`).
- Codes come from `ERROR_CODES`: JSON-RPC standards `-32602` / `-32603` plus tool-specific `-32001` … `-32009` (`PROJECT_NOT_FOUND`, `ENV_NOT_FOUND`, `BUILD_FAILED`, `UPLOAD_FAILED`, `PIO_NOT_INSTALLED`, `PORT_BUSY`, `PROJECT_OUTSIDE_WORKSPACE`, `NO_DEVICE`, `PIO_COMMAND_NOT_FOUND`). Add new codes inside `-32000`…`-32099` with a one-line JSDoc comment.
- Every handler catch block calls `wrapToolError(err)` and returns `{ content: [...], isError: true }`. Tool handlers must never throw to the transport — the comment in `src/tools/build.js:280` states this explicitly ("Return error as structured content (not thrown — keeps server stable)").
- Command failures are converted to result objects rather than exceptions when the caller can act on them: `cleanSuccess` / `exitCode` capture in `src/tools/clean.js`, `buildSuccess` in `src/tools/build.js`.
- Detect shell-level "pio missing" output with the shared regex `/command not found|ENOENT|'pio' is not recognized/i` (`src/tools/build.js`, `src/tools/check.js`).
- `runPioCommand` rejects with a plain object `{ code, stdout, stderr, combined, message, timedOut }` (`src/utils.js`); callers read `.combined` and `.code` directly.

## Logging

**Framework:** None. `console.error` is the only process-level logging channel, because stdout is owned by the stdio MCP transport (`src/server.js`). `console.log` is reserved for `--help` output.

**Patterns:**
- Startup/lifecycle messages carry a stable prefix: `Pioneer starting...`, `Mode: stdio ...`, `Server ready`, `Shutting down...` (`src/server.js`).
- Subsystem logs prefix the module name: `workspace: roots/list failed: ...` (`src/workspace.js`), `workspace: roots/list_changed — invalidating cache` (`src/server.js`).
- Structured, client-visible events go through MCP logging (`sendLoggingMessage`) with snake_case `data` keys (`task_id`, `event`).
- Do not introduce a logging dependency; extend `console.error` usage.

## Comments

**When to Comment:**
- Every module opens with a `/** ... */` file header naming its purpose and the MCP tools it provides (e.g. `src/tools/discover.js`, `src/tools/check.js`, `src/utils.js`).
- Section banners separate logical blocks: `// ---------------------------------------------------------------------------` followed by a short title (`src/tools/build.js`, `src/tasks.js`, `src/parsers.js`, `test/uat-sesaiotnode.mjs`).
- Comment the *why* and the platform quirk, not the mechanics: the `req.rawHeaders` injection note in `src/server.js`, the `stty`/`cat` rationale in `src/tools/monitor.js`, the "avoid circular imports" note in `src/parsers.js`.
- Reference review findings inline when a line exists because of one: `// Code review C-01 fix: env regex must support hyphens` (`test/uat-sesaiotnode.mjs`), `// Code review C-01 fix` pattern.

**JSDoc:**
- Exported functions carry `@param`/`@returns`. Parameter descriptions use an em dash after the name: `@param {string} projectDir — Absolute path to the project directory` (`src/errors.js`). This is the dominant style over a hyphen.
- Document parsed shapes inline above parsers: the diagnostic object shape is declared in the `src/parsers.js` header, and `src/metadata.js` spells out the full metadata return type.
- Regex parsers document the exact matched strings with samples (`src/metadata.js`, `src/parsers.js`).

## Function Design

**Size:** Handlers stay in one function with banner-separated async/sync halves (`src/tools/build.js`); parsing and formatting are extracted into small helpers (`summarizeDiagnostics`, `resolveTestCaseStatus` in `src/tools/test.js`).

**Parameters:** Options objects with destructuring for internal APIs: `createTask({ type, message, child, meta })` (`src/tasks.js`); positional args for command builders: `runPioCommand(args, { projectDir, timeout, maxBuffer })` (`src/utils.js`).

**Return Values:** Pure parsers return arrays of plain objects and never throw on malformed input — unmatched output yields `[]` (`src/parsers.js`). Handlers return MCP `{ content, isError? }` objects.

**Defaults:** Optional string params default to `''` rather than `undefined` (`projectDir = ''` in `src/parsers.js` and `src/metadata.js`); optional timeout is only forwarded to `exec` when supplied (`src/utils.js`).

**Guard clauses:** Validate first, early-return on empty input, e.g. `if (!dir || typeof dir !== 'string') return false;` in `src/workspace.js`, `if (!Array.isArray(roots)) return [];`.

## Module Design

**Exports:** Named exports only; one concern per module. Shared infrastructure lives at `src/` root (`errors.js`, `utils.js`, `parsers.js`, `metadata.js`, `workspace.js`, `tasks.js`); tool registration lives in `src/tools/`.

**Barrel Files:** None. `src/server.js` imports each `register*Tools` function explicitly.

**Dependency direction:** `src/tools/*` may import from `../errors.js`, `../utils.js`, `../parsers.js`, `../metadata.js`, `../workspace.js`. Root modules must not import from `src/tools/` — `src/parsers.js` duplicates the single-line GCC parser specifically to avoid a circular import with `src/tools/build.js`.

**Filesystem access:** Synchronous reads are acceptable for small config files (`fs.readFileSync` for `platformio.ini` in `src/errors.js`, `src/tools/discover.js`). Process execution always goes through `runPioCommand` or `exec`/`spawn` with an explicit `cwd`, a large `maxBuffer` (50 MB), and a timeout where the operation can hang.

**Security boundary:** Never compute paths from user input without `assertWithinWorkspace`, and keep project paths under the resolved workspace root when `ctx.workspaceFixed` is true (`src/errors.js`, `src/workspace.js`).

---

*Convention analysis: 2026-11-09*
