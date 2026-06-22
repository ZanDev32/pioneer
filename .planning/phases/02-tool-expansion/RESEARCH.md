# Phase 2 Research: Tool Expansion

**Date:** 2026-06-22
**Status:** Complete

## PlatformIO CLI JSON Output Schemas

### `pio device list --json-output`

Lists connected serial devices. JSON schema per device:

```json
[
  {
    "port": "/dev/ttyUSB0",
    "hwid": "USB VID:PID=10C4:EA60 SNR=0001",
    "description": "CP2102 USB to UART Bridge Controller",
    "type": "serial"
  }
]
```

**Flags:** `--serial` (default), `--logical`, `--mdns` — map directly to tool parameters.

**Note:** Command takes 1–2s due to USB enumeration. Acceptable for a discovery tool.

---

### `pio boards --json-output`

⚠️ **Returns ALL preconfigured embedded boards globally** (~1400+ boards across all installed platforms). Not useful as a "my project's boards" tool.

**Better approach for `pio_list_boards`:** Parse `platformio.ini` directly to extract project environments and their board assignments. This returns only boards relevant to the current project:

```js
// Read platformio.ini, extract [env:*] sections
// Return: [{ env: "esp32dev", board: "esp32dev", platform: "espressif32", framework: "arduino" }]
```

No PIO CLI call needed. Use `fs.readFileSync` + regex or INI parser. Avoids the 1400-board global list.

**Recommendation:** Parse platformio.ini natively (no new deps — platformio.ini is simple INI format). Fallback: use `pio project config --json-output` if parsing proves complex.

---

### `pio check --json-output`

Returns an array of per-environment, per-tool results:

```json
[
  {
    "env": "stm32",
    "tool": "cppcheck",
    "duration": 50.67,
    "defects": [
      {
        "severity": "medium",
        "category": "warning",
        "message": "The function 'loop' is never used.",
        "file": "/abs/path/src/main.cpp",
        "line": 76,
        "column": 0,
        "callstack": "[/abs/path/src/main.cpp:76]",
        "id": "unusedFunction",
        "cwe": "561"
      }
    ],
    "succeeded": true,
    "stats": {
      "src": { "medium": 4 }
    }
  }
]
```

