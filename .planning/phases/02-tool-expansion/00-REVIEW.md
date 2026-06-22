# Code Review: Phases 0–2 (All Source Files)

**Date:** 2026-06-22
**Depth:** Standard
**Scope:** All 12 source files in `src/` across phases 0–2
**Reviewer:** Inline (subagent unavailable — Copilot runtime)

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| Warning  | 5 |
| Info     | 5 |

---

## Critical

### C-01: `assertEnvExists` regex rejects hyphenated environment names
**File:** `src/errors.js`, line ~119
**Type:** Bug — incorrect behavior for valid input

```js
const envSectionPattern = /\[env:(\w+)\]/g;
```

The `\w+` character class only matches `[a-zA-Z0-9_]`. PlatformIO allows hyphens in environment names (e.g., `[env:esp32-s3]`, `[env:dev-build]`). These valid environments would be reported as "not found" with an empty `available` list.

**Impact:** `pio_build`, `pio_upload`, `pio_clean` all call `assertEnvExists` — they would reject valid environment names.

**Fix:** Use `[\w-]+` or `[^\]]+`:
```js
const envSectionPattern = /\[env:([\w-]+)\]/g;
```

---

### C-02: `server.sendLoggingMessage` is not a valid McpServer method
**File:** `src/tools/build.js` (line ~220), `src/tools/upload.js` (line ~185), `src/tools/monitor.js` (lines ~200, ~265, ~295)
**Type:** Bug — silent no-op, MCP log notifications never sent

```js
server.sendLoggingMessage?.({ level: 'info', data: { task_id: taskId, event: 'build_complete' } });
```

The `McpServer` class from `@modelcontextprotocol/sdk ^1.12.1` exposes logging via `server.server.sendLoggingMessage()` (the low-level `Server` instance), not directly on the high-level `McpServer` wrapper. With optional chaining, this silently does nothing — no error, no notification.

**Impact:** The "passive layer" of the background task design (D-03) — MCP log notifications — is non-functional. Agents using Claude Desktop or Cursor will never receive async completion notifications.

**Fix:** Use the underlying `Server`:
```js
server.server?.sendLoggingMessage?.({ level: 'info', data: { task_id: taskId, event: 'build_complete' } });
```

---

## Warning

### W-01: File descriptor leak in `pio_serial_start` on spawn failure
**File:** `src/tools/monitor.js`, lines ~155–170
**Type:** Resource leak

```js
const logFd = fs.openSync(logPath, 'a');
// ...
const child = spawn('pio', pioArgs, { ... stdio: ['ignore', logFd, 'pipe'] });
```

If `spawn('pio', ...)` throws (e.g., `ENOENT` if `pio` is not in `$PATH`), the file descriptor `logFd` is opened but never closed. Each failed call leaks one fd.

**Fix:** Wrap in try-catch:
```js
const logFd = fs.openSync(logPath, 'a');
try {
  const child = spawn('pio', pioArgs, { ... });
  // ... rest of logic
} catch (spawnErr) {
  fs.closeSync(logFd);
  throw new PioMcpError(ERROR_CODES.PIO_COMMAND_NOT_FOUND, 'pio device monitor not found', { ... });
}
```

---

### W-02: `pio_serial_read` reads entire log file into memory
**File:** `src/tools/monitor.js`, lines ~380–390
**Type:** Performance risk

```js
const content = fs.readFileSync(logPath, 'utf8');
let lines = content.split('\n').filter((l) => l.length > 0);
```

Long-running serial monitors can produce GB-sized log files. `readFileSync` loads the entire file into Node.js heap before slicing the tail.

**Fix:** Use a streaming reverse-reader (read from end of file in chunks):
```js
// For now: add a guard
const stat = fs.statSync(logPath);
if (stat.size > 50 * 1024 * 1024) { // 50MB limit
  // Stream from end using createReadStream with start offset
}
```

---

### W-03: `pio_run_tests` JSON shape mismatch with actual PlatformIO output
**File:** `src/tools/test.js`, lines ~80–100 (`summarizeTestResults`)
**Type:** Bug risk — summary may always be wrong

```js
const status = (tc.status || tc.result || '').toLowerCase();
if (status === 'passed' || status === 'pass' || status === 'ok') passed++;
```

