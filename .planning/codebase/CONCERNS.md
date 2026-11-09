---
last_mapped_commit: db5db691cd9960e04ae8fe13e2d6a6f62eebeb56
last_mapped_at: 2026-11-09
---
# Codebase Concerns

**Analysis Date:** 2026-11-09

## Tech Debt

**Command construction duplicated outside `src/utils.js`:**
- Issue: `runPioCommand` was extracted in `src/utils.js:33-66`, but `src/tools/build.js:121`, `src/tools/upload.js:81`, and `src/tools/test.js:195` re-implement the same `pio ${args...}` string build inline because they need an `exec` handle for the async path. Four copies of the quoting rule now drift independently.
- Files: `src/utils.js`, `src/tools/build.js`, `src/tools/upload.js`, `src/tools/test.js`
- Impact: any fix to quoting, timeout, or `maxBuffer` must be applied in four places; `src/tools/upload.js:81` and `src/tools/test.js:195` already differ from `src/utils.js:23-25` (no shared helper), so a fix in one silently misses the others.
- Fix approach: make `runPioCommand` return the `ChildProcess` plus a promise (or accept a callback) and delete the three inline copies.

**Vestigial `ctx.workspaceRoot` plus stale JSDoc on every registrar:**
- Issue: `src/server.js:99-101` keeps `workspaceRoot` "for backwards-compat", but workspace resolution moved to `resolveWorkspace(ctx)` in `src/workspace.js:135-185`. Every tool registrar still documents `@param {{ workspaceRoot: string }} ctx` (`src/tools/build.js:60`, `src/tools/check.js:86`, `src/tools/clean.js:25`, `src/tools/discover.js:303`, `src/tools/monitor.js:136`, `src/tools/test.js:139`, `src/tools/upload.js:38`, `src/tasks.js:187`).
- Files: `src/server.js`, `src/tools/*.js`, `src/tasks.js`
- Impact: the docs assert a contract the code no longer fulfils; `ctx.workspaceRoot` is `null` in lazy mode (`src/server.js:101`), so anything reading it later gets `null` at runtime with no type system to catch it (`tsconfig.json` sets `checkJs: false`).
- Fix approach: delete `workspaceRoot` from `ctx` and drop it from the JSDoc blocks.

**Two independent `platformio.ini` parsers:**
- Issue: `src/errors.js:145-172` (`assertEnvExists`) and `src/tools/discover.js:243-300` (`parsePlatformioIniRaw`) each parse the same file with different rules. `src/errors.js` ignores `extra_configs`; `src/tools/discover.js:128-150` expands them.
- Files: `src/errors.js`, `src/tools/discover.js`
- Impact: an environment defined only in an `extra_configs` file passes `pio_list_boards` but fails `assertEnvExists`, so `pio_build -e <that env>` is rejected as "not found".
- Fix approach: have `assertEnvExists` call the discover-side resolver, or extract one ini module both import.

**README documents 3 of 12 tools:**
- Issue: `README.md:107-128` covers only `pio_build`, `pio_upload`, `pio_clean`. Registered tools are the 12 in `src/tools/*.js` and `src/tasks.js:191,218` (build, upload, clean, check, list_devices, list_boards, serial_start/stop/read, run_tests, task_status, task_list).
- Files: `README.md`
- Impact: users cannot discover `pio_check`, `pio_run_tests`, or the serial monitor; `.agents/skills/pio-mcp-manager/SKILL.md` is the only complete list.
- Fix approach: generate the tool table from the registrations or copy the skill table into `README.md`.

**Duplicated docblock in `src/metadata.js`:**
- Issue: `getDirSize` has two consecutive JSDoc blocks (`src/metadata.js:176-188`), the second re-declaring the same "Returns the size (in bytes)" summary.
- Files: `src/metadata.js`
- Impact: cosmetic, but signals an unresolved merge/paste.
- Fix approach: delete the first block.

