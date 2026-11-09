---
name: "pio-mcp-manager"
description: "3-tier execution hierarchy for Pioneer MCP server — MCP tools, auto-install detection, and shell fallback with safety guardrails"
---

# pio-mcp-manager Skill

**When to use this skill** — Load this skill when you need to:
- Build PlatformIO firmware projects
- Upload/flash firmware to ESP32, Arduino, or other embedded boards
- Clean build artifacts from PlatformIO projects
- Manage PlatformIO projects (build environments, serial monitoring, device discovery)
- Troubleshoot ESP32 build, upload, or runtime issues
- Develop embedded systems with PlatformIO in an AI-assisted IDE

**When NOT to use this skill** — Do NOT load this skill for:
- VS Code extension development (use the `pioarduino-vscode-ide` workspace instead)
- Hardware debugging beyond firmware flashing (oscilloscope, logic analyzer work)
- Circuit design, PCB layout, or schematic review
- General Node.js or web development tasks

---

## 3-Tier Execution Hierarchy

This skill governs how you interact with the Pioneer MCP server. Always attempt the highest tier available; fall back only when the tier above is unavailable.

### 🟢 Tier 1 (Preferred): Direct MCP Tool Calls

When the MCP server is available, call tools directly. This is the fastest path with full structured diagnostics, workspace validation, and metadata extraction.

**Available tools:**

| Tool | Purpose |
|------|---------|
| `pio_build` | Build firmware for a specified environment |
| `pio_upload` | Upload firmware to a connected device |
| `pio_clean` | Remove build artifacts for a specific environment |
| `pio_list_devices` | Discover connected serial, logical, or mDNS devices |
| `pio_list_boards` | List project environments with board/platform/framework from platformio.ini |
| `pio_task_status` | Poll a background (async) operation for progress and results |
| `pio_task_list` | List all currently running background tasks |
| `pio_serial_start` | Start a serial monitor daemon spooling to disk |
| `pio_serial_stop` | Stop a running serial monitor daemon |
| `pio_serial_read` | Read tail of serial monitor log file with optional regex filter |
| `pio_check` | Run static code analysis (cppcheck/clangtidy/pvs-studio) |
| `pio_run_tests` | Run PlatformIO unit tests with structured results |

**Usage:** Call the tool with parameters as documented in the Tool Reference section below. No confirmation needed for `pio_build`, `pio_clean`, `pio_check`, or `pio_run_tests`. **ALWAYS confirm with the user before `pio_upload`** (see Safety Rules).

### 🟡 Tier 2 (Self-Healing): Detect-Then-Install

If MCP tools are not available, follow this pattern:

1. **Detect:** Check if `pioneer` is installed and accessible
2. **Ask:** "Would you like me to install the MCP server for better build diagnostics and safety?"
3. **Install (if user agrees):** Run `npx pioneer` or `npm install -g pioneer`
4. **Fallback:** If the user explicitly declines, proceed to Tier 3

**Important:** Do NOT auto-install on every invocation. Only install when detection fails AND the user confirms.

### 🔴 Tier 3 (Fallback): Shell Wrapper Scripts

When neither Tier 1 nor Tier 2 is available, use standalone scripts in `.agents/skills/pio-mcp-manager/assets/`:

| Script | Invokes |
|--------|---------|
| `build.sh` | `pio run -e <env>` |
| `upload.sh` | `pio run -t upload` |
| `clean.sh` | `pio run -t clean` |
| `monitor.sh` | `pio device monitor` |
| `discover.sh` | `pio device list` |
| `test.sh` | `pio test` |

**⚠️ WARNING:** Tier 3 operates **without safety guardrails**. There is no workspace validation, no structured diagnostics, no mutex safety, and no error parsing. Inform the user they are operating without MCP server protections.

---

## Safety Rules

These rules apply across ALL tiers. Never bypass them.

### Rule 1: Ask-Before-Flash
**ALWAYS** ask the user for explicit confirmation before any upload/flash operation.

> "I'm about to flash firmware to `{port}` on environment `{env}`. Confirm?"

Build and clean operations are safe — no confirmation needed. Upload/flash modifies device firmware and requires user consent every time.

