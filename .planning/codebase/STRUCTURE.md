---
last_mapped_commit: db5db691cd9960e04ae8fe13e2d6a6f62eebeb56
last_mapped_at: 2026-11-09
---
# Codebase Structure

**Analysis Date:** 2026-11-09

## Directory Layout

```text
pio-helper/                      # repo root (package name: "pioneer")
├── src/                         # all server source (ESM JavaScript)
│   ├── server.js                # entry point: args, ctx, tool registration, transports
│   ├── workspace.js             # project root resolution + cache
│   ├── errors.js                # PioMcpError, ERROR_CODES, assertions
│   ├── utils.js                 # runPioCommand, hasErrors
│   ├── parsers.js               # build-output diagnostic parsers
│   ├── metadata.js              # duration/size/RAM/Flash + incremental filtering
│   ├── tasks.js                 # TaskManager + pio_task_* tools
│   └── tools/                   # one module per tool family
│       ├── build.js             # pio_build
│       ├── upload.js            # pio_upload
│       ├── clean.js             # pio_clean
│       ├── discover.js          # pio_list_devices, pio_list_boards
│       ├── monitor.js           # pio_serial_start/_stop/_read
│       ├── check.js             # pio_check
│       └── test.js              # pio_run_tests
├── test/                        # manual UAT harness (not jest)
│   └── uat-sesaiotnode.mjs      # exercises all 12 tools against a real PIO project
├── dist/                        # generated, gitignored
│   └── server.js                # esbuild bundle (entry for the `pioneer` bin)
├── build.mjs                    # esbuild build script
├── package.json                 # scripts, bin, deps
├── tsconfig.json                # allowJs/checkJs:false — editor typing only
├── README.md                    # install + host configuration (stdio/HTTP)
├── .agents/skills/pio-mcp-manager/
│   ├── SKILL.md                 # agent-facing tool contract + 3-tier fallback
│   └── assets/*.sh              # Tier-3 shell wrappers (build/upload/clean/...)
├── .planning/                   # GSD project artifacts (PROJECT/ROADMAP/STATE/phases)
└── .gsd/                        # GSD tool state (gitignored)
```

## Directory Purposes

**`src/`:**
- Purpose: Entire server implementation; no build step required to run in place (`node src/server.js` works).
- Contains: 7 flat service modules plus a `tools/` subdirectory.
- Key files: `src/server.js`, `src/workspace.js`, `src/errors.js`.

**`src/tools/`:**
- Purpose: Tool surface. Each file owns one command family and exports exactly one `register<Family>Tools(server, ctx)`.
- Contains: zod schemas, handler bodies, family-local helpers (e.g. `extractJsonArray` in `src/tools/check.js:34`, `parsePlatformioIni` in `src/tools/discover.js`, `tailFile`/`slugifyPort` in `src/tools/monitor.js`).
- Key files: `src/tools/build.js` (flagship, 299 lines), `src/tools/monitor.js` (543 lines, largest).

**`test/`:**
- Purpose: Manual acceptance testing. No Jest test files exist despite the `test` script in `package.json`.
- Contains: `test/uat-sesaiotnode.mjs`, a plain Node ESM script with its own `runTest` harness and a hardcoded `ROOT = '/home/zandev32/Documents/klaklik/SesaIoTNode'`.

**`dist/`:**
- Purpose: Deployable single-file bundle produced by `npm run build`.
- Generated: Yes (`build.mjs` → esbuild, `platform: node`, `target: node18`, format ESM).
- Committed: No (ignored by `.gitignore`).

**`.agents/skills/pio-mcp-manager/`:**
- Purpose: Dual-target agent skill: MCP tool contract plus shell fallbacks for hosts without the server.
- Contains: `SKILL.md` (tool table for all 12 tools, 3-tier hierarchy) and `assets/*.sh` wrappers.
- Note: must be updated whenever a tool is added or renamed — it is the agent-facing contract, not documentation drift.

**`.planning/`:**
- Purpose: GSD workflow state and phase artifacts (`PROJECT.md`, `ROADMAP.md`, `STATE.md`, `phases/`, `threads/`).
- Generated: by GSD workflows; committed.

## Key File Locations

**Entry Points:**
- `src/server.js`: source entry point (`main()` at `src/server.js:84`, tool registration at `src/server.js:107-114`).
- `dist/server.js`: published bin target declared in `package.json` (`"bin": { "pioneer": "./dist/server.js" }`).
- `test/uat-sesaiotnode.mjs`: manual test entry point.

**Configuration:**
- `package.json`: scripts (`build`, `start`, `test`, `lint`), deps (`@modelcontextprotocol/sdk`, `zod`), Node `>=18`.
- `tsconfig.json`: `allowJs: true`, `checkJs: false`, `strict: false` — types are JSDoc-only, never enforced.
- `build.mjs`: esbuild config, externalizes `child_process`, `fs`, `path`, `os`, `crypto`, `net`.
- `src/server.js:30-82` (`parseArgs`) and env vars `PIO_WORKSPACE_ROOT`, `PORT`: runtime configuration.

