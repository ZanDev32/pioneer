---
phase: 03-distribution-testing
plan: 04
subsystem: testing
tags: [vitest, mcp-tool-handlers, mock-seam, coverage-thresholds, child-process]

requires:
  - phase: 03-distribution-testing
    provides: "03-02 v1 registerTool server API and 03-03 unit layer + Vitest project split"
provides:
  - "One executor path: build/upload/test async branches call runPioCommand from src/utils.js"
  - "PLATFORM_UNSUPPORTED (-32010) and the win32 pio_serial_start guard (D-22)"
  - "8 integration files driving all 12 tool handlers through one mock boundary"
  - "Locked coverage thresholds 80 statements / 70 branches / 80 functions / 80 lines, parsers.js 85% lines"
affects: [03-06, 03-07, verify-work]

actuals:
  tokens: 18600
  tasks: 3
  commits: 3
  plan_head_before: 9613109
  plan_head_after: 8551568

tech-stack:
  added: []
  patterns:
    - "Single mock boundary: vi.mock('../../src/utils.js') with importOriginal keeps helpers real"
    - "Stub MCP server map (registerTool → Map) to invoke v4 handlers directly"
    - "child_process mocked wholesale for the serial monitor; fake ChildProcess via EventEmitter + PassThrough"

key-files:
  created:
    - test/unit/monitor-guard.test.js
    - test/integration/build.test.js
    - test/integration/upload.test.js
    - test/integration/clean.test.js
    - test/integration/discover.test.js
    - test/integration/monitor.test.js
    - test/integration/check.test.js
    - test/integration/test.test.js
    - test/integration/tasks.test.js
  modified:
    - src/tools/build.js
    - src/tools/upload.js
    - src/tools/test.js
    - src/tools/monitor.js
    - src/errors.js
    - vitest.config.js
    - test/unit/errors.test.js

key-decisions:
  - "Async branches keep the task-manager contract: a rejected execution normalizes into { exitCode, result } instead of throwing."
  - "Sync pio_build non-zero exit now raises BUILD_FAILED (plan behavior bullet) with diagnostics preserved in error.data."
  - "Monitor maps a busy-port stty failure to PORT_BUSY; there was no code path producing that code before."
  - "Coverage gaps filled with assertions, never by lowering a threshold or excluding a module."

patterns-established:
  - "Handler tests: parse params through the registered zod schema so defaults are asserted, then call the captured handler."
  - "Temp-dir project fixtures (mkdtempSync + platformio.ini) instead of touching repo state."

requirements-completed: [TS-2, TS-3, FR-1, FR-2, FR-3, FR-4, NFR-2, NFR-3]

coverage:
  - id: D1
    description: "Async build/upload/test branches route through the shared executor; win32 serial monitor returns a named platform error"
    requirement: NFR-2
    verification:
      - kind: unit
        ref: "test/unit/monitor-guard.test.js"
  - id: D2
    description: "All 12 tool handlers asserted end to end without a real CLI, serial port, network, or child process"
    requirement: TS-2
    verification:
      - kind: integration
        ref: "test/integration/*.test.js"
  - id: D3
    description: "Coverage floors enforced in vitest.config.js"
    requirement: NFR-3
    verification:
      - kind: command
        ref: "npm run test:coverage"
---

# Phase 3 Plan 4: Executor Seam, Serial Guard, and Handler Integration Layer Summary

One shared `runPioCommand` seam for every handler branch, a POSIX-only guard on the serial monitor, and 8 integration files covering all 12 tools with locked coverage floors.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Route async branches through the executor; guard the POSIX-only monitor | `5f423c2` | src/tools/{build,upload,test,monitor}.js, src/errors.js, test/unit/monitor-guard.test.js |
| 2 | Integration tests for build, upload, clean, discover | `b12e5e1` | test/integration/{build,upload,clean,discover}.test.js |
| 3 | Integration tests for monitor, check, test, tasks; enable coverage floors | `8551568` | test/integration/{monitor,check,test,tasks}.test.js, vitest.config.js, src/tools/monitor.js |

## Acceptance Evidence

### 1. Install + build

```
$ npm ci
added 231 packages in 968ms

$ npm run build
Built dist/server.js successfully
```

### 2. `npm test` — full Vitest summary (baseline 7 files / 70 tests; now 16 / 142)

```
$ npm test
 RUN  v5.1.0 /home/zandev32/.omp/wt/t3e3aedf09/m

 Test Files  16 passed (16)
      Tests  142 passed (142)
   Start at  14:25:01
   Duration  564ms (tests 65%, import 23%, transform 7%, worker 5%)
```

### 3. Honest seam — mock call-count assertions and the red/green pair

Assertions inside the async-path tests (`test/integration/build.test.js`):

```js
const result = await tool.handler({ environment: 'esp32dev', async: true });
const body = parseBody(result);
expect(body.status).toBe('running');
expect(runPioCommand).toHaveBeenCalledWith(['run', '-e', 'esp32dev'], { projectDir });
```

plus the upload/test equivalents:

```js
expect(runPioCommand).toHaveBeenCalledWith(
  ['run', '-t', 'upload', '-e', 'esp32dev', '-p', '/dev/ttyUSB0'], { projectDir });
expect(runPioCommand).toHaveBeenCalledWith(
  ['test', '-e', 'esp32dev', `--json-output-path=${jsonResultsPath()}`],
  { projectDir, timeout: 60 * 1000 });
```

RED — deliberate `params.async` bypass (async branch no longer calls the shared executor):