**`npm run lint` cannot run:**
- Issue: `package.json:12` runs `eslint src/`, eslint 8 is installed, and there is no `.eslintrc*`/`eslint.config.*` in the repo.
- Files: `package.json`
- Impact: ESLint exits with "No ESLint configuration found"; the lint gate has never been enforceable.
- Fix approach: add an `eslint.config.js` (flat config for eslint 9, or `.eslintrc.json` for the pinned v8) or drop the script.

## Known Bugs

**`pio_serial_stop` does not release the serial port (`sh -c` survives the kill):**
- Symptoms: after `pio_serial_stop`, the next `pio_upload`/`pio_serial_start` on the same port can fail with "port busy"; the log keeps growing after stop.
- Files: `src/tools/monitor.js:200` spawns `sh -c 'stty ... && cat /dev/ttyUSB0'`; `src/tools/monitor.js:366` calls `TaskManager.cancelTask`, which kills only the `sh` PID (`src/tasks.js:143-160`).
- Trigger: start a monitor, stop it, immediately upload.
- Workaround: kill the leftover `cat` manually (`pkill -f "cat /dev/tty"`).
- Fix: `process.kill(-child.pid, 'SIGTERM')` on the detached process group, or drop the `sh -c` wrapper and open the port directly.

**Serial monitor is Linux-only despite cross-platform claims:**
- Symptoms: on macOS the monitor produces no data — `stty -F` is GNU coreutils syntax; Darwin requires `-f`.
- Files: `src/tools/monitor.js:186-200`; `src/workspace.js:118-131` goes out of its way to support Windows drive paths, so cross-platform is an explicit goal.
- Trigger: `pio_serial_start` on macOS or Windows (`sh`/`stty`/`cat` do not exist on Windows at all).
- Fix: choose per-platform command (`stty -f` on Darwin, none on Windows) or use a serial library.

**Async tasks can hang forever at `running`:**
- Symptoms: `pio_task_status` returns `running` indefinitely and the task never leaves the map.
- Files: `src/tools/build.js:133-160` — the `exec` callback calls `parseAllDiagnostics`/`parseBuildMetadata` and `resolve(...)` with no `try/catch`. A throw inside the callback leaves the promise pending; `execPromise.then` (`src/tools/build.js:167`) never fires, so `updateTask` never runs. `TaskManager.cleanup` only evicts terminal statuses (`src/tasks.js:39`), so the entry leaks for the process lifetime.
- Trigger: any parser exception (unexpected binary garbage on stdout, unreadable `.pio` cache).
- Fix: wrap the callback body in `try/catch` and reject; add `.catch` on `execPromise`.

**`pio_check` failed its recorded UAT run:**
- Symptoms: `.planning/phases/02-tool-expansion/UAT-REPORT.md` records test 11 (`pio_check`) as `❌` with 0 ms duration and no cause.
- Files: `src/tools/check.js:122-139` builds `pio check --json-output`, optionally `--flags <tool>:` and `--severity <level>`.
- Trigger: unknown. `pio check --help` on this machine does accept `--severity` and `--flags`, so the failure is most likely the `--flags "cppcheck:"` form (an empty tool-flag payload) or the JSON-shape assumption in `src/tools/check.js:167-186` [INFERENCE].
- Fix: reproduce against `test/uat-sesaiotnode.mjs` test 11 and assert the parsed shape.

## Security Considerations