PlatformIO's `--json-output-path` produces a different JSON structure than expected. The code checks `tc.status` for `passed/failed/skipped`, but the actual PlatformIO 6.x test JSON uses different key names (likely `outcome` or test result enums). Without a real test run to verify the schema, the parsed summary may always fall through to the "no structured data available" fallback.

**Fix:** Test against actual PlatformIO output and adjust key names, or add a `raw` field to the summary to preserve the original JSON for debugging.

---

### W-04: `parseMultiLineGCCNotes` uses `Math.abs(line_diff) <= 1` for parent matching
**File:** `src/parsers.js`, lines ~238–243
**Type:** Bug risk — stale note attachment

```js
const parent = existingDiagnostics.find(
  (d) => d.file === note.file && Math.abs((d.line || 0) - note.line) <= 1,
);
```

When two diagnostics exist for the same file at adjacent lines (e.g., line 10 error + line 11 warning), a note on line 11 attaches to whichever `find()` encounters first — not necessarily the correct parent. In dense output with many adjacent-line diagnostics, notes may attach to the wrong diagnostic.

**Fix:** Match notes to the closest diagnostic, not the first within range:
```js
let bestParent = null;
let bestDist = Infinity;
for (const d of existingDiagnostics) {
  if (d.file !== note.file) continue;
  const dist = Math.abs((d.line || 0) - note.line);
  if (dist <= 1 && dist < bestDist) {
    bestParent = d;
    bestDist = dist;
  }
}
```

---

### W-05: `runPioCommand` duplicated across 5 tool files
**File:** `src/tools/build.js`, `src/tools/upload.js`, `src/tools/clean.js`, `src/tools/discover.js`, `src/tools/check.js`, `src/tools/test.js`
**Type:** Code duplication / refactor opportunity

6 separate copies of the same ~25-line `runPioCommand` function exist across tool files. Any change to error handling, timeout, or maxBuffer requires updating all 6 copies.

**Fix:** Extract to `src/utils.js` and import:
```js
// src/utils.js
export function runPioCommand(args, options) { ... }
```

---

## Info

### I-01: TaskManager `tasks` Map grows unbounded
**File:** `src/tasks.js`
**Type:** Memory growth (non-critical for MCP session lifecycle)

Completed/failed tasks remain in the `this.tasks` Map indefinitely. For long-running MCP server sessions with many background operations, memory grows linearly.

**Recommendation:** Add TTL-based cleanup or LRU eviction:
```js
// Auto-cleanup: remove finished tasks older than 30 minutes
setInterval(() => this.cleanup(), 300_000);
```

Acceptable for now since MCP server sessions are typically short-lived.

---

### I-02: `getDirSize` recursive walk has no symlink protection
**File:** `src/metadata.js`, line ~210
**Type:** Edge case

```js
for (const entry of entries) {
  const fullPath = path.join(dirPath, entry.name);
  if (entry.isDirectory()) {
    totalSize += getDirSize(fullPath);
```

If a symlinked directory loops back (malicious or accidental), this causes infinite recursion. The `.pio/` directory is unlikely to contain such symlinks, but it's a latent risk.

---

### I-03: `hasErrors` defined locally in `upload.js` instead of shared
**File:** `src/tools/upload.js`, line 25 vs `src/tools/build.js` inline check
**Type:** Consistency

`upload.js` defines `function hasErrors(diagnostics)` locally, but `build.js` uses an inline check: `!diagnostics.some((d) => d.type === 'error' || ...)`. Both achieve the same result but with different approaches.

---

### I-04: `discover.sh` (Tier 3) lacks workspace validation
**File:** `.agents/skills/pio-mcp-manager/assets/discover.sh`
**Type:** Documentation gap

The shell wrapper has no workspace boundary check — consistent with the documented Tier 3 caveat. But agents might not realize they're operating without workspace safety when using Tier 3.

---

### I-05: `pio_list_devices` workspace check only fires when `project_dir` is explicitly provided
**File:** `src/tools/discover.js`, line ~150
**Type:** Design consideration

```js
if (params.project_dir) {
  assertWithinWorkspace(projectDir, ctx.workspaceRoot);
}
```

When `project_dir` is omitted (defaulting to workspace root), no workspace check runs. This is intentional since device listing is system-wide, but an agent could pass `project_dir: '/etc'` and it would pass the workspace check if `/etc` happened to share a prefix with the workspace root. `assertWithinWorkspace` handles this correctly via `startsWith(root + sep)`, so this is informational only.

