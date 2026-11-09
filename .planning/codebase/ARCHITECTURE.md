---
last_mapped_commit: db5db691cd9960e04ae8fe13e2d6a6f62eebeb56
last_mapped_at: 2026-11-09
---
<!-- refreshed: 2026-11-09 -->
# Architecture

**Analysis Date:** 2026-11-09

## System Overview

Pioneer is a single-process, standalone MCP (Model Context Protocol) server that exposes PlatformIO CLI operations to AI hosts. There is no database, no HTTP API beyond the MCP transport, and no long-lived state outside the process.

```text
┌─────────────────────────────────────────────────────────────┐
│                MCP Hosts (VS Code, Claude Desktop,           │
│                    Cursor, Antigravity)                      │
└───────────────┬─────────────────────────┬───────────────────┘
                │ stdio                   │ Streamable HTTP
                ▼                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Transport + Server Wiring — `src/server.js`                 │
│  `StdioServerTransport` / `StreamableHTTPServerTransport`    │
└─────────────────────────────┬───────────────────────────────┘
                              │ registerXTools(server, ctx)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Tool Layer (flat MCP tools, zod input schemas)              │
│  `src/tools/build.js` `src/tools/upload.js`                  │
│  `src/tools/clean.js` `src/tools/discover.js`                │
│  `src/tools/monitor.js` `src/tools/check.js`                 │
│  `src/tools/test.js`  `src/tasks.js` (task tools)            │
└─────────────────────────────┬───────────────────────────────┘
                              │ shared services
        ┌─────────────────────┼──────────────────────┐
        ▼                     ▼                      ▼
┌───────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ Workspace &   │   │ Output           │   │ Task lifecycle   │
│ guard rails   │   │ interpretation   │   │                  │
│ `workspace.js`│   │ `parsers.js`     │   │ `tasks.js`       │
│ `errors.js`   │   │ `metadata.js`    │   │ TaskManager Map  │
└───────┬───────┘   └────────┬─────────┘   └──────────────────┘
        │                    │
        ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Process execution — `src/utils.js` `runPioCommand`          │
│  → `pio` CLI (child_process.exec / spawn) + project FS       │
│  → `<project>/.pio/`, `<project>/.logs/`, `platformio.ini`   │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Server entry | Parse CLI args, build shared `ctx`, register all tools, connect transport, handle shutdown | `src/server.js` |
| Tool registry (build) | `pio_build`; sync + async build, diagnostics parsing, metadata | `src/tools/build.js` |
| Tool registry (upload) | `pio_upload`; build-then-flash, port selection, async path | `src/tools/upload.js` |
| Tool registry (clean) | `pio_clean`; per-env artifact removal and bytes-freed reporting | `src/tools/clean.js` |
| Tool registry (discover) | `pio_list_devices`, `pio_list_boards`; `platformio.ini` parsing, device normalization | `src/tools/discover.js` |
| Tool registry (monitor) | `pio_serial_start` / `_stop` / `_read`; disk-spooled serial daemon | `src/tools/monitor.js` |
| Tool registry (check) | `pio_check`; static analysis JSON with noise-tolerant extraction | `src/tools/check.js` |
| Tool registry (test) | `pio_run_tests`; structured pass/fail per suite, JSON fallback | `src/tools/test.js` |
| Task manager | In-memory task registry, TTL cleanup, cancel escalation, task tools | `src/tasks.js` |
| Workspace resolution | Three-tier root discovery, `roots/list_changed` cache invalidation | `src/workspace.js` |
| Error model | `PioMcpError`, JSON-RPC code table, pre-flight assertions | `src/errors.js` |
| Diagnostic parsers | GCC/Clang, linker, Python, CMake, multi-line notes → unified shape | `src/parsers.js` |
| Build metadata | Duration, RAM/Flash usage, incremental filtering, dir sizing | `src/metadata.js` |
| Command executor | Single `pio <args>` executor with workspace cwd and 50 MB buffer | `src/utils.js` |
| Bundle build | esbuild single-file bundle to `dist/server.js` | `build.mjs` |
| Agent skill layer | 3-tier execution hierarchy (MCP tools → shell wrappers) | `.agents/skills/pio-mcp-manager/SKILL.md` |

## Pattern Overview

**Overall:** Layered MCP server — thin transport wiring, one registration module per tool family, shared service modules for workspace resolution, command execution, and output interpretation. Handlers follow a fixed pipeline: resolve workspace → assert preconditions → execute PIO → parse into structured JSON → return `content[0].text`.

**Key Characteristics:**
- Flat tool namespace (`pio_*`), no resources or prompts registered — only `server.tool(...)`.
- Every tool takes a zod schema and returns JSON-as-text, never raw CLI output by default.
- Token efficiency is an architectural constraint: `verbose` defaults to `false` and its description warns "AVOID: causes 16x token usage" (`src/tools/build.js:77`).
- Long operations have an `async: true` branch that returns `{ task_id, status: 'running' }` and reports via `pio_task_status`.
- All state is per-process; the server assumes one workspace per instance.

## Layers

**Transport layer:**
- Purpose: Speak MCP over stdio or Streamable HTTP and own process lifecycle.
- Location: `src/server.js`
- Contains: `parseArgs()` (`src/server.js:30`), `main()` (`src/server.js:84`), HTTP session-header injection (`src/server.js:145-155`), SIGINT/SIGTERM shutdown.
- Depends on: `@modelcontextprotocol/sdk`.
- Used by: the `pioneer` bin (`dist/server.js`).

**Tool registration layer:**
- Purpose: Declare each MCP tool, its zod schema, and its handler.
- Location: `src/tools/*.js`, plus `registerTaskTools` in `src/tasks.js:189`
- Contains: one `export function register<Family>Tools(server, ctx)` per file; no cross-tool dispatch.
- Depends on: `src/workspace.js`, `src/errors.js`, `src/utils.js`, `src/parsers.js`, `src/metadata.js`, `src/tasks.js`.
- Used by: `main()` in `src/server.js:107-114`, in a fixed order before transport connect.

**Domain orchestration layer (inside handlers):**
- Purpose: Translate a tool call into one or more PIO invocations plus post-processing.
- Location: handler bodies in `src/tools/*.js`
- Contains: argument assembly, `assertPioProject` / `assertEnvExists` calls, sync/async branching, response shaping.
- Depends on: service layer below.
- Used by: MCP host calls.

**Service layer:**
- Purpose: Reusable, tool-agnostic logic.
- Location: `src/workspace.js`, `src/utils.js`, `src/parsers.js`, `src/metadata.js`, `src/errors.js`, `src/tasks.js`
- Contains: pure parsers, filesystem probing, workspace singleton cache, task map.
- Depends on: Node builtins only (`fs`, `path`, `os`, `child_process`, `crypto`).
- Used by: every tool module.

**Execution layer:**
- Purpose: Run `pio` and serial capture processes.
- Location: `runPioCommand` in `src/utils.js:21`; direct `exec`/`spawn` in `src/tools/build.js:130`, `src/tools/upload.js:91`, `src/tools/test.js:205`, `src/tools/monitor.js:200`.
- Contains: shell command construction, `maxBuffer: 50MB`, `cwd: projectDir`, timeout passthrough.
- Depends on: `pio` on `PATH`; OS serial devices.
- Used by: all tool handlers.

## Data Flow

### Primary Request Path — `pio_build` (sync)

1. MCP host calls `pio_build`; SDK validates params against the zod schema (`src/tools/build.js:63-101`).
2. Handler resolves the project: `(await resolveWorkspace(ctx)).value` (`src/tools/build.js:103`), which checks explicit root → MCP roots → `process.cwd()` and caches the result (`src/workspace.js:156-187`).
3. Preconditions: `assertPioProject` and, when `environment` is given, `assertEnvExists` (`src/errors.js:133`, `src/errors.js:153`).
4. Command assembly: `['run', ...]` → `runPioCommand(args, { projectDir })` → `exec` with `cwd: projectDir`, 50 MB buffer (`src/utils.js:21-62`).
5. Post-processing: `parseAllDiagnostics(combined, projectDir)` (`src/parsers.js:260`) merges GCC, linker, Python, CMake results and dedupes by `file:line:message`; `parseBuildMetadata` extracts duration/size/RAM/Flash (`src/metadata.js:35`).
6. Response: `JSON.stringify({ success, exit_code, diagnostics, summary, metadata })` into `content[0].text`; `verbose` echoes `rawOutput`.

### Async Task Path

1. Handler takes the `async: true` branch and starts the same PIO work in the background (`src/tools/build.js:129-160`).
2. `ctx.taskManager.createTask({ type, message, child, meta })` allocates a UUID task id (`src/tasks.js:74`).
3. On completion, `updateTask` sets terminal status and `server.server.sendLoggingMessage({ data: { task_id, event: 'build_complete' } })` (`src/tools/build.js:180`) pushes a progress notification.
4. Host polls `pio_task_status` / `pio_task_list` (`src/tasks.js:189`, `src/tasks.js:217`).
5. `TaskManager` sweeps terminal-state tasks older than 30 minutes every 5 minutes; the interval is `unref()`'d (`src/tasks.js:18-36`).

### Serial Monitor Flow

1. `pio_serial_start` derives a port slug and timestamped log path under `<project>/.logs/` (`src/tools/monitor.js:72`, `src/tools/monitor.js:170`).
2. Spawns `sh -c 'stty -F <port> <baud> raw && cat <port>'` detached, pipes stdout to a non-buffered write stream (`src/tools/monitor.js:200-215`), then `child.unref()` (`src/tools/monitor.js:228`).
3. Registers a `monitor` task carrying `meta.logPath` (`src/tools/monitor.js:231`).
4. `pio_serial_read` reads the tail with a 50 MB byte cap, skips a partial first line, applies the regex filter before slicing the last N lines (`src/tools/monitor.js:90-137`, `src/tools/monitor.js:502`).
5. `pio_serial_stop` calls `taskManager.cancelTask` (SIGTERM, then SIGKILL after 2 s) and overrides status to `stopped` (`src/tools/monitor.js:359-367`, `src/tasks.js:139-163`).

**State Management:**
- `ctx` object created once in `main()` (`src/server.js:97-102`) and passed by reference to every `register*Tools`.
- Module-level `cache` in `src/workspace.js:30` holds `{ value, source }`; invalidated by the `RootsListChangedNotificationSchema` handler (`src/server.js:120-126`).
- `TaskManager.tasks` (`Map`) holds all background operation state; `getTask()` returns a copy that omits the `child` reference, `getRaw()` returns the live object (`src/tasks.js:97-124`).
- No persistence: restarting the server loses tasks and monitor handles.

## Key Abstractions

**`ctx` (server context):**
- Purpose: Single dependency-injection bag shared by all tool modules.
- Shape: `{ explicitRoot, workspaceRoot, taskManager, workspaceFixed }` (`src/server.js:97`).
- Pattern: pass-through DI — tool modules never import the server or construct managers.
- Note: `workspaceRoot` is `null` in lazy mode; handlers must use `resolveWorkspace(ctx)`.

**`resolveWorkspace(ctx)` result:**
- Purpose: Return `{ value, source }` where `source ∈ {explicit, roots, cwd}` so callers can reason about trust level.
- Location: `src/workspace.js:156`.
- Pattern: memoized async resolver; explicit override is never cached.

**`PioMcpError` + `ERROR_CODES`:**
- Purpose: Stable JSON-RPC-compatible failure surface (`-32001..-32009` custom range).
- Location: `src/errors.js:12`, `src/errors.js:32`.
- Pattern: throw domain error in handlers → `wrapToolError` normalizes → `isError: true` response.

**Unified diagnostic shape:**
- Purpose: One object shape from five parsers: `{ file, line, column, type, message, category, severity? }` (`src/parsers.js` header).
- Location: `src/parsers.js`, consumed by `src/tools/build.js` and `src/tools/upload.js`.
- Pattern: composition (`parseAllDiagnostics` calls each parser, merges, dedupes, then attaches multi-line notes).

**`TaskManager`:**
- Purpose: Uniform handle for build/upload/test/check/monitor background work.
- Location: `src/tasks.js:17`.
- Pattern: registry keyed by UUID with terminal-status TTL eviction; cancel escalation SIGTERM → SIGKILL.

**Agent skill layer:**
- Purpose: Tell AI hosts how to use the server, with a fallback ladder when MCP is unavailable.
- Location: `.agents/skills/pio-mcp-manager/SKILL.md` and shell wrappers in `.agents/skills/pio-mcp-manager/assets/*.sh`.
- Pattern: Tier 1 MCP tools → Tier 2 auto-install/health detection → Tier 3 guarded shell fallback.

## Entry Points

**`dist/server.js` (bin `pioneer`):**
- Location: generated by `build.mjs` from `src/server.js` (esbuild, ESM, `target: node18`, node builtins external).
- Triggers: `npx pioneer`, `pioneer`, `node dist/server.js`.
- Responsibilities: identical to `src/server.js`; it is a bundle, not a second implementation.

**`src/server.js` `main()`:**
- Location: `src/server.js:87-200`
- Triggers: process start.
- Responsibilities: arg/env parsing, `McpServer` construction (`name: 'pioneer'`, capabilities `{ logging: {} }`), tool registration, transport selection (`--port`/`PORT` → HTTP on `src/server.js:136-176`, else stdio on `src/server.js:180-184`), shutdown hooks.

**`test/uat-sesaiotnode.mjs`:**
- Location: `test/uat-sesaiotnode.mjs`
- Triggers: manual `node test/uat-sesaiotnode.mjs`.
- Responsibilities: exercises all 12 tools against a hardcoded external PlatformIO project; imports `TaskManager` from `../src/tasks.js`.

## Architectural Constraints

- **Threading:** Single-threaded Node event loop. Concurrency comes from `child_process` only; `TaskManager` state is unsynchronized but safe because all mutations occur on the same loop.
- **Global state:** `cache` in `src/workspace.js:30` (one resolved workspace per process) and one `TaskManager` instance per server (`src/server.js:101`). No other module-level mutable state.
- **Workspace boundary:** Strict containment is enforced only when a root is explicit (`ctx.workspaceFixed === true`); in lazy mode `assertWithinWorkspace` degrades to a `platformio.ini` existence check (`src/errors.js:87-131`).
- **No dependency injection framework:** `ctx` is the only seam; tests cannot swap the executor without module mocking.
- **Circular imports:** none observed. `src/tools/upload.js:20` imports `summarizeDiagnostics` from `src/tools/build.js`, a one-way tool→tool helper import.
- **Build artifact:** `dist/server.js` is generated and gitignored; `npm start` requires `npm run build` first.
- **External tool assumption:** correct behavior depends on `pio` on `PATH` and Unix `stty`/`cat` for serial capture (`src/tools/monitor.js:200`); Windows serial paths are only partially handled.

## Anti-Patterns

### Command string construction in two places

**What happens:** `runPioCommand` builds `pio <args>` internally (`src/utils.js:24-27`), but async branches rebuild the same command string by hand (`src/tools/build.js:121`) because they call `exec` directly instead of reusing the helper.
**Why it's wrong:** quoting rules can drift between paths; a fix to argument escaping must be applied twice.
**Do this instead:** extend `runPioCommand` to support a callback/stream mode, or extract a shared `toCommandString(args)` helper in `src/utils.js` and use it in both places.

### Duplicated sync/async handler bodies

**What happens:** `pio_build`, `pio_upload`, and `pio_run_tests` each implement the same logic once for the blocking path and again inside the background `exec` callback (`src/tools/build.js:132-160`, `src/tools/upload.js:131`, `src/tools/test.js:237`).
**Why it's wrong:** parsing/metadata code can diverge between sync and async results; the two paths already differ in error surfacing.
**Do this instead:** extract a `runAndSummarize(...)` function per tool that both paths call; only the scheduling differs.

### Mixed error conventions in the monitor tools

**What happens:** Most handlers `throw new PioMcpError(...)` and rely on `wrapToolError`, but `pio_serial_stop` and `pio_serial_read` return `{ content: [...], isError: true }` with an ad-hoc `{ error: 'Task not found' }` body (`src/tools/monitor.js:333-341`, `src/tools/monitor.js:451-474`).
**Why it's wrong:** hosts see two different error shapes (`error.code`/`error.data` vs `error` string), and the inline shape bypasses `ERROR_CODES`.
**Do this instead:** throw `new PioMcpError(ERROR_CODES.INVALID_PARAMS, 'Task not found', { task_id })` and let the standard catch block produce the response.

### Killable-child assumption in `TaskManager`

**What happens:** `cancelTask` only works when `task.child` is set (`src/tasks.js:143-148`), but async builds register `child: null` because they use callback `exec` (`src/tools/build.js:162`), so a "cancel" flips the status without stopping the build.
**Why it's wrong:** callers of `pio_task_status` can observe `cancelled` while `pio` keeps burning CPU.
**Do this instead:** store the `ChildProcess` from `child_process.spawn` (or the `exec` return value) on the task so cancellation is real, and report `cancellable: false` when no handle exists.

### `ctx.workspaceRoot` as a live value

**What happens:** `ctx.workspaceRoot` is retained "for backwards-compat" but stays `null` in the default lazy mode (`src/server.js:98-101`); only `resolveWorkspace(ctx)` returns a usable path.
**Why it's wrong:** any new handler reading `ctx.workspaceRoot` directly gets `null` and fails only at runtime.
**Do this instead:** delete `workspaceRoot` from `ctx` and use `(await resolveWorkspace(ctx)).value` everywhere, as `src/tools/clean.js:43` does.

## Error Handling

**Strategy:** Fail fast with domain-typed errors; convert CLI failures into diagnostics rather than exceptions when the failure is informative.

**Patterns:**
- Domain errors: `throw new PioMcpError(code, message, data)`; caught by each handler's `try/catch` and normalized with `wrapToolError` (`src/errors.js:63`).
- Non-zero `pio` exits are rejected as `{ code, stdout, stderr, combined, timedOut }` by `runPioCommand` (`src/utils.js:41-49`), then re-read as data — build failures become `success: false` plus parsed diagnostics rather than thrown errors (`src/tools/build.js:211-228`).
- Environment detection: `/command not found|ENOENT|'pio' is not recognized/i` → `PIO_COMMAND_NOT_FOUND` with `{ hint: 'Run: pip install platformio' }` (`src/tools/build.js:216-222`, `src/tools/discover.js:331-337`).
- Tolerated malformed output: JSON extraction skips PlatformIO issue #4029 noise by slicing from the first `[` (`src/tools/check.js:34-43`); device list parse failures return `[]` instead of throwing (`src/tools/discover.js:338-340`).
- Test runner degrades when `--json-output-path` is unsupported, falling back to text parsing (`src/tools/test.js` header).

## Cross-Cutting Concerns

**Logging:** `console.error` only — stdout is reserved for the stdio MCP transport. Progress events go to clients via `server.server?.sendLoggingMessage(...)` (`src/tools/build.js:169`). The server declares `capabilities: { logging: {} }`.

**Validation:** zod schemas per tool; optional params use `.optional().default(...)`; enums constrain tool/device/severity choices (`src/tools/check.js:98`, `src/tools/discover.js:316`). Post-validation filesystem guards live in `src/errors.js`.

**Authentication:** none. The HTTP transport is unauthenticated and binds to all interfaces via `httpServer.listen(port)` (`src/server.js:158`); intended use is localhost. Session handling relies on `Mcp-Session-Id`, with a raw-header injection workaround for VS Code (`src/server.js:145-155`).

**Workspace safety:** `assertWithinWorkspace` is called before reading arbitrary paths (e.g. `log_file` in `pio_serial_read`, `src/tools/monitor.js:482`).

---

*Architecture analysis: 2026-11-09*
