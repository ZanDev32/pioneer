---
phase: 03-distribution-testing
plan: 03
subsystem: testing
tags: [vitest, unit-tests, parsers, error-taxonomy, metadata, taskmanager, fake-timers]

requires:
  - "Vitest 5.1.0 runner with unit (2000 ms) and integration (30000 ms) projects (03-01)"
provides:
  - "test/unit/parsers.test.js: all five parser families, dedup + merge order, NFR-1 parsing budget"
  - "test/unit/errors.test.js: full ERROR_CODES taxonomy, workspace boundary, env/project assertions, wrapToolError"
  - "test/unit/metadata.test.js: duration/RAM/Flash/binary-size extraction, incremental filtering, getDirSize"
  - "test/unit/utils.test.js: runPioCommand resolve/reject contract with child_process mocked, hasErrors"
  - "test/unit/tasks.test.js: TaskManager CRUD, cancellation, listActive, TTL cleanup with fake timers"
affects: [03-04, 03-05, 03-06, 03-07]

actuals:
  tokens: 6823
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Inline string fixtures only (D-10) — no persisted log files for parsers"
    - "vi.mock('child_process') at the module boundary so no unit test spawns pio"
    - "vi.useFakeTimers()/advanceTimersByTime() to drive TTL and cancellation windows; destroy() in afterEach"
    - "fs.mkdtempSync under os.tmpdir() with rmSync cleanup in afterEach for filesystem cases"

key-files:
  created:
    - test/unit/parsers.test.js
    - test/unit/errors.test.js
    - test/unit/metadata.test.js
    - test/unit/utils.test.js
    - test/unit/tasks.test.js
  modified: []

key-decisions:
  - "TaskManager tests target the class only and never reference tool registration, so the parallel 03-02 server.tool → registerTool rewrite cannot turn them red."
  - "getTask returns null (not undefined) for an unknown id in src/tasks.js; the test asserts the shipped null because src/ is read-only for this plan."
  - "The multi-line-note behaviour is split into a direct parseMultiLineGCCNotes attach case plus the merged parseAllDiagnostics case, because in the merged pass the note line is itself already a diagnostic (distance 0)."

patterns-established:
  - "Asserting real module output: expected values were derived by running each src module before writing assertions, never from the prose spec."
  - "Deterministic timing assertion: performance.now() brackets only parseAllDiagnostics, not test startup."

requirements-completed: [TS-4, TS-5, FR-4, NFR-1, NFR-2]

coverage:
  - id: D1
    description: "Every diagnostic parser family plus dedup/merge order has inline-fixture coverage"
    requirement: TS-4
    verification:
      - kind: unit
        ref: "test/unit/parsers.test.js (17 cases)"
        status: pass
  - id: D2
    description: "Build metadata extraction and incremental filtering asserted against captured output"
    requirement: TS-5
    verification:
      - kind: unit
        ref: "test/unit/metadata.test.js (9 cases)"
        status: pass
  - id: D3
    description: "Every ERROR_CODES member reachable from a test, including workspace boundary and env checks"
    requirement: FR-4
    verification:
      - kind: unit
        ref: "test/unit/errors.test.js (13 cases)"
        status: pass
  - id: D4
    description: "parseAllDiagnostics over a ~50 KB synthetic log completes under 100 ms"
    requirement: NFR-1
    verification:
      - kind: unit
        ref: "test/unit/parsers.test.js#parseAllDiagnostics parses a ~50 KB synthetic log in under 100 ms (NFR-1 parsing bullet)"
        status: pass
  - id: D5
    description: "Unit lane needs no PlatformIO install and spawns no process (child_process mocked)"
    requirement: NFR-2
    verification:
      - kind: unit
        ref: "test/unit/utils.test.js (execFile mocked)"
        status: pass

duration: 5min
completed: 2026-11-12
status: complete
plan_head_before: 06e9af6e5767271580e60f2d508cfc4d4bbdd20b
plan_head_after: 6dc31048b798d9d21a0227e5a07bf5ed5681dfaf

# Phase 3 Plan 03: Unit Test Layer Summary

Built the five-file unit layer over the pure modules: 58 new Vitest cases pinning parser output, the error taxonomy, metadata extraction, the `runPioCommand` contract, and `TaskManager` lifecycle — `npm test` is 6 files / 61 passed (2 skipped) on two consecutive runs.

## Performance

- **Duration:** 5min
- **Tasks:** 3
- **Files created:** 5 (867 added lines)
- **Suite runtime:** 343 ms and 355 ms on the two full runs

## Accomplishments