### Rule 2: Port Discovery Required
NEVER guess or assume a serial port. Always run `pio device list` (or call `discover.sh` in Tier 3) before recommending a port. Present the discovered ports to the user and let them choose.

### Rule 3: Workspace Boundary Enforcement
Validate that `project_dir` contains `platformio.ini` before executing any command. Only the workspace root and its children are accessible. Reject any path outside the workspace.

The MCP server enforces this via `PROJECT_OUTSIDE_WORKSPACE` error — but in Tier 3, **you** must enforce it manually.

### Rule 4: Error Code Reference

The MCP server uses structured JSON-RPC error codes. Know these to interpret failures:

| Error Code | Constant | Meaning |
|------------|----------|---------|
| `-32001` | `PROJECT_NOT_FOUND` | No `platformio.ini` at project path |
| `-32002` | `ENV_NOT_FOUND` | Specified environment not in `platformio.ini` |
| `-32003` | `BUILD_FAILED` | Compilation or linking failed |
| `-32004` | `UPLOAD_FAILED` | Firmware upload to device failed |
| `-32005` | `PIO_NOT_INSTALLED` | PlatformIO Core not installed |
| `-32006` | `PORT_BUSY` | Serial port in use by another process |
| `-32007` | `PROJECT_OUTSIDE_WORKSPACE` | Path is outside allowed workspace |
| `-32008` | `NO_DEVICE` | No serial device found |
| `-32009` | `PIO_COMMAND_NOT_FOUND` | `pio` CLI not in PATH |

### Rule 5: Token Efficiency — Never Use `verbose: true` Unless Debugging
**NEVER** set `verbose: true` on `pio_build`, `pio_upload`, or `pio_check` unless the user explicitly asks for full output or you are diagnosing a specific linker/compiler issue.

- Default (`verbose: false`) returns structured diagnostics only — 16x fewer tokens.
- `verbose: true` returns the full raw build log — can be 10,000+ lines and waste context.
- Only use `verbose: true` when: the user asks for it, or structured diagnostics show an error you cannot diagnose without the full log.
- Similarly, prefer `incremental: true` over full builds when checking for errors in recently modified files.

### Rule 6: Memory Usage — `include_memory: false` by Default
**NEVER** set `include_memory: true` on `pio_build` unless the user specifically asks about RAM/Flash usage.

- Default metadata includes `duration_seconds` and `binary_size_bytes` only.
- `include_memory: true` adds RAM/Flash percentage breakdown (~200 extra tokens per build).
- Only use when: checking memory constraints after adding large libraries, or the user asks "how much flash/RAM does this use?"
- The `metadata` field always exists — only the `memory` sub-object is conditional.

---

## Tool Reference

Complete parameter reference for all 12 MCP tools from Pioneer.

### `pio_build`

Builds firmware and returns structured diagnostics (not raw logs).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `environment` | string | No | `default_envs` from platformio.ini | Build environment name (e.g., `esp32dev`) |
| `verbose` | boolean | No | `false` | Include full build output when true. **AVOID: 16x token usage.** |
| `build_only` | boolean | No | `false` | Generate `compile_commands.json` for IDE integration without full build |
| `include_memory` | boolean | No | `false` | Include RAM/Flash breakdown. **AVOID: ~200 extra tokens.** |
| `incremental` | boolean | No | `false` | Only return diagnostics for files modified since last build |
| `async` | boolean | No | `false` | Run in background; returns `task_id` — poll with `pio_task_status` |

**Returns:** `{ success, exit_code, diagnostics, summary, metadata }` or `{ task_id, status, message }` when async
- `diagnostics`: Array of `{ file, line, column, type, message, category }`
- `summary`: Human-readable string (e.g., "2 errors, 3 warnings")
- `metadata`: `{ duration_seconds, binary_size_bytes, [memory: { ram_percent, flash_percent, ... }] }` (memory only when `include_memory: true`)

### `pio_upload`

Uploads firmware to a connected device.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `environment` | string | No | `default_envs` from platformio.ini | Build environment name |
| `port` | string | No | auto-detected | Serial port (e.g., `/dev/ttyUSB0`, `COM3`) |
| `verbose` | boolean | No | `false` | Include full upload output when true |
| `async` | boolean | No | `false` | Run in background; returns `task_id` — poll with `pio_task_status` |