**Shell injection through `pio_upload.port`, `pio_test.filter` and `runPioCommand`:**
- Risk: arbitrary command execution on the host running the MCP server.
- Files: `src/tools/upload.js:79,81` (`params.port` → `-p ${port}`), `src/tools/test.js:185,195` (`params.filter` → `-f ${filter}`), `src/utils.js:23-26`, `src/tools/build.js:121`, `src/tools/monitor.js:200`.
- Current mitigation: quoting only when the argument already contains a space (`a.includes(' ') ? \`"${a}"\` : a`). That catches neither `p`->`; rm -rf ~` (`pio upload -p ;rm -rf ~` — no space inside the injected token if chained with `;`) nor embedded `"`/`$(...)`/backticks.
- Recommendations: switch to `execFile('pio', args)`/`spawn('pio', args)` and delete the string concatenation entirely; validate `port` against `^(/dev/[\w./-]+|COM\d+)$` and `filter` against `^[\w .:/-]+$` at the zod layer in `src/tools/upload.js:49` and `src/tools/test.js:150`.

**HTTP mode exposes unauthenticated command execution on all interfaces:**
- Risk: anyone who can reach the port can build, clean, and upload firmware — and, via the injection above, run arbitrary host commands.
- Files: `src/server.js:146-161`: `http.createServer` + `httpServer.listen(config.port)` with no host argument (binds `0.0.0.0`) and no auth/token check on `handleRequest`. `README.md:37-56` instructs users to expose it on a port for VS Code.
- Current mitigation: none. Session id is generated per process (`src/server.js:140`) but that is not authentication.
- Recommendations: default `listen` to `127.0.0.1`, require an explicit `--host` to widen it, and gate non-local binds behind a bearer token.

**`pio_serial_read` boundary check depends on a client-supplied path:**
- Risk: reading arbitrary files if the guard is bypassed.
- Files: `src/tools/monitor.js:482-486` calls `assertWithinWorkspace(path.resolve(logPath), projectDir)` only when `projectDir` is truthy; `log_file` comes straight from the caller (`src/tools/monitor.js:441`).
- Current mitigation: the guard runs for both branches in practice (`resolveWorkspace` always returns a value or throws).
- Recommendations: make `projectDir` mandatory for `log_file` and reject absolute paths outside `<projectDir>/.logs` specifically, not just outside the workspace.

## Performance Bottlenecks

**Whole-log reads in `pio_serial_stop`:**
- Problem: line counting reads the entire log into a string.
- Files: `src/tools/monitor.js:353` and `src/tools/monitor.js:505` (`fs.readFileSync(logPath, 'utf8')`), in contrast to `tailFile` (`src/tools/monitor.js:90-125`) which caps at 50 MB.
- Cause: `Buffer.alloc`/`readSync` capping was applied to the read path only.
- Improvement path: count newlines off the capped tail buffer (or `fs.statSync().size` plus an estimated bytes-per-line) and never materialise the full file.

**50 MB `maxBuffer` on every build/upload/test:**
- Problem: each `exec` may buffer 50 MB of stdout plus the same in stderr plus the concatenated `combined` string (`src/utils.js:27-37`) — up to ~150 MB transient per concurrent task, and the raw log is retained in `rawOutput`/task result.
- Files: `src/utils.js`, `src/tools/build.js:130-132`, `src/tools/upload.js:91-93`, `src/tools/test.js:205-207`
- Cause: buffer sized for the worst ESP-IDF build, paid by every command.
- Improvement path: stream with `spawn` and keep only the parser-relevant tail; drop `combined` once parsed.

**No cap on diagnostics count:**
- Problem: `parseAllDiagnostics` (`src/parsers.js:262-281`) and `parseSingleLineGCC` (`src/parsers.js:215-241`) return every match. A header included by 200 translation units produces thousands of identical warnings, all serialised into the tool response.
- Files: `src/parsers.js`, `src/tools/build.js:145-152`
- Cause: dedupe is by file+line+message only; no `max_diagnostics` knob.
- Improvement path: group repeated diagnostics by fingerprint with a count, and add a top-N cap parameter.

## Fragile Areas

