# Phase 2: Tool Expansion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 02-tool-expansion
**Areas discussed:** Device discovery approach, Background task feedback, Serial monitor design, Static analysis scope

---

## Device Discovery Approach

| Option | Description | Selected |
|--------|-------------|----------|
| `pio device list --json-output` | Consistent with existing `runPioCommand` pattern. Zero new deps. ~1-2s response time. | ✓ |
| `serialport` npm library | Fast sub-second listing but requires native C++ bindings and build toolchain for npm install. | |
| Hybrid (pio + serialport) | Best of both worlds — pio for PlatformIO-aware data, serialport for fast raw. Only worth it if serial monitor also needs serialport. | |
| OS-level enumeration | No pio CLI dependency, but fragile 3-platform code paths. | |

**User's choice:** `pio device list --json-output`
**Notes:** Consistency with existing architecture prioritized over speed. Serial monitor will use `pio device monitor` child process, not serialport — so hybrid approach adds no value.

---

## Background Task Feedback

| Option | Description | Selected |
|--------|-------------|----------|
| `pio_task_status` polling only | New pio_task_status tool + optional taskId in build/upload. Universal across all hosts. | |
| Layered: polling + MCP logging | Use both: pio_task_status as reliable backbone + MCP logging for passive visibility. | ✓ |
| Blocking with configurable timeout | Keep current blocking model, just add timeout param. Simplest but risks host timeout. | |
| MCP progress notifications | Spec-native progress tokens. Clean but silently fails on major hosts. | |

**User's choice:** Layered: polling + MCP logging (confirmed after revisit)
**Notes:** User initially selected layered approach, revisited to reconsider, then confirmed the original choice. Best coverage across all MCP hosts.

---

## Serial Monitor Design

| Option | Description | Selected |
|--------|-------------|----------|
| 2-tool hybrid | pio_serial_start + pio_serial_read (with stop:true). Disk-spooled, 2 tools. | |
| 3 separate tools | pio_serial_start + pio_serial_stop + pio_serial_read. Full granular control, matches competitor exactly. | ✓ |
| In-memory ring buffer | In-memory only. Fast, no disk I/O, but loses all data on crash. | |

**User's choice:** 3 separate tools
**Notes:** Matches competitor's (jl-codes/platformio-mcp) proven production pattern exactly. Full lifecycle control preferred over condensed interface.

---

## Static Analysis Scope

| Option | Description | Selected |
|--------|-------------|----------|
| User-selectable with `--json-output` | Agent picks tool via parameter. `--json-output` eliminates all custom parsing. | ✓ |
| clang-tidy + cppcheck | Both free and open source. Covers semantic + low-level + style. ~2x execution time. | |
| cppcheck only | PlatformIO's actual default. Fast, free, small footprint. Misses clang-tidy semantic checks. | |
| All 3 tools | Max coverage with CERT/MISRA/CWE. But PVS-Studio is commercial and 3x runtime. | |

**User's choice:** User-selectable with `--json-output`
**Notes:** Key discovery: `pio check --json-output` provides unified JSON across all tools — nearly identical to existing diagnostic shape, eliminating custom text parsers entirely.

---

## Agent's Discretion

- Tool module file names (discover.js, monitor.js, check.js, test.js)
- Task store implementation (in-memory Map vs persistent file)
- Log file location for serial monitor spooling
- Default baud rate for serial monitor
- Ring buffer size in `pio_serial_read`
- Whether `pio_list_boards` parses platformio.ini directly or uses `pio boards --json-output`
- `pio_run_tests` implementation details

## Deferred Ideas

- `serialport` npm library integration — defer until a phase needs direct serial communication
- MCP `notifications/progress` as sole mechanism — defer until host support matures
- PVS-Studio license management helper — not needed, PlatformIO handles gracefully
- Web dashboard for live serial streaming — Phase 4 territory