**Returns:** `{ success, exit_code, diagnostics, summary, metadata }` or `{ task_id, status, message }` when async

### `pio_clean`

Removes build artifacts for a specific environment. Per-environment only — safe for multi-env projects.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `environment` | string | **Yes** | — | Build environment to clean (e.g., `esp32dev`) |
| `verbose` | boolean | No | `false` | Include full output when true |

**Returns:** `{ success, environment, bytes_freed }`

### `pio_list_devices`

Discovers connected serial, logical, or mDNS devices detected by PlatformIO.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `filter` | enum | No | `serial` | `serial`, `logical`, or `mdns` |

**Returns:** `{ success, filter, devices: [{ port, hwid, description, type }], count }`
**Use when:** Finding which port a board is connected to before `pio_upload` or `pio_serial_start`.

### `pio_list_boards`

Lists build environments from `platformio.ini` with their board/platform/framework.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
**Returns:** `{ success, environments: [{ env, board, platform, framework }], default_envs, count }`
**Use when:** Discovering which environments exist before building or cleaning.

### `pio_task_status`

Polls the status of a background (async) operation.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_id` | string | **Yes** | — | Task ID returned from an async operation |

**Returns:** `{ id, type, status, message, exit_code, elapsed_seconds, result, meta }`
- `status`: `running` | `completed` | `failed` | `cancelled` | `stopped`

### `pio_task_list`

Lists all currently running background tasks. No parameters.
**Returns:** `{ running_tasks: Array, count: number }`

### `pio_serial_start`

Starts a serial monitor daemon. Spools `pio device monitor` output to a log file at `<project>/.pio/monitor-<port>.log`.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `environment` | string | No | — | Inherits monitor settings from platformio.ini |
| `port` | string | No | auto-detected | Serial port (e.g., `/dev/ttyUSB0`, `COM3`) |
| `baud` | number | No | `115200` | Baud rate |

**Returns:** `{ success, task_id, log_file, pid, port, baud }`
**Lifecycle:** Use `pio_serial_read` to inspect, `pio_serial_stop` to halt.

### `pio_serial_stop`

Stops a running serial monitor daemon. Returns a summary.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_id` | string | **Yes** | — | Task ID from `pio_serial_start` |
| `delete_log` | boolean | No | `false` | Delete log file after stopping |

**Returns:** `{ success, task_id, killed, log_file, lines_captured, duration_seconds }`

### `pio_serial_read`

