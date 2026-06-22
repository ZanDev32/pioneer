# Phase 2 Plan A: Foundation & Discovery

**Goal:** Build background task infrastructure, then add device discovery, serial monitor, and status polling tools.
**Depends on:** Phase 1 (SKILL.md + shell wrappers)
**Wave:** 1

---

## Task 1: Create TaskManager module

**File:** `src/tasks.js`

Create the core task lifecycle manager — an in-memory `Map<taskId, TaskState>` that underpins all async operations (`pio_task_status` polling + build/upload async wrappers).

```js
export class TaskManager {
  constructor() {
    this.tasks = new Map();
  }

  createTask({ type, args, childProcess }) {
    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type,          // 'build' | 'upload' | 'test' | 'check'
      status: 'running',
      message: `Starting ${type}...`,
      startTime: new Date().toISOString(),
      exitCode: null,
      result: null,
      child: childProcess || null,
    };
    this.tasks.set(taskId, task);
    return taskId;
  }

  getTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    return {
      id: task.id,
      status: task.status,
      message: task.message,
      exit_code: task.exitCode,
      elapsed_seconds: Math.floor((Date.now() - new Date(task.startTime).getTime()) / 1000),
      result: task.result,
    };
  }

  updateTask(taskId, updates) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    Object.assign(task, updates);
  }

  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task || !task.child) return false;
    task.child.kill('SIGTERM');
    this.updateTask(taskId, { status: 'cancelled', message: 'Cancelled by user' });
    return true;
  }
}
```

**Add to server.js ctx:**
```js
const ctx = { workspaceRoot: config.workspaceRoot, taskManager: new TaskManager() };
```

---

## Task 2: Add `async` parameter to `pio_build`

**File:** `src/tools/build.js`

Add `async: z.boolean().optional().default(false)` to the pio_build Zod schema. When `true`, detach the build into a background task and return the taskId immediately.

**Changes required:**
1. Add `async` field to the Zod schema
2. Wrap `runPioCommand` call in async branch: spawn `child_process.exec` without waiting, register with TaskManager, emit MCP log notification
3. Sync branch (existing behavior) remains unchanged
4. Add MCP progress log at key points: `build_started`, `build_complete`, `build_failed`

**Pseudo-implementation:**
```js
if (params.async) {
  const child = exec(cmd, { cwd: projectDir, maxBuffer: 50*1024*1024 }, (error, stdout, stderr) => {
    const combined = (stdout || '') + '\n' + (stderr || '');
    const diagnostics = parseAllDiagnostics(combined, projectDir);
    const metadata = parseBuildMetadata(combined, projectDir, environment);
    taskManager.updateTask(taskId, {
      status: error ? 'failed' : 'completed',
      exitCode: error ? error.code : 0,
      result: { success: !error, diagnostics, summary: summarizeDiagnostics(diagnostics), metadata },
    });
    server.log?.({ level: error ? 'error' : 'info', data: { taskId, event: 'build_complete' } });
  });
  const taskId = taskManager.createTask({ type: 'build', child });
  return { content: [{ type: 'text', text: JSON.stringify({ taskId, status: 'running', message: `Building ${environment || 'default'} in background` }) }] };
}
// existing sync path...
```

---

## Task 3: Add `async` parameter to `pio_upload`

**File:** `src/tools/upload.js`

Same pattern as Task 2. Add `async: z.boolean().optional().default(false)`. When async: detach and return taskId. Sync path unchanged.

---

## Task 4: Register `pio_task_status` tool

**File:** `src/tasks.js` (add tool registration at bottom)

```js
export function registerTaskTools(server, ctx) {
  server.tool(
    'pio_task_status',
    'Check the status of a background task started with async: true. Returns task progress, exit code, and result when complete.',
    {
      task_id: z.string().describe('Task ID returned from an async operation (build, upload, etc.)'),
    },
    async ({ task_id }) => {
      const task = ctx.taskManager.getTask(task_id);
      if (!task) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Task not found', task_id }) }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(task) }] };
    }
  );
}
```

---

## Task 5: Create `src/tools/discover.js` — device discovery + board listing

**File:** `src/tools/discover.js`

### `pio_list_devices`

Wraps `pio device list --json-output` via `child_process.exec`.

**Parameters (Zod schema):**
```js
{
  project_dir: z.string().optional(),
  filter: z.enum(['serial', 'logical', 'mdns']).optional().default('serial'),
}
```

**Implementation:**
```js
const result = await runPioCommand(['device', 'list', `--${filter}`, '--json-output'], { projectDir });
const devices = JSON.parse(result.stdout);
return { content: [{ type: 'text', text: JSON.stringify({ success: true, devices }) }] };
```

### `pio_list_boards`

Parses `platformio.ini` directly to extract `[env:*]` sections with their board/platform/framework assignments. No PIO CLI call needed.

**Parameters:**
```js
{
  project_dir: z.string().optional(),
}
```

