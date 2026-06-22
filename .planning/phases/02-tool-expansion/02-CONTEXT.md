# Phase 2: Tool Expansion - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add 6 new tools to the pioarduino MCP server: board listing (`pio_list_boards`), device discovery (`pio_list_devices`), serial monitor (start/stop/read), static analysis (`pio_check`), test execution (`pio_run_tests`), and background task support for long-running operations.

This phase delivers **tool capabilities**, not UI, dashboard, or distribution concerns.
</domain>

<decisions>
## Implementation Decisions

### Device Discovery (`pio_list_devices`)
- **D-01:** Use `pio device list --json-output` via `child_process.exec` — consistent with existing `runPioCommand` pattern. Zero new dependencies. Accepts ~1-2s response time in exchange for PlatformIO-aware metadata (port, hwid, description).
- **D-02:** Do NOT add `serialport` npm library. Despite being battle-tested (6k stars, 353k weekly downloads), its native C++ bindings would complicate npm distribution by requiring build toolchains. Serial monitor (also in this phase) uses `pio device monitor` via spawn — no direct port access needed.

### Background Task Feedback
- **D-03:** Layered approach — `pio_task_status` polling as the reliable backbone, with MCP logging (`notifications/message`) as passive progress feedback.
  - **Backbone:** Long-running tools (build, upload) accept an optional `async` parameter. When true, they return a `taskId` immediately and run in the background. Agent polls via `pio_task_status { taskId }` to check progress.
  - **Passive layer:** Server emits structured MCP log messages during execution for hosts that display notifications — zero agent effort needed.
  - **Default:** Sync blocking execution with increased `exec` timeout remains valid for short operations (incremental builds, `pio clean`). Agent opts into async only when it anticipates long runs.
- **D-04:** Do NOT rely on MCP `notifications/progress` (progress tokens) as sole mechanism — Claude Desktop, Cursor, and VS Code Copilot do not reliably pass `_meta.progressToken` in tool calls.

### Serial Monitor Design
- **D-05:** 3 separate tools: `pio_serial_start`, `pio_serial_stop`, `pio_serial_read` — matching the competitor's (jl-codes/platformio-mcp) proven production pattern.
  - `pio_serial_start`: Spawns `pio device monitor` as detached child process, redirects stdout to log file on disk, returns session info.
  - `pio_serial_stop`: Kills daemon, cleans up log file, returns final summary.
  - `pio_serial_read`: Reads tail of log file with `lines` count and optional `searchPattern` regex for targeted reads.
- **D-06:** Disk-spooled via log file (not in-memory ring buffer) — crash-resilient, no data loss on server restart, audit trail preserved. Serial port access goes through `pio device monitor` child process, not `serialport` library.

### Static Analysis (`pio_check`)
- **D-07:** User-selectable `tool` parameter accepting `["cppcheck", "clangtidy", "pvs-studio"]` — mirrors PlatformIO's native `check_tool` config from `platformio.ini`.
- **D-08:** Always use `pio check --json-output` — PlatformIO provides unified structured JSON `{severity, category, message, file, line, column, id}` across all 3 tools, eliminating the need for custom text parsers. Output maps directly to existing diagnostic shape.
- **D-09:** PVS-Studio exposed in enum but degrades gracefully when no commercial license is present (PlatformIO catches license errors internally and reports them in output).

### Agent's Discretion
- Exact file names for new tool modules (e.g., `tools/discover.js`, `tools/monitor.js`, `tools/check.js`, `tools/test.js`)
- Task store implementation (in-memory Map vs persistent file) for `pio_task_status` polling
- Log file location for serial monitor spooling (temp dir vs project `.pio/` dir)
- Default baud rate for serial monitor (115200 is standard for ESP32 but agent can choose)
- Ring buffer size in `pio_serial_read` (competitor uses 1000 lines)
- Whether `pio_list_boards` parses `platformio.ini` directly or uses `pio boards --json-output`
- Test runner (`pio_run_tests`) implementation details — straightforward `pio test` wrapper

## Deferred Ideas

- `serialport` npm library integration — deferred. Would enable sub-second device listing and direct port read/write, but native C++ bindings complicate distribution. Revisit if a future phase requires direct serial communication (e.g., firmware OTA update tool).
- MCP `notifications/progress` as sole progress mechanism — deferred. Will become viable when host support matures for progress tokens across Claude Desktop, Cursor, and VS Code Copilot.
- PVS-Studio license management helper — not needed if PlatformIO handles license errors gracefully. Revisit if enterprise users need license configuration assistance.
- Web dashboard for live serial streaming — Phase 4 territory (Competitive Features).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Configuration
- `.planning/ROADMAP.md` — Phase 2 goal and plan descriptions
- `.planning/REQUIREMENTS.md` — Phase 2 requirements (tool expansion details)
- `.planning/PROJECT.md` — Project overview, technical context, architecture decisions

