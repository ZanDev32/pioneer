# Plan 02 Summary: Check & Test

**Phase:** 02-tool-expansion
**Plan:** 02 (Wave 2)
**Status:** ✅ COMPLETE
**Date:** 2026-06-22

## What was delivered

| Task | File | Description | Commits |
|------|------|-------------|---------|
| 1 | `src/tools/check.js` | `pio_check` — static analysis via cppcheck/clangtidy/pvs-studio with robust JSON extraction (PlatformIO #4029) | `549548f` |
| 2 | `src/tools/test.js` | `pio_run_tests` — unit test execution via `pio test --json-output-path` with graceful degradation | `549548f` |
| 3 | (in server.js) | Already wired from Wave 1 — no additional changes needed | — |
| 4 | `.agents/skills/pio-mcp-manager/SKILL.md` | Updated Tier 1 tool table (3 → 12 tools) and full Tool Reference section | (this commit) |
| 5 | Shell wrappers | Alignment verified — `discover.sh`, `test.sh`, `monitor.sh` match MCP interfaces | — |

## Key design decisions applied

- **Robust JSON extraction for `pio check`:** Strips non-`[` prefix from stdout (handles PlatformIO #4029 — tool-install progress text mixed with JSON)
- **`--json-output-path` for `pio test`:** PIO test doesn't support `--json-output` flag — writes JSON to file, parser reads and cleans up
- **Graceful degradation:** If JSON file not generated (older PIO, host testing), falls back to text-based summary parsing
- **5-minute default timeout for tests:** Unit tests can take long on embedded targets; configurable via `timeout_seconds`
- **PVS-Studio exposed in enum:** Degrades gracefully on license errors (PlatformIO surfaces them in output)

## Build verification

- `npm run build` → `Built dist/server.js successfully` ✅
- No new dependencies added (still only MCP SDK + zod)
- All 12 MCP tools registered and discoverable

## Acceptance criteria status

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `pio_check` runs cppcheck, clangtidy, or pvs-studio and returns structured defects | ✅ |
| 2 | `pio_check --json-output` stdout parsed correctly with robust extraction | ✅ |
| 3 | `pio_run_tests` executes tests and returns structured pass/fail results | ✅ |
| 4 | `pio_run_tests` degrades gracefully when `--json-output-path` unavailable | ✅ |
| 5 | SKILL.md Tier 1 documents all 12 MCP tools | ✅ |
| 6 | Shell wrappers align with MCP tool parameters | ✅ |
| 7 | All new tools use `PioMcpError` + `wrapToolError` | ✅ |
| 8 | All new tools validate paths with `assertWithinWorkspace` | ✅ |

## Deviations from PLAN-B

- SKILL.md updated to reference 12 tools (not 9) because plan-phase count underestimated (includes `pio_task_list` and the `async` param additions to build/upload)
- `severity` filter in `pio_check` uses PlatformIO's `--severity` CLI flag AND client-side post-filtering (belt and suspenders approach)

## Complete tool inventory (Phase 2 deliverables)

| Tool | Source | Status |
|------|--------|--------|
| `pio_task_status` | `src/tasks.js` | ✅ |
| `pio_task_list` | `src/tasks.js` | ✅ |
| `pio_build` (async) | `src/tools/build.js` | ✅ |
| `pio_upload` (async) | `src/tools/upload.js` | ✅ |
| `pio_list_devices` | `src/tools/discover.js` | ✅ |
| `pio_list_boards` | `src/tools/discover.js` | ✅ |
| `pio_serial_start` | `src/tools/monitor.js` | ✅ |
| `pio_serial_stop` | `src/tools/monitor.js` | ✅ |
| `pio_serial_read` | `src/tools/monitor.js` | ✅ |
| `pio_check` | `src/tools/check.js` | ✅ |
| `pio_run_tests` | `src/tools/test.js` | ✅ |

**Total: 11 new tools + 2 async parameters added = Phase 2 complete.**