**Implementation:**
- Read `platformio.ini` with `fs.readFileSync`
- Parse `[env:*]` sections using regex:
  - `[env:esp32dev]` → env name = `esp32dev`
  - `board = esp32dev` → board
  - `platform = espressif32` → platform
  - `framework = arduino` → framework
- Return array: `[{ env, board, platform, framework }]`
- Include `default_envs` from `[platformio]` section if present

---

## Task 6: Create `src/tools/monitor.js` — serial monitor (3 tools)

**File:** `src/tools/monitor.js`

### `pio_serial_start`

Spawns `pio device monitor` as a detached child process with stdout redirected to a log file.

**Parameters:**
```js
{
  project_dir: z.string().optional(),
  environment: z.string().optional(),
  port: z.string().optional().describe('Serial port (e.g., /dev/ttyUSB0, COM3)'),
  baud: z.number().optional().default(115200),
}
```

**Implementation:**
```js
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Derive log path
const portSlug = (port || 'auto').replace(/\//g, '_').replace(/:/g, '');
const logPath = path.join(projectDir, '.pio', `monitor-${portSlug}.log`);

const args = ['device', 'monitor', '-b', String(baud)];
if (port) args.push('-p', port);
if (environment) args.push('-e', environment);

const logFd = fs.openSync(logPath, 'a');
const child = spawn('pio', args, {
  detached: true,
  stdio: ['ignore', logFd, 'pipe'],
  cwd: projectDir,
});
child.unref();

// Register in task manager for tracking
const taskId = ctx.taskManager.createTask({ type: 'monitor', childProcess: child });
ctx.taskManager.updateTask(taskId, { logPath, port });

return { content: [{ type: 'text', text: JSON.stringify({
  success: true,
  task_id: taskId,
  log_file: logPath,
  pid: child.pid,
  message: `Serial monitor started on ${port || 'auto'} at ${baud}baud`,
}) }] };
```

### `pio_serial_stop`

Kills the monitor daemon by task ID. Returns final summary.

**Parameters:**
```js
{ task_id: z.string().describe('Task ID from pio_serial_start') }
```

**Implementation:**
- Get task from TaskManager
- Send SIGTERM to child, wait 2s, SIGKILL if still running
- Count lines in log file
- Clean up or leave log file (configurable)
- Return: `{ success, task_id, duration_seconds, lines_captured, log_file }`

### `pio_serial_read`

Reads tail of log file with optional regex filter.

**Parameters:**
```js
{
  task_id: z.string().optional().describe('Active monitor task ID (reads its log file)'),
  log_file: z.string().optional().describe('Direct log file path'),
  lines: z.number().optional().default(100).describe('Number of lines to read from end'),
  search_pattern: z.string().optional().describe('Regex filter for lines to return'),
}
```

**Implementation:**
- Resolve log file path from task (via TaskManager) or from `log_file` param
- `fs.readFileSync` the log file, split by `\n`, take last `lines` lines
- Apply `search_pattern` regex filter if provided
- Return as MCP text content

---

## Task 7: Update `src/server.js` — register new tool groups

**File:** `src/server.js`

Add imports and registration calls:

```js
import { registerDiscoverTools } from './tools/discover.js';
import { registerMonitorTools } from './tools/monitor.js';
import { registerCheckTools } from './tools/check.js';    // Plan B
import { registerTestTools } from './tools/test.js';      // Plan B
import { registerTaskTools } from './tasks.js';

// In main(), after existing registrations:
registerTaskTools(server, ctx);
registerDiscoverTools(server, ctx);
registerMonitorTools(server, ctx);
// registerCheckTools and registerTestTools added in Plan B
```

Also initialize TasksManager in ctx:
```js
import { TaskManager } from './tasks.js';
const ctx = { workspaceRoot: config.workspaceRoot, taskManager: new TaskManager() };
```

---

## Acceptance Criteria

1. `pio_task_status` correctly tracks running/completed/failed tasks
2. `pio_build` with `async: true` returns taskId immediately, polls to completion
3. `pio_list_devices` returns connected serial ports as JSON array
4. `pio_list_boards` returns project environments with board/platform/framework
5. `pio_serial_start` spawns detached monitor daemon with log file
6. `pio_serial_stop` kills daemon and returns summary
7. `pio_serial_read` returns last N lines with optional regex filter
8. All tools use existing `PioMcpError` error taxonomy — no new error codes needed
9. `src/tasks.js` TaskManager is exported and used by build/upload async paths

---

## Files Changed

| File | Action |
|------|--------|
| `src/tasks.js` | CREATE — TaskManager class + `registerTaskTools` |
| `src/tools/discover.js` | CREATE — `pio_list_devices`, `pio_list_boards` |
| `src/tools/monitor.js` | CREATE — `pio_serial_start`, `pio_serial_stop`, `pio_serial_read` |
| `src/tools/build.js` | EDIT — add `async` param, TaskManager integration |
| `src/tools/upload.js` | EDIT — add `async` param, TaskManager integration |
| `src/server.js` | EDIT — import+register new tool groups, add TaskManager to ctx |