**Core Logic:**
- `src/utils.js:21` (`runPioCommand`): the only shared CLI executor.
- `src/parsers.js:260` (`parseAllDiagnostics`): diagnostic aggregation entry point.
- `src/workspace.js:156` (`resolveWorkspace`): every handler's first call.
- `src/tasks.js:17` (`TaskManager`): async operation state.

**Testing:**
- `test/uat-sesaiotnode.mjs`: the only executable test artifact.
- `.planning/phases/02-tool-expansion/UAT-REPORT.md`: recorded UAT results.

## Naming Conventions

**Files:**
- Lowercase single word, no separators: `build.js`, `workspace.js`, `metadata.js`. Never `build-tools.js` or `BuildTools.js`.
- One file per MCP command family: `upload.js` holds only `pio_upload`.

**Functions:**
- `camelCase`. Exported registration functions use the `register<Family>Tools` pattern: `registerBuildTools`, `registerMonitorTools`, `registerTaskTools`.
- Helpers are not exported unless shared across files: `summarizeDiagnostics` (`src/tools/build.js:35`) and `hasErrors` (`src/utils.js:67`) are exported; `extractJsonArray` (`src/tools/check.js:34`) is not.

**MCP tool names:**
- `snake_case` with `pio_` prefix, verb-last: `pio_build`, `pio_upload`, `pio_clean`, `pio_check`, `pio_run_tests`, `pio_list_devices`, `pio_list_boards`, `pio_serial_start`, `pio_serial_stop`, `pio_serial_read`, `pio_task_status`, `pio_task_list`.

**Variables:**
- `camelCase` locals; `SCREAMING_SNAKE_CASE` for module constants: `ERROR_CODES` (`src/errors.js:32`), `SEVERITY_ORDER` (`src/tools/check.js:49`), `MAX_READ_BYTES` (inside `tailFile`, `src/tools/monitor.js:93`).
- Private instance fields prefixed with `_`: `this._cleanupTimer`, `this._ttlMs` (`src/tasks.js:22-28`).

**Data fields (wire format):**
- JSON response fields are `snake_case`: `exit_code`, `task_id`, `log_file`, `search_pattern`, `binary_size_bytes`, `duration_seconds`, `ram_used_bytes`. Follow this for anything returned to a host.

**Parameters:**
- zod field names are `snake_case` (`build_only`, `include_memory`, `timeout_seconds`) to match the wire format; only `async` remains a reserved word.

## Where to Add New Code

**New MCP tool family:**
- Implementation: create `src/tools/<family>.js` exporting `register<Family>Tools(server, ctx)`; copy the schema/response style from `src/tools/clean.js` (smallest complete example).
- Wiring: import and call it in `src/server.js:107-114`, before any transport connect.
- Docs: add the tool to the table in `.agents/skills/pio-mcp-manager/SKILL.md` and to the tool list in `README.md`.

**New tool inside an existing family:**
- Add another `server.tool(...)` inside that file's `register<Family>Tools`; keep one command family per file. Example: `pio_list_boards` sits beside `pio_list_devices` in `src/tools/discover.js:395`.

**New output parser:**
- Add `export function parse<Thing>(output, projectDir = '')` to `src/parsers.js` returning the unified diagnostic shape, then include it in the merge at `src/parsers.js:260`. Add a family-local helper instead if only one tool needs it.

**New build metadata field:**
- Extend `parseBuildMetadata` in `src/metadata.js:35`; do not parse in handlers.

**New error code:**
- Add to `ERROR_CODES` in `src/errors.js:32` using the `-3201x` range, then throw `new PioMcpError(ERROR_CODES.X, message, data)`.

**New shared CLI helper:**
- Add to `src/utils.js` next to `runPioCommand`; never re-implement command construction in a tool module.

**New precondition guard:**
- Add to `src/errors.js` beside `assertPioProject` / `assertEnvExists`; keep them pure and synchronous.

**Async-capable operation:**
- Prefix the handler with `assertPioProject` → build work promise → `ctx.taskManager.createTask({ type, message })` → return `{ task_id, status: 'running' }`; pattern at `src/tools/build.js:129-185`.

**Assets:**
- Shell wrappers belong in `.agents/skills/pio-mcp-manager/assets/`; no other asset directory exists.

## Special Directories

**`dist/`:**
- Purpose: Published bundle consumed by the `bin` entry.
- Generated: Yes — rebuild with `npm run build` after any `src/` change.
- Committed: No.

**`.gsd/`:**
- Purpose: Local GSD database and activity logs (`gsd.db`, `STATE.md`, `CODEBASE.md`).
- Generated: Yes.
- Committed: No (gitignored).

**`.planning/`:**
- Purpose: Committed planning and verification artifacts that downstream GSD phases read.
- Generated: Partially (by workflows), but committed intentionally.
- Committed: Yes.

**`node_modules/`:**
- Purpose: Installed dependencies.
- Generated: Yes.
- Committed: No.

---

*Structure analysis: 2026-11-09*