Reads the last N lines of a serial monitor log file with optional regex filter.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_id` | string | No | — | Monitor task ID (auto-resolves log file) |
| `log_file` | string | No | — | Direct log file path |
| `lines` | number | No | `100` | Lines from end |
| `search_pattern` | string | No | — | JS regex filter (applied before tail) |

**Returns:** `{ success, log_file, lines_read, total_lines, search_pattern, lines: string[] }`

### `pio_check`

Static code analysis. Supports cppcheck, clangtidy, pvs-studio.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `environment` | string | No | all | Environment to check |
| `tool` | enum | No | platformio.ini `check_tool` | `cppcheck`, `clangtidy`, or `pvs-studio` |
| `severity` | enum | No | `low` (all) | Minimum: `high`, `medium`, `low` |
| `verbose` | boolean | No | `false` | Include tool output details |

**Returns:** `{ success, exit_code, tools_run, total_defects, diagnostics, summary }`
- `diagnostics`: Array of `{ file, line, column, type, message, severity, id, cwe, tool, env }`
- PVS-Studio requires a commercial license; license errors reported gracefully.

### `pio_run_tests`

Runs PlatformIO unit tests with structured pass/fail results.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `environment` | string | No | all | Environment to test |
| `filter` | string | No | — | Test name/pattern filter |
| `timeout_seconds` | number | No | `300` | Timeout (increase for large suites) |
| `verbose` | boolean | No | `false` | Include raw output |
| `async` | boolean | No | `false` | Run in background; returns `task_id` |

**Returns:** `{ success, exit_code, results, summary }` or `{ task_id, status, message }` when async
- `results`: Structured JSON (null if PIO doesn't support `--json-output-path`)
- `summary`: e.g., "3 suites, 12 passed, 1 failed"

---

## ESP32 Troubleshooting Quick-Reference

### Area 1: Port & Connection Issues

| Issue | Symptoms | Fix |
|-------|----------|-----|
| USB driver not detected | `NO_DEVICE` error, device not listed | Install ESP-IDF USB rules; check `dmesg \| grep tty` |
| DTR/RTS upload failures | Upload succeeds but board doesn't boot | Use `--upload-port` with explicit port; try `esptool.py` directly |
| Cable/hardware problems | Intermittent connection, `PORT_BUSY` | Try different USB cable; use USB 2.0 port (not USB 3.0 hub) |
| Flash corruption | Board stuck in boot loop | Run `esptool.py erase_flash`, then re-flash |
| Port busy | `PORT_BUSY (-32006)` | Close serial monitor; kill other processes using the port |

**Discovery:** `pio device list` for port enumeration. `pio device monitor` for serial output.

### Area 2: Build & Compile Errors

| Issue | Symptoms | Fix |
|-------|----------|-----|
| Compilation errors | `BUILD_FAILED (-32003)`, GCC diagnostics | Read `diagnostics[].message` — MCP server parses file:line:col format |
| Memory overflow | "RAM: [==========] 102% (used X bytes)" in metadata | Reduce code size, disable features, or choose board with more RAM/flash |
| Partition table mismatch | Flash size error in build output | Verify `partitions.csv` matches your board's flash size |
| Missing project | `PROJECT_NOT_FOUND (-32001)` | Ensure `platformio.ini` exists in `project_dir` |
| Missing environment | `ENV_NOT_FOUND (-32002)` | Check `[env:xxx]` sections in `platformio.ini` |

**Diagnostics:** The MCP server parses GCC/Clang, linker, Python, and CMake errors automatically via `src/parsers.js`. Always check structured `diagnostics` before reading raw output.

### Area 3: ESP32 Runtime Issues

| Issue | Symptoms | Fix |
|-------|----------|-----|
| Boot loops | Board restarts continuously | Check serial monitor output; verify boot mode pins; re-flash clean firmware |
| Guru Meditation errors | Panic on serial console with register dump | Decode with `espexceptiondecoder` tool; check null pointer dereferences |
| Watchdog timeouts | "Task watchdog was not reset" in serial | Check for blocking operations in tasks; increase WDT timeout in config |
| Brownout detector | "Brownout detector was triggered" in serial | Insufficient power — check USB cable quality; use powered USB hub |

### Area 4: Library & Platform Issues

| Issue | Symptoms | Fix |
|-------|----------|-----|
| Board definition missing | "Unknown board" error in build | Run `pio boards list`; update platform with `pio platform update` |
| Library conflicts | Multiple versions of same lib | Use `lib_ignore` in `platformio.ini`; pin versions in `lib_deps` |
| Platform version mismatch | Build fails after platform update | Pin version: `platform = espressif32 @ 6.9.0` in `platformio.ini` |
| Framework incompatibility | Arduino vs ESP-IDF API differences | Verify `framework = arduino` or `framework = espidf` matches your code |

---

## Shell Fallback Reference (Tier 3)

When using Tier 3 shell wrappers, the invocation signatures are:

```bash
# Build firmware
build.sh [project_dir] [environment] [--verbose]
# → invokes: pio run -e <env>

# Upload firmware (ALWAYS confirm with user first)
upload.sh [project_dir] [environment] [port] [--verbose]
# → invokes: pio run -t upload

# Clean build artifacts
clean.sh [project_dir] [environment]
# → invokes: pio run -t clean

# Serial monitor output
monitor.sh [project_dir] [environment] [port]
# → invokes: pio device monitor

# Discover connected devices
discover.sh
# → invokes: pio device list

# Run tests
test.sh [project_dir] [environment]
# → invokes: pio test
```

**Tier 3 limitations:** No workspace validation, no structured JSON diagnostics, no error code mapping, no build metadata extraction (RAM/Flash %, duration, binary size). All output is raw CLI text.