### Phase 0 Outputs (Core Dependencies)
- `src/server.js` — MCP server entry point, tool registration pattern (`register*Tools(server, ctx)`)
- `src/tools/build.js` — Build tool with `runPioCommand` helper — new tools MUST follow this pattern
- `src/tools/upload.js` — Upload tool with port validation — serial monitor must respect same safety
- `src/tools/clean.js` — Clean tool — simplest tool, good template for new tool structure
- `src/errors.js` — Error taxonomy (ERROR_CODES, validation helpers) — new tools use same error codes
- `src/parsers.js` — Existing GCC/Clang diagnostic parsers — `pio_check` with `--json-output` bypasses these
- `src/metadata.js` — Build metadata extraction — `pio_run_tests` may reuse test result parsing

### Phase 1 Outputs (Constraints)
- `.agents/skills/pio-mcp-manager/SKILL.md` — 3-tier execution hierarchy — new tools register as Tier 1
- `scripts/monitor.sh` — Tier 3 serial monitor fallback — tool design should align with shell wrapper interface
- `scripts/discover.sh` — Tier 3 device discovery fallback
- `scripts/test.sh` — Tier 3 test runner fallback

### Build & Configuration
- `package.json` — Dependencies (MCP SDK ^1.12.1 + zod only), scripts, bin entry
- `build.mjs` — esbuild config — new tool files must be included in bundle entry
- `tsconfig.json` — TypeScript config for type checking

### Competitor Reference
- jl-codes/platformio-mcp — Validated disk-spooled serial monitoring pattern, 3-tool monitor design

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`runPioCommand` in `tools/build.js`**: Central PIO CLI executor using `child_process.exec`. All 6 new tools should reuse this or create a streaming variant (`runPioCommandSpawn`) for serial monitor. The function handles stdout/stderr capture, exit codes, timeout, and pio-installed detection.
- **`src/errors.js`**: Full error taxonomy with `assertPioProject`, `assertEnvExists`, `assertWithinWorkspace` validators. New tools must use these for workspace safety. NO_DEVICE and PIO_COMMAND_NOT_FOUND error codes already exist — device list and serial tools should map to these.
- **Tool registration pattern**: `registerBuildTools(server, ctx)`, `registerUploadTools(server, ctx)`, `registerCleanTools(server, ctx)` — add `registerDiscoverTools`, `registerMonitorTools`, `registerCheckTools`, `registerTestTools`.

### Established Patterns
- **child_process.exec for PIO commands**: All existing tools use synchronous exec. Serial monitor needs `child_process.spawn` with detached mode for background daemon — this is a new pattern for the codebase.
- **Zod input schemas**: All tools define Zod schemas for parameter validation. New tools follow the same approach.
- **Structured response format**: Tools return `{ success, exitCode, diagnostics, summary, metadata }` shape. New tools should have analogous shapes.

### Integration Points
- **`src/server.js`**: Must add imports and registration calls for each new tool group.
- **`build.mjs`**: esbuild entry point — new tool files auto-included if they're imported from server.js.
- **`.agents/skills/pio-mcp-manager/SKILL.md`**: Must be updated with new tool descriptions for Tier 1 reference.

</code_context>

<specifics>
## Specific Ideas

- `pio_list_devices` should support `--serial`, `--logical`, `--mdns` filter flags matching `pio device list` CLI options
- `pio_task_status` should return `{ taskId, status, progress, message, startTime, result }` for polling
- `pio_check` with `--json-output` means the parser layer is nearly trivial — just transform PlatformIO's JSON shape to the MCP diagnostic shape
- Serial monitor log file spooling: use `fs.appendFileSync` or `child_process.spawn` with stdout fd redirect to file, then `pio_serial_read` uses `tail`-equivalent (read last N lines) plus optional `grep`-equivalent (regex filter)
- `pio_run_tests` wraps `pio test` command — test frameworks supported: Unity (default), Google Test, and any PIO-compatible. Output format includes pass/fail counts per test suite

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope
</deferred>

---

*Phase: 02-tool-expansion*
*Context gathered: 2026-06-22*