**Regex-based build-output parsing:**
- Files: `src/parsers.js:33-258` (linker, Python, CMake, GCC regexes), `src/tools/check.js:167-186` (`extractJsonArray` against known PlatformIO issue #4029 noise).
- Why fragile: the contracts are undocumented compiler/toolchain output strings; a GCC or PlatformIO reword silently yields zero diagnostics — which the build tool reports as `success: true, summary: 'no diagnostics'` (`src/tools/build.js:44-52`).
- Safe modification: add fixtures captured from real builds before changing any regex; treat "0 diagnostics + non-zero exit" as a parse failure rather than success.
- Test coverage: none (`test/` holds one manual UAT script).

**Async task cancellation is a silent no-op for build/upload/test:**
- Files: `src/tools/build.js:162` (`const child = null`), `src/tools/upload.js:131-135` and `src/tools/test.js:237-241` (no `child` passed), `src/tasks.js:143-146` (`if (!task || !task.child) return false`).
- Why fragile: the task is marked `cancelled` only by whoever calls `cancelTask`; for these three types there is no caller and no handle, so a runaway upload or a 20-minute build cannot be stopped through the MCP surface at all.
- Safe modification: keep the `exec` `ChildProcess` (`exec` returns one) and pass it as `child`, then kill the process group.
- Test coverage: the UAT run only exercised `pio_task_status`/`pio_task_list` against an empty and a stub task (`UAT-REPORT.md` tests 7-9).

**Fixed-path test results file races:**
- Files: `src/tools/test.js:190-220` writes and unlinks `<project>/.pio/test-results.json` on every run, sync and async.
- Why fragile: two concurrent `pio_run_tests` calls (or two MCP sessions in HTTP mode) overwrite each other's output before it is read; the `catch {}` around the read (`src/tools/test.js:217-222`) turns the collision into `jsonResults: null` rather than an error.
- Safe modification: use `path.join(os.tmpdir(), \`pio-test-${crypto.randomUUID()}.json\`)` and delete it in a `finally`.

**Module-level workspace cache shared by all HTTP clients:**
- Files: `src/workspace.js:28` (`let cache = null`), consumed by `resolveWorkspace` (`src/workspace.js:135-185`); a single `McpServer` + single `StreamableHTTPServerTransport` in `src/server.js:139-161`.
- Why fragile: in `--port` mode every connected client shares one resolved workspace and one `TaskManager`, so a second client working on a different project gets the first client's directory, and `roots/list_changed` invalidation (`src/server.js:120-125`) is global.
- Safe modification: resolve the workspace per tool call when `ctx.explicitRoot` is set, or build a transport/server pair per HTTP session.

## Scaling Limits

**Task state is process-local and ephemeral:**
- Current capacity: unbounded `Map` entry count bounded only by TTL for terminal tasks (`src/tasks.js:20-24`, 30 min TTL, 5 min sweep).
- Limit: server restart drops every `task_id` (`src/tasks.js:18`), so a client polling an in-flight build after a restart gets `Task not found`; running tasks are never swept, so hung tasks (see above) accumulate until restart.
- Scaling path: persist task records to disk under `<project>/.pio/` and sweep `running` tasks whose PID is gone.

**Serial log directory grows without bound:**
- Files: `src/tools/monitor.js:64-80` creates `<project>/.logs/` per project; `src/tools/monitor.js:175` appends a new timestamped file per start with no retention.
- Limit: one file per monitor start, written at device baud rate; a 115200-baud device produces ~11 KB/s (~40 MB/hour). `.gitignore:3` hides them, but nothing prunes `.logs/`.
- Scaling path: prune `.logs/` to the newest N files on start.

## Dependencies at Risk

**`@modelcontextprotocol/sdk` `^1.12.1`:**
- Risk: the code reaches past the public API in several places — `server.server?.setNotificationHandler?.` (`src/server.js:118-125`), `server.server?.sendLoggingMessage?.` (`src/tools/build.js:173`), `server.sendLoggingMessage?` (`src/tools/test.js:249`), and manual `req.rawHeaders.push('mcp-session-id', ...)` (`src/server.js:150-153`) because of an SDK/hono header quirk.
- Impact: a minor SDK release that changes `McpServer.server` or the transport header handling breaks notifications and HTTP sessions silently (all guarded with `?.`).
- Migration plan: pin an exact minor version and add one integration test that asserts `logging` notifications arrive.

**Undeclared `pio` CLI dependency:**
- Risk: nothing in `package.json` (`dependencies`, `engines`) or the install docs declares PlatformIO; the binary is looked up on `PATH` at runtime (`src/utils.js:23`).
- Impact: every tool fails on a clean machine; build, upload, check, test, and discover normalise the failure to `PIO_COMMAND_NOT_FOUND` (`src/tools/build.js:218`, `src/tools/upload.js:183`, `src/tools/check.js:158`, `src/tools/test.js:288`, `src/tools/discover.js:333`), but `pio_clean` does not (`src/tools/clean.js:51-66`) and returns a raw `exec` failure instead.
- Migration plan: document `pip install platformio` in `README.md` install section and normalise `ENOENT` to `PIO_COMMAND_NOT_FOUND` in `src/utils.js`.

## Missing Critical Features

**No cancellation tool:**
- Problem: `TaskManager.cancelTask` (`src/tasks.js:143`) is unreachable through MCP; only `pio_task_status` (`src/tasks.js:190`) and `pio_task_list` (`src/tasks.js:217`) are registered, and `.agents/skills/pio-mcp-manager/SKILL.md` documents no cancel tool.
- Blocks: stopping a stuck upload or a mis-targeted build without killing the whole server process.

**No timeout on build, upload, clean, or check:**
- Problem: only `pio_run_tests` accepts `timeout_seconds` (`src/tools/test.js:154,196`); `runPioCommand` passes a timeout only when supplied (`src/utils.js:34-35`) and the build/upload/clean/check calls never supply one.
- Blocks: recovering from a hung `pio upload` (waiting for a board that is not in bootloader mode) — the synchronous MCP call blocks for as long as the board is silent.

**No distribution `prepare` script:**
- Problem: `package.json:8` points `bin.pioneer` at `./dist/server.js`, `dist/` is gitignored, and there is no `prepare`/`prepublishOnly` script in `package.json:9-14`.
- Blocks: `npm install -g .` (the flow in `README.md:92-104`) installs a bin that does not exist until `npm run build` is run by hand.

## Test Coverage Gaps

**Zero automated tests:**
- What's not tested: everything. `package.json:11` runs jest with `--experimental-vm-modules`, but `test/` contains only `test/uat-sesaiotnode.mjs`, which matches neither jest's default `testMatch` pattern nor its default `js,jsx,ts,tsx` extensions, and there is no `jest.config.*` or `jest` key in `package.json`.
- Files: `package.json`, `test/uat-sesaiotnode.mjs`
- Risk: `npm test` exits "No tests found"; the parsers, ini resolution, and task state machine in `src/parsers.js`, `src/metadata.js`, `src/workspace.js`, `src/tasks.js` have no regression net.
- Priority: High

**The only end-to-end test is machine-specific:**
- What's not tested: portability of any tool.
- Files: `test/uat-sesaiotnode.mjs:4,16` hardcodes `ROOT = '/home/zandev32/Documents/klaklik/SesaIoTNode'` and `ENV = 'KitchenGuard-V1'`; the script lives outside `src` and is invoked by hand.
- Risk: cannot run in CI or on a contributor machine; it silently exercises nothing when the path is absent.
- Priority: High

**No CI pipeline:**
- What's not tested: build (`build.mjs`), lint, tests on push.
- Files: no `.github/` directory exists; `build.mjs:10-22` is only ever run locally.
- Risk: the esbuild bundle (`build.mjs:10-22`) is only ever produced locally, `dist/` is gitignored, and nothing imports `dist/server.js` in a test — a bundle regression is first seen by a user running `npx pioneer`.
- Priority: Medium

---

*Concerns audit: 2026-11-09*
