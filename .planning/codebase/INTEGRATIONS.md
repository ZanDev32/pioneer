---
last_mapped_commit: db5db691cd9960e04ae8fe13e2d6a6f62eebeb56
last_mapped_at: 2026-11-09
---
# External Integrations

**Analysis Date:** 2026-11-09

## APIs & External Services

**MCP Host Clients (inbound):**
- AI hosts connect to this server; the repo names Claude Desktop, Cursor, VS Code, and Antigravity (`README.md`, `src/workspace.js`).
  - Protocol: MCP over `StdioServerTransport` (default) or `StreamableHTTPServerTransport` when `--port`/`PORT` is set (`src/server.js`).
  - SDK/Client: host-provided; the server uses `@modelcontextprotocol/sdk` `McpServer` with `capabilities: { logging: {} }`.
  - Auth: none — the HTTP transport binds the requested port with `http.createServer` and no auth, TLS, or origin checks (`src/server.js:136-160`). Sessions are `crypto.randomUUID()` values; the handler re-injects a missing `mcp-session-id` header for VS Code clients.

**PlatformIO Core CLI (outbound, subprocess):**
- All firmware operations shell out to the `pio` binary on `PATH` via `child_process.exec` with `cwd` = resolved project dir, `maxBuffer` 50 MB, and inherited env (`src/utils.js` `runPioCommand`).
  - Auth: none (local binary, no network calls made by this code).
  - Commands issued:
    - `pio run [-e <env>] [-t compiledb]` — `src/tools/build.js`
    - `pio run -t upload [-e <env>] [-p <port>]` — `src/tools/upload.js`
    - `pio run -t clean -e <env>` — `src/tools/clean.js`
    - `pio check --json-output [-e <env>] [--flags <tool>:] [--severity <level>]` — `src/tools/check.js` (works around PlatformIO issue #4029 where tool-install noise precedes the JSON array)
    - `pio test [-e <env>] [-f <filter>] --json-output-path=<tmpfile>` — `src/tools/test.js`
    - `pio device list --serial|--logical|--mdns --json-output` — `src/tools/discover.js`

**Board/environment metadata (inbound, filesystem):**
- `pio_list_boards` does not call PlatformIO; it parses `platformio.ini` and its `extra_configs` includes with a hand-written INI parser (`src/tools/discover.js:22-236`).

## Data Storage

**Databases:**
- None. No SQL/NoSQL client, no ORM, no migrations anywhere in `src/`.

**File Storage:**
- Local filesystem only. The server reads and writes inside the resolved PlatformIO project:
  - `platformio.ini` (+ `extra_configs` globs) — read for environments/`default_envs` (`src/tools/discover.js`, `src/errors.js`).
  - `.pio/build/<env>/` — `firmware.bin` / `firmware.elf` size and directory mtime for incremental diagnostics (`src/metadata.js`).
  - `.logs/<portSlug>_<YYYY_MM_DD.HH.mm.ss.SSS>.log` — disk-spooled serial monitor output (`src/tools/monitor.js`).
  - OS temp dir — JSON results file written by `pio test --json-output-path`, unlinked after parsing (`src/tools/test.js`).

**Caching:**
- In-process only: workspace resolution cache invalidated on `roots/list_changed` (`src/workspace.js`), and `TaskManager` background-task map with a 30-minute TTL (`src/tasks.js`). No external cache service.

## Authentication & Identity

**Auth Provider:**
- None. No API keys, OAuth, JWT, or user identity. The only trust boundary is the filesystem check `assertWithinWorkspace` in `src/errors.js`, enforced when a fixed workspace root is configured.

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry/OTel). Failures surface as `PioMcpError` with JSON-RPC codes `-32001..-32009` from `src/errors.js` in the tool response.

**Logs:**
- `console.error` to stderr for lifecycle/status messages (keeps stdout clean for the stdio JSON-RPC channel) — `src/server.js`. Serial monitor output is spooled to `.logs/` files instead of memory.

## CI/CD & Deployment

**Hosting:**
- Developer workstation. Distributed as an npm package binary (`bin.pioneer` → `dist/server.js`); no container or serverless target.

**CI Pipeline:**
- None. No `.github/`, `.gitlab-ci.yml`, `Dockerfile`, or `Makefile` in the repo. Build is `npm run build` (esbuild), run manually.

## Environment Configuration

**Required env vars:**
- `PIO_WORKSPACE_ROOT` — optional; pins the project root and enables the boundary check (`src/server.js`).
- `PORT` — optional; selects HTTP mode instead of stdio (`src/server.js`).
- `pio` must be resolvable on `PATH`; missing binary maps to `PIO_COMMAND_NOT_FOUND` (`-32009`).

**Secrets location:**
- None. No `.env` handling, no credentials read or written by the server.

## Webhooks & Callbacks

**Incoming:**
- None beyond the MCP transport endpoint. HTTP mode exposes a single catch-all handler for Streamable HTTP (session + SSE) on the configured port (`src/server.js:145-158`).

**Outgoing:**
- None. No `fetch`, `axios`, or HTTP client calls in `src/`; the only outbound interaction is spawning the local `pio` process.

## Hardware / Device Integration

**Serial devices:**
- Discovered via `pio device list --json-output`, filtered to non-virtual serial ports (`src/tools/discover.js`).
- Monitored by spawning `sh -c 'stty -F "<port>" <baud> raw && cat "<port>"'` as a detached child (`src/tools/monitor.js`), so the monitor integration is POSIX-only and read-only (no stdin to the device).
- Port-in-use conflicts surface as `PORT_BUSY` (`-32006`); no device found as `NO_DEVICE` (`-32008`).

---

*Integration audit: 2026-11-09*