**Known issue (PlatformIO #4029):** If a check tool is not installed, `pio check --json-output` writes installation progress text to stderr before JSON to stdout. The resulting stdout may contain mixed output. **Mitigation:** Use `stderr` for progress text; parse only the last JSON array from stdout. Or strip non-`[` characters from the start of stdout.

**Severity values:** `high`, `medium`, `low`
**Tool options:** `cppcheck`, `clangtidy`, `pvs-studio`

---

### `pio test`

⚠️ **No `--json-output` flag.** Uses `--json-output-path=<file>` instead (saves JSON to file, does not print to stdout).

**Approach for `pio_run_tests`:**
1. Run `pio test --json-output-path=<tempfile> -e <env>`
2. Read the generated JSON file
3. Return parsed results
4. Clean up temp file

**JSON shape (from PIO docs):** Contains test suites, each with test cases, durations, pass/fail outcomes.

**Alternative:** Capture stdout/stderr as text and return raw output if JSON file generation fails (graceful degradation).

---

### `pio device monitor` (Serial Monitor)

No JSON output — raw byte stream from serial port. Flags:

| Flag | Description |
|------|-------------|
| `-b, --baud` | Baud rate (default: 9600) |
| `-p, --port` | Serial port |
| `-e, --environment` | PIO environment |
| `--raw` | Do not process/decode incoming data |
| `--echo` | Echo local input |

**Implementation approach:**

```js
const child = spawn('pio', ['device', 'monitor', '-b', '115200', '-p', port], {
  detached: true,
  stdio: ['ignore', fs.openSync(logPath, 'a'), 'pipe'],
  cwd: projectDir,
});
child.unref();
```

Store child PID in the task store (in-memory Map keyed by task/session ID).

---

## Background Task Architecture

### Task Store: In-Memory Map

```
Map<taskId, { status, progress, message, startTime, child?, result? }>
```

**Why not persistent file:** Adds filesystem complexity and race conditions. MCP server lifetime matches usage sessions — if server restarts, in-flight tasks are lost anyway (detached child process continues but task metadata is gone).

**Task lifecycle:**
1. `pio_build` called with `async: true` → spawn `child_process.exec` detached, store in Map, return `taskId` immediately
2. Agent polls `pio_task_status { taskId }` → returns current status
3. On completion: child callback updates Map with result. Log MCP notification to stderr.
4. Agent can inspect result via `pio_task_status` indefinitely (Map persists until server shutdown)

### MCP Log Notifications (Passive Layer)

```js
// After each significant event:
server.log({ level: 'info', data: { taskId, event: 'build_started' } });
server.log({ level: 'info', data: { taskId, event: 'build_complete', exitCode: 0 } });
```

MCP spec: `notifications/message` — any MCP host can display these as notifications without agent intervention.

### `pio_task_status` Tool

```js
// Zod schema
{ task_id: z.string().describe('Task ID returned from async operation') }

// Returns
{
  task_id: 'uuid',
  status: 'running' | 'completed' | 'failed',
  exit_code: null | number,
  message: 'Building esp32dev...',
  start_time: '2026-06-22T10:00:00Z',
  elapsed_seconds: 12,
  result: { ... } | null  // populated when completed
}
```

---

## Serial Monitor Design

### Log File Location

**Recommendation:** `.pio/monitor-<port-slug>.log` inside the project directory.
- Consistent with `.pio/` convention (build artifacts, libdeps, etc.)
- Project-local — agents can access via workspace paths
- Slug the port name: `/dev/ttyUSB0` → `ttyUSB0`, `COM3` → `COM3`

### `pio_serial_read` Implementation

Read last N lines of log file + optional regex filter:

```js
// Read full file, take last `lines` lines
// Filter with searchPattern regex if provided
// Return as MCP text content
```

Avoid shell `tail`/`grep` — pure Node.js `fs.readFileSync` + split + slice. Faster and portable.

### `pio_serial_stop` Safety

- Kill child process by PID (from task store)
- Send SIGTERM, wait 2s, then SIGKILL if still alive
- Return final line count and summary (duration, bytes read)
- Clean up log file (optional — keep for audit)

---

## File Structure Recommendations

```
src/
  tools/
    build.js        ← existing (add async param)
    upload.js       ← existing (add async param)
    clean.js        ← existing
    discover.js     ← NEW: pio_list_devices, pio_list_boards
    monitor.js      ← NEW: pio_serial_start, pio_serial_stop, pio_serial_read
    check.js        ← NEW: pio_check
    test.js         ← NEW: pio_run_tests
  tasks.js          ← NEW: task manager (Map + createTask, getTask, updateTask)
  server.js         ← existing (add registerDiscoverTools, etc.)
```

**Registration functions:**
- `registerDiscoverTools(server, ctx)` — discover.js
- `registerMonitorTools(server, ctx)` — monitor.js
- `registerCheckTools(server, ctx)` — check.js
- `registerTestTools(server, ctx)` — test.js

**Shared utilities:**
- `src/tasks.js`: TaskManager class with Map-backed store. Exposed in `ctx` so build/upload can delegate async operations.

---

## Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `spawn detached` leaks child processes on server crash | Orphaned `pio device monitor` processes holding serial ports | Store PID in log file header; add cleanup script; document in SKILL.md |
| `pio check --json-output` mixed with tool-install progress text | JSON.parse fails | Strip non-`[` prefix from stdout; use try/catch with partial recovery |
| `pio test --json-output-path` requires writable temp location | Permission issues on some systems | Try `.pio/test-results.json` first (project-local), fallback to `os.tmpdir()` |
| In-memory task Map loses state on server restart | Agent polls dead task ID → 404 response | TaskManager returns explicit "task not found" (not crashed); agent can re-submit |
| `pio device monitor` hangs if port becomes busy | `pio_serial_start` appears to succeed but monitor is idle | Add a 2s startup probe — read first bytes or check child still alive |
| `platformio.ini` parsing for `pio_list_boards` is complex | Misses edge cases (extends, global config) | Use simple regex for common cases; document limitations; offer `--raw-ini` fallback |

---

## Edge Cases

1. **Multiple devices connected:** `pio_list_devices` should return all, not just first. Array response always.
2. **Serial port permissions (Linux):** `/dev/ttyUSB0` may require user to be in `dialout` group. `pio_serial_start` should detect permission errors and surface actionable message.
3. **Windows COM ports:** Port names like `COM3` — the log filename slug should handle this safely.
4. **Multiple environments in project:** `pio_list_boards` should return all envs with their boards. Agent can select which to build.
5. **PVS-Studio without license:** `pio check` with `pvs-studio` will fail with license error — parse gracefully, return informative message.
6. **Task cancellation:** Agent may want to cancel a running build. Not in v1 scope (no `pio_task_cancel` tool), but TaskManager should have internal `cancelTask(taskId)` method for future use.

---

*Research complete. Ready for planner.*