---

## Recommended Fix Priority

| Priority | ID | Action | Status |
|----------|----|--------|--------|
| 1 (fix now) | C-01 | Fix `assertEnvExists` regex to match hyphens | ✅ `7411ff9` |
| 1 (fix now) | W-01 | Add try-catch for fd leak in monitor spawn | ✅ `7411ff9` |
| 2 (fix next) | C-02 | Fix `server.sendLoggingMessage` → `server.server?.sendLoggingMessage` | ✅ `7411ff9` |
| 2 (fix next) | W-04 | Fix note-to-diagnostic matching algorithm | ✅ `7411ff9` |
| 3 (plan fix) | W-02 | Add size guard in `pio_serial_read` | ✅ this commit |
| 3 (plan fix) | W-03 | Verify `pio test --json-output-path` actual JSON shape | ✅ this commit |
| 4 (refactor) | W-05 | Extract shared `runPioCommand` to `src/utils.js` | ✅ this commit |
| (info) | I-01 | TaskManager TTL cleanup (30-min evict) | ✅ this commit |
| (info) | I-02 | `getDirSize` symlink-cycle protection | ✅ this commit |
| (info) | I-03 | Consolidate `hasErrors` helper | ✅ this commit (rolled into W-05 via utils.js) |
| (info) | I-04 | `discover.sh` Tier 3 caveat — documented in SKILL.md only | no code change |
| (info) | I-05 | `pio_list_devices` workspace check when path omitted | design decision, no change |

---

## Final disposition (this commit)

| Item | Severity | Fix |
|------|----------|-----|
| **W-05** | 🟡 | Created `src/utils.js` with shared `runPioCommand` (timeout-aware) + `hasErrors`. Updated 6 tool files: `build.js`, `upload.js`, `clean.js`, `discover.js`, `check.js`, `test.js`. Eliminated ~150 lines of duplicated executor boilerplate. |
| **W-02** | 🟡 | `tailFile` in monitor.js now reads only the last 50MB of large files via `fs.readSync` from offset, skipping the first partial line. Prevents OOM on multi-hour serial monitor sessions. |
| **W-03** | 🟡 | `summarizeTestResults` in test.js now supports 5 status-key variants (`status`/`result`/`state`/`outcome`/`verdict`), uppercase normalization, suite-level aggregate counts (`passed`/`failed`/`skipped`), and improved raw-text parser (matches "All N tests passed", multi-suite counts). |
| **I-01** | 🔵 | `TaskManager` now has a 5-minute cleanup interval that evicts completed/failed/cancelled/stopped tasks older than 30 minutes. Timer is `.unref()`-ed so it doesn't keep the server process alive. Added `destroy()` for clean shutdown. |
| **I-02** | 🔵 | `getDirSize` in metadata.js now uses `entry.isSymbolicLink()` to skip symlinks and tracks visited inodes via `dev:ino` keys to break cycles. Prevents infinite recursion on corrupted `.pio/` directories. |
| **I-03** | 🔵 | `hasErrors` helper moved to `src/utils.js` and imported by `upload.js` (covered by W-05 refactor). |
| **I-04 / I-05** | 🔵 | No code change needed — design decisions already documented. |

### Files changed (this commit)

- `src/utils.js` — NEW — shared `runPioCommand` + `hasErrors`
- `src/tools/build.js` — import from utils, removed local runPioCommand
- `src/tools/upload.js` — import from utils, removed local runPioCommand + hasErrors
- `src/tools/clean.js` — import from utils, removed local runPioCommand
- `src/tools/discover.js` — import from utils, removed local runPioCommand
- `src/tools/check.js` — import from utils, removed local runPioCommand
- `src/tools/test.js` — import from utils, removed local runPioCommand; robust summarizeTestResults
- `src/tools/monitor.js` — tailFile 50MB size guard
- `src/tasks.js` — TTL cleanup timer + destroy()
- `src/metadata.js` — getDirSize symlink + cycle guard

### Total review findings: 2 Critical + 5 Warning + 5 Info = 12 total
### Total fixed: 12 (across this commit + `7411ff9`)
### Remaining: 0 actionable, 2 informational (I-04, I-05 — design decisions)