```
$ npx vitest run --project integration test/integration/build.test.js -t "async path"
     × routes the background build through the same executor and completes the task
     × records a rejected background build as a failed task instead of throwing
 FAIL  ... > routes the background build through the same executor and completes the task
 AssertionError: expected "vi.fn()" to be called with arguments: [ [ 'run', '-e', 'esp32dev' ], …(1) ]
 FAIL  ... > records a rejected background build as a failed task instead of throwing
 AssertionError: expected 'completed' to be 'failed' // Object.is equality
      Tests  2 failed | 14 skipped (16)
```

GREEN — bypass reverted:

```
$ npx vitest run --project integration test/integration/build.test.js -t "async path"
      Tests  2 passed | 14 skipped (16)
```

`grep` proof the three files no longer import the child-process module:

```
$ grep -rn 'execFile' src/tools/build.js src/tools/upload.js src/tools/test.js | wc -l
0
```

### 4. Coverage thresholds

```
$ npm run test:coverage
 % Coverage report from v8
---------------|---------|----------|---------|---------|-----------------------
All files      |   89.27 |     77.3 |   94.73 |   91.11 |
 src           |   97.01 |    89.77 |     100 |   98.55 |
 src/tools     |   85.77 |    72.97 |   91.17 |    87.7 |
  parsers.js   |     100 |     93.1 |     100 |     100 |
=============================== Coverage summary ===============================
Statements   : 89.27% ( 866/970 )
Branches     : 77.3% ( 528/683 )
Functions    : 94.73% ( 108/114 )
Lines        : 91.11% ( 800/878 )
================================================================================
coverage exit=0
```

Thresholds in `vitest.config.js`: `{ statements: 80, branches: 70, functions: 80, lines: 80, 'src/parsers.js': { lines: 85 } }`, `reportsDirectory: 'coverage'`, reporters `text` + `lcov`. No `ERROR: Coverage for` line is emitted.

### 5. No real CLI / serial device in the integration lane

```
$ grep -rn 'pio ' test/integration/
test/integration/build.test.js:183:      message: 'spawn pio ENOENT',
test/integration/check.test.js:150:  it('keeps parsing defects when pio exits non-zero (defects are not failures)', async () => {
test/integration/check.test.js:199:      message: 'spawn pio ENOENT',
test/integration/clean.test.js:86:    // Simulate the CLI's work — the test deletes what pio would delete.
test/integration/discover.test.js:131:      message: 'spawn pio ENOENT',
test/integration/test.test.js:176:      message: 'spawn pio ENOENT',
test/integration/upload.test.js:154:      message: 'spawn pio ENOENT',
```

Every hit is a fixture string or a test title — no invocation. `test/integration/monitor.test.js` mocks `child_process` wholesale (`spawn` + `execFile`), so neither `stty`, `cat`, nor a serial device is ever opened.

### 6. Full suite twice

```
run1 exit=0   Test Files  16 passed (16)   Tests  142 passed (142)
run2 exit=0   Test Files  16 passed (16)   Tests  142 passed (142)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Pinned taxonomy test updated**
- **Found during:** Task 1
- **Issue:** `test/unit/errors.test.js` deep-equals `ERROR_CODES`; adding `PLATFORM_UNSUPPORTED` failed it. The plan's file list omitted this file.
- **Fix:** added `PLATFORM_UNSUPPORTED: -32010` to the pinned object.
- **Commit:** `5f423c2`

**2. [Rule 1 - Bug] `pio_build` non-zero exit now raises BUILD_FAILED**
- **Found during:** Task 2 (plan's build behavior bullet)
- **Issue:** a rejected executor only flipped `success: false`, so FR-4's BUILD_FAILED code was never emitted. `success` also ignored a non-zero exit when no diagnostics parsed.
- **Fix:** throw `PioMcpError(BUILD_FAILED, …)` with `{ exit_code, diagnostics, summary, metadata }` in `data`.
- **Commit:** `5f423c2`

**3. [Rule 1 - Bug] Serial monitor log stream leaked on failure paths**
- **Found during:** Task 3 (monitor tests surfaced uncaught `ENOENT` writes)
- **Issue:** `NO_DEVICE` and rethrown `PioMcpError` paths exited the handler without `logStream.end()`.
- **Fix:** close the stream before the PioMcpError rethrow.
- **Commit:** `8551568`

**4. [Rule 2 - Missing critical functionality] Busy serial port now maps to PORT_BUSY**
- **Found during:** Task 3
- **Issue:** the plan's monitor behavior names a `PORT_BUSY` path, but no code produced that code.
- **Fix:** an `stty` failure whose message matches `/busy/i` becomes `PioMcpError(PORT_BUSY, …)`.
- **Commit:** `8551568`

**5. Coverage top-up inside the allowed files**
- Workspace resolution (roots/fallback/cache) is exercised through handler contexts in `build.test.js`; extra `platformio.ini` shapes (`extra_configs` glob + direct path, `[env]` defaults, malformed lines, unparseable device JSON, logical filter) in `discover.test.js`; monitor edge paths and `summarizeTestResults` variants in their files — per the plan's "add assertions rather than lower a number".

## Deferred Issues

- `src/tools/discover.js` still carries a dead `parsePlatformioIni()` helper (superseded by `parsePlatformioIniRaw`). Out of this plan's write set; remove in a cleanup pass — it costs ~3 points of statement coverage.

## Known Stubs

None.

## Self-Check: PASSED

- `test/unit/monitor-guard.test.js`, 8 integration files, `vitest.config.js` exist.
- Commits `5f423c2`, `b12e5e1`, `8551568` are ancestors of HEAD.
- `npm run build`, `npm test` (twice), and `npm run test:coverage` all exit 0.
