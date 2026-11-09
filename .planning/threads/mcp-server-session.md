---
title: "MCP Server Session — project_dir removal, .logs path, serial monitor fix"
date: "2026-06-23 22:15"
updated: "2026-06-23"
status: "resolved"
---

## Session Summary

**Date:** 2026-06-23
**Workspace:** `/home/zandev32/playground/pioneer`

## Changes Made

### 1. Removed `project_dir` Parameter from All MCP Tools

**Problem:** User wanted tools to automatically use the workspace root without requiring `project_dir` in every tool call.

**Files changed (7 tool files):**
- `src/tools/build.js` — `pio_build`
- `src/tools/upload.js` — `pio_upload`
- `src/tools/clean.js` — `pio_clean`
- `src/tools/discover.js` — `pio_list_devices`, `pio_list_boards`
- `src/tools/check.js` — `pio_check`
- `src/tools/test.js` — `pio_run_tests`
- `src/tools/monitor.js` — `pio_serial_start`

**Pattern applied:**
- Removed `project_dir: z.string().optional()` from Zod schemas
- Changed `const projectDir = params.project_dir ? path.resolve(params.project_dir) : ctx.workspaceRoot` to `const projectDir = ctx.workspaceRoot`
- Removed `assertWithinWorkspace` calls (no external path to validate)
- Removed dead `assertWithinWorkspace` imports from 6 files (monitor.js keeps it for log file validation)

**SKILL.md updated:** Removed `project_dir` rows from all 7 tool reference tables and updated Rule 3.

### 2. VS Code MCP Configuration Fix

**Problem:** `${workspaceFolder}` variable cannot be resolved in user-level MCP settings.

**Solution:**
- Removed pioarduino entry from global config (`~/.config/Code/User/profiles/-1dbf1ecc/mcp.json`)
- Added to workspace-level config (`/home/zandev32/Documents/klaklik/SesaIoTNode/.vscode/mcp.json`)
- Server defaults to `process.cwd()` when no `--workspace` arg — VS Code sets cwd to workspace folder automatically

### 3. Serial Monitor Log Path Change

**Problem:** Logs were stored in `.pio/monitor-{port}.log` — user wanted them in `.logs/` with timestamped filenames.

**Changes:**
- Replaced `ensurePioDir` with `ensureLogsDir` — creates `.logs/` directory
- New path format: `{projectDir}/.logs/{portSlug}_{YYYY_MM_DD.HH.mm.ss.SSS}.log`
- Example: `/home/user/project/.logs/ttyACM0_2026_06_23.14.30.45.123.log`
- Added `formatTimestamp()` helper function

### 4. Serial Monitor Immediate Write Fix

**Problem:** Logs weren't being written immediately when started, and some output was lost.

**Root cause:** Raw file descriptor passed to `spawn`'s `stdio[1]` uses OS-level buffering.

**Fix:**
- Changed from `stdio: ['ignore', logFd, 'pipe']` to `stdio: ['ignore', 'pipe', 'pipe']`
- Created `fs.createWriteStream` with `highWaterMark: 0` for no buffering
- Pipe stdout to log stream: `child.stdout?.on('data', (data) => logStream.write(data))`
- Also pipe stderr to log stream

### 5. Serial Monitor TTY Fix

**Problem:** `pio device monitor` crashes with `termios.error: (25, 'Inappropriate ioctl for device')` when spawned without a TTY.

**Root cause:** Python's `miniterm` calls `termios.tcgetattr(self.fd)` on stdin (fd 0), which fails on a pipe.

**Fix:**
- Replaced `pio device monitor` with `sh -c 'stty -F <port> <baud> raw && cat <port>'`
- `stty` configures baud rate and raw mode, `cat` reads raw serial data
- Works without TTY, read-only (no keyboard input to device)
- Port is now **required** (can't auto-detect without `pio device monitor`)

## Verification

- Build passes: `npm run build` → `Built dist/server.js successfully`
- Global install: `sudo npm install -g .`

## Files Modified

| File | Change |
|------|--------|
| `src/tools/build.js` | Remove `project_dir` param, dead import |
| `src/tools/upload.js` | Remove `project_dir` param, dead import |
| `src/tools/clean.js` | Remove `project_dir` param, dead import |
| `src/tools/discover.js` | Remove `project_dir` from both tools, dead import |
| `src/tools/check.js` | Remove `project_dir` param, dead import |
| `src/tools/test.js` | Remove `project_dir` param, dead import |
| `src/tools/monitor.js` | Remove `project_dir`, new log path, immediate writes, TTY fix |
| `.agents/skills/pio-mcp-manager/SKILL.md` | Remove `project_dir` from tool tables |
| `~/.config/Code/User/profiles/-1dbf1ecc/mcp.json` | Removed pioarduino entry |
| `Documents/klaklik/SesaIoTNode/.vscode/mcp.json` | Added pioarduino entry |

## Lessons Learned

1. **`${workspaceFolder}` only works in workspace settings**, not user-level MCP configs
2. **`pio device monitor` requires a TTY** — can't be spawned as a background process with piped stdio
3. **Raw file descriptor buffering** — `fs.openSync` + `spawn(stdio: [.., fd, ..])` buffers at OS level; `createWriteStream` with `highWaterMark: 0` + pipe gives immediate writes
4. **MCP server workspace root is set at startup** — `ctx.workspaceRoot` comes from `--workspace` arg or `PIO_WORKSPACE_ROOT` env, not per-call
