---
last_mapped_commit: db5db691cd9960e04ae8fe13e2d6a6f62eebeb56
last_mapped_at: 2026-11-09
---
# Technology Stack

**Analysis Date:** 2026-11-09

## Languages

**Primary:**
- JavaScript (ES2022) — entire server implementation in `src/`, ESM only (`"type": "module"` in `package.json`). Files: `src/server.js`, `src/tools/*.js`, `src/parsers.js`, `src/metadata.js`, `src/errors.js`, `src/tasks.js`, `src/workspace.js`, `src/utils.js`.

**Secondary:**
- Bash — agent-facing fallback scripts in `.agents/skills/pio-mcp-manager/assets/` (`build.sh`, `upload.sh`, `clean.sh`, `discover.sh`, `monitor.sh`, `test.sh`). Not executed by the server; used by agents when the MCP tier is unavailable.
- TypeScript — types-only config `tsconfig.json` (`allowJs: true`, `checkJs: false`, `strict: false`). No `.ts` source files exist.

## Runtime

**Environment:**
- Node.js >= 18.0.0, declared in `package.json` → `engines.node`.
- Build target `node18` in `build.mjs` (esbuild `target: 'node18'`, `platform: 'node'`).
- Local toolchain observed: Node v26.13.0, npm 12.2.2.

**Package Manager:**
- npm, lockfile `package-lock.json` present (`lockfileVersion: 3`).

## Frameworks

**Core:**
- `@modelcontextprotocol/sdk` — MCP server framework. Declared `^1.12.1`, resolved `1.29.0` in `package-lock.json`. Provides `McpServer`, `StdioServerTransport`, `StreamableHTTPServerTransport`, `RootsListChangedNotificationSchema` (`src/server.js`).
- `zod` — tool input schemas and validation. Declared `^3.23.8`, resolved `3.25.76`. Every tool registers a `z.object`-shaped parameter schema (`src/tools/build.js`, `src/tools/upload.js`, `src/tools/discover.js`, `src/tools/monitor.js`, `src/tools/test.js`, `src/tools/check.js`, `src/tasks.js`).

**Testing:**
- `jest` 29.7.0 — declared with script `node --experimental-vm-modules node_modules/jest/bin/jest.js`. No Jest config file and no `*.test.js`/`*.spec.js` files exist in the repo; the only executable check is `test/uat-sesaiotnode.mjs`, a standalone Node UAT harness.

**Build/Dev:**
- `esbuild` 0.25.12 — bundles `src/server.js` into `dist/server.js` via `build.mjs` (ESM output, Node builtins marked `external`: `child_process`, `fs`, `path`, `os`, `crypto`, `net`).
- `eslint` 8.57.1 — script `eslint src/`; no `.eslintrc*` / `eslint.config.*` file present, so lint runs on ESLint 8 defaults.

## Key Dependencies

**Critical:**
- `@modelcontextprotocol/sdk` — the entire protocol surface: registration, stdio/HTTP transports, roots capability. Upgrade this first; tool registration uses `server.tool(name, description, zodShape, handler)`.
- `zod` — parameter contracts shown to MCP clients; defaults and `.describe()` text are part of the public tool API.

**Infrastructure:**
- Node builtins only — `child_process` (exec/spawn in `src/utils.js`, `src/tools/*.js`), `fs`, `path`, `os` (serial log dirs), `http` + `crypto` (HTTP transport and session IDs in `src/server.js`). No Express, Hono, or other web framework is a direct dependency of this project (they appear only transitively under `@modelcontextprotocol/sdk` in `package-lock.json`).
- PlatformIO Core CLI (`pio`) — external binary invoked for all firmware work; not an npm dependency.

## Configuration

**Environment:**
- `PIO_WORKSPACE_ROOT` — fixed workspace root override (`src/server.js:35`). When set (or `--workspace` passed), boundary enforcement is on via `workspaceFixed`.
- `PORT` — HTTP port alternative to `--port` (`src/server.js:73`).
- `npm_package_version` — read for server name/version reporting only.
- Workspace resolution order when no explicit root: MCP `roots` → `process.cwd()`, documented in `src/workspace.js`.

**Build:**
- `build.mjs` (esbuild bundle), `tsconfig.json` (JS inclusion/outDir only), `package.json` scripts (`build`, `start`, `test`, `lint`).
- `dist/` is gitignored (`.gitignore`) and produced by `npm run build`; `package.json` `bin.pioneer` points at `./dist/server.js`.

**Dev harness:**
- `.mcp.json` is gitignored and registers local MCP servers (e.g. `gsd-workflow`) for the development session; it is not part of the shipped runtime.

## Platform Requirements

**Development:**
- Node.js >= 18 and npm.
- PlatformIO Core installed and `pio` on `PATH` for any tool call that shells out.
- POSIX shell with `stty` for `pio_serial_start` (monitor uses `sh -c 'stty -F <port> <baud> raw && cat <port>'` in `src/tools/monitor.js`; not portable to Windows).

**Production:**
- Runs as a local child process of an MCP host over stdio, or as a long-lived local HTTP server (`--port`) — deployment target is the developer workstation, not a hosted service.
- Requires a writable PlatformIO project directory (`platformio.ini` present) and, for monitoring, a readable serial device plus write access to `<project>/.logs/`.

---

*Stack analysis: 2026-11-09*