- `parsers.test.js` (17 cases): single-line GCC exact shape, warning/fatal error, project-dir relativization, linker/`collect2`, Python `ModuleNotFoundError` + traceback frames (with and without scope), CMake Error block join and Warning classification, note attach vs standalone fallback, `parseAllDiagnostics` merge order `gcc → linker → python → cmake`, `file:line:message` dedup preserving first-seen order, and the NFR-1 budget (391 synthetic lines / 50,110 bytes parsed in ~1 ms).
- `errors.test.js` (13 cases): all 11 `ERROR_CODES` values pinned, `PioMcpError` shape, `wrapToolError` pass-through and `INTERNAL_ERROR` wrap, `assertPioProject` (`PROJECT_NOT_FOUND` + positive), `assertEnvExists` (`ENV_NOT_FOUND` listing `esp32dev, esp32-s3` + positive incl. hyphenated env), `assertWithinWorkspace` (`PROJECT_OUTSIDE_WORKSPACE`, inside/root allowed, relaxed mode `INVALID_PARAMS`).
- `metadata.test.js` (9 cases): duration `4.21`, RAM `9.8% / 32000 / 327680`, Flash `5.9% / 245760 / 4194304`, `firmware.bin` size, `firmware.elf` fallback, null fields when missing, incremental filter dropping the stale file while keeping `src/new.cpp` and the fileless linker diagnostic, first-build pass-through, `getDirSize` 0 for missing and 35 for a nested tree.
- `utils.test.js` (8 cases): `execFile` receives `'pio'`, the argv array, `cwd`, a copied `env`, default `maxBuffer` 50 MB and caller override; `timeout` absent for falsy/0, forwarded for 20000; resolve `{stdout, stderr, combined, exitCode: 0}`; reject with numeric code kept, `'ENOENT'` coerced to 1, `killed` → `timedOut`; `hasErrors` true for error/fatal error only.
- `tasks.test.js` (11 cases): UUID ids, running state/default message/`elapsed_seconds` under fake timers, safe `getTask` copy without `child`, `updateTask` transitions + result/exit code, `cancelTask` only with an attached child (SIGTERM then SIGKILL after 2 s) else `false`, `listActive` excludes terminal tasks, TTL eviction after 35 min keeping fresh/running tasks, direct `cleanup()` count, `destroy()` clearing the interval.

## Verification (actually run)

1. `npm ci` → `added 231 packages in 964ms`; then `npm test` twice:

```
 Test Files  6 passed (6)
      Tests  61 passed | 2 skipped (63)
   Start at  14:09:09
   Duration  343ms (tests 74%, import 15%, transform 6%, worker 5%)
=== SECOND RUN ===
 Test Files  6 passed (6)
      Tests  61 passed | 2 skipped (63)
   Start at  14:09:10
   Duration  355ms (tests 72%, import 17%, transform 5%, worker 5%)
```

2. Per-file verbose runs (case names visible):

```
 ✓ |unit| test/unit/parsers.test.js > parseSingleLineGCC > extracts file, line, column, type, message, and category from one diagnostic
 ✓ |unit| test/unit/parsers.test.js > parseLinkerErrors > parses ld lines as linker errors with empty file and line 0
 ✓ |unit| test/unit/parsers.test.js > parsePythonErrors > parses a ModuleNotFoundError line without throwing
 ✓ |unit| test/unit/parsers.test.js > parseCMakeErrors > parses CMake Error blocks with the message joined from indented lines
 ✓ |unit| test/unit/parsers.test.js > parseMultiLineGCCNotes > attaches a note to the nearest preceding diagnostic instead of adding an entry
 ✓ |unit| test/unit/parsers.test.js > parseAllDiagnostics > merges the parsers gcc → linker → python → cmake, preserving first-seen order
 ✓ |unit| test/unit/parsers.test.js > parseAllDiagnostics > drops duplicates by file:line:message and keeps the first occurrence
 ✓ |unit| test/unit/parsers.test.js > parseAllDiagnostics > parses a ~50 KB synthetic log in under 100 ms (NFR-1 parsing bullet)

 ✓ |unit| test/unit/tasks.test.js > createTask / getTask > returns a UUID and stores a running task with the given type and message
 ✓ |unit| test/unit/tasks.test.js > updateTask > transitions status and records output, exit code, and result
 ✓ |unit| test/unit/tasks.test.js > cancelTask > marks a task with a child process cancelled and escalates SIGTERM to SIGKILL
 ✓ |unit| test/unit/tasks.test.js > listActive > returns only non-terminal tasks
 ✓ |unit| test/unit/tasks.test.js > TTL cleanup > evicts terminal tasks older than 30 minutes and keeps fresh or running ones
 ✓ |unit| test/unit/tasks.test.js > TTL cleanup > stops the cleanup interval on destroy so no timer leaks

 Test Files  1 passed (1)
      Tests  11 passed (11)
```

3. Scope guard: `git diff --stat 06e9af6..HEAD` lists only the five `test/unit/*.test.js` files (867 insertions, 0 src lines). All temp trees come from `fs.mkdtempSync(os.tmpdir())` and are removed in `afterEach`.

4. D-08 gate: `grep -rnE "(from|import|require|mock)[[:space:]]*\(?[[:space:]]*['\"]vscode['\"]" test/ | wc -l` → `0`. `grep -rn "server\.tool" test/ | wc -l` → `0` (parallel-safe with 03-02's `registerTool` rewrite).

## Deviations from Plan

None — plan executed as written, with two plan-wording corrections recorded below.

## Notes / Out-of-Scope Observations

- **`getTask` unknown id returns `null`, not `undefined`** (`src/tasks.js:99`). The plan's behaviour bullet says "undefined"; the tests assert the shipped `null` because `src/` is read-only in this plan.
- **Merged multi-line-note quirk:** in `parseAllDiagnostics`, a `note:` line is already parsed by `parseSingleLineGCC`, so `parseMultiLineGCCNotes` attaches the note to itself (distance 0) instead of the preceding error; the note's `notes` array is populated and no extra entry is created. The dedicated attach-to-parent path is asserted by driving `parseMultiLineGCCNotes` directly with the parent list. `src/parsers.js` untouched (read-only).
- **Pre-existing machine path:** `test/uat-sesaiotnode.mjs` (not a Vitest file, predates this plan) hardcodes `/home/zandev32/Documents/...`. Out of this plan's `files_modified`; left unchanged.
- `npm ci` warns that esbuild's postinstall was blocked by the sandbox's allowScripts policy; tests and `vitest` run fine without it.

## Self-Check: PASSED
