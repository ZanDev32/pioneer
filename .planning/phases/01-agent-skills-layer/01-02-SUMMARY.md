---
phase: 01-agent-skills-layer
plan: 02
subsystem: tier-3-shell-wrappers
tags: [shell, fallback, cli, pio-wrapper, tier-3]
dependency_graph:
  requires: []
  provides: [executable-shell-wrappers, pio-cli-interfaces]
  affects: [SKILL.md-tier-3-documentation]
tech_stack:
  added: [bash, shell-scripting]
  patterns: [set-euo-pipefail, command-path-check, positional-args, quoted-vars]
key_files:
  created:
    - .agents/skills/pio-mcp-manager/assets/build.sh
    - .agents/skills/pio-mcp-manager/assets/upload.sh
    - .agents/skills/pio-mcp-manager/assets/clean.sh
    - .agents/skills/pio-mcp-manager/assets/monitor.sh
    - .agents/skills/pio-mcp-manager/assets/discover.sh
    - .agents/skills/pio-mcp-manager/assets/test.sh
  modified: []
decisions:
  - "D-07: Standalone scripts (one per command) — followed exactly"
  - "D-08: Extended scope covers all 6 commands — build, upload, clean, monitor, discover, test"
  - "All scripts use quoted variables to prevent word splitting (T-01-06 mitigation)"
  - "Scripts do NOT change directory outside project_dir — cd only happens after validation"
  - "monitor.sh uses set -uo pipefail (not -e) to allow clean Ctrl+C exit"
  - "upload.sh prints WARNING about missing MCP guardrails (per D-04, agent-level ask-before-flash)"
  - "clean.sh requires both project_dir and environment as mandatory args (matches MCP tool contract)"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-06-21"
  total_scripts: 6
  total_lines: 312
---

# Phase 01 Plan 02: Shell Wrapper Scripts Summary

**One-liner:** Created 6 standalone executable bash shell wrappers serving as Tier 3 fallback — build, upload, clean, monitor, discover, test — each with PATH validation, platformio.ini verification, and structured error handling.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Create build.sh and upload.sh shell wrappers | b0867fb | `.agents/skills/pio-mcp-manager/assets/build.sh`, `.agents/skills/pio-mcp-manager/assets/upload.sh` |
| 2 | Create clean.sh, monitor.sh, discover.sh, test.sh shell wrappers | 8d2d1bc | `.agents/skills/pio-mcp-manager/assets/{clean,monitor,discover,test}.sh` |

## Output Summary

### Scripts Created (6/6)

| Script | Lines | pio Command | Args | Validation |
|--------|-------|-------------|------|------------|
| build.sh | 58 | `pio run` | [project_dir] [env] [--verbose] | PATH, platformio.ini |
| upload.sh | 77 | `pio run -t upload` | [project_dir] [env] [port] [--verbose] | PATH, platformio.ini, WARNING header |
| clean.sh | 51 | `pio run -t clean` | `<project_dir>` `<env>` (required) | PATH, platformio.ini, args count |
| monitor.sh | 56 | `pio device monitor` | [project_dir] [env] [port] | PATH, platformio.ini |
| discover.sh | 23 | `pio device list` | (no args) | PATH |
| test.sh | 47 | `pio test` | [project_dir] [env] | PATH, platformio.ini |

### Common Patterns Across All Scripts

- **Shebang:** `#!/usr/bin/env bash` on line 1
- **PATH check:** `command -v pio` before every execution
- **Error output:** `"ERROR: pio CLI not found in PATH. Install PlatformIO Core first."` + install hint
- **Variable quoting:** All variables quoted (`"$VAR"`) to prevent word splitting (T-01-06)
- **Strict mode:** `set -euo pipefail` (monitor.sh uses `set -uo pipefail` to allow clean Ctrl+C)
- **Error propagation:** Scripts exit with the pio command's exit code on failure

### Acceptance Criteria Verification

All checks passed:
- ✅ All 6 scripts exist and are executable (`chmod +x` applied)
- ✅ All scripts have `#!/usr/bin/env bash` shebang
- ✅ All scripts contain `command -v pio` PATH check
- ✅ All scripts exit 1 when pio not found
- ✅ build.sh: `pio run` with optional env (-e) and verbose (-v)
- ✅ upload.sh: `pio run -t upload` with env, port, verbose; WARNING header
- ✅ clean.sh: `pio run -t clean` with required environment; exits 1 if missing args
- ✅ monitor.sh: `pio device monitor` with optional port and environment
- ✅ discover.sh: `pio device list` with no arguments
- ✅ test.sh: `pio test` with optional environment
- ✅ build.sh, upload.sh, clean.sh, test.sh: platformio.ini validation
- ✅ All scripts meet minimum line count requirements

## Deviations from Plan

None — plan executed exactly as written.

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|------------|
| T-01-06 (Injection) | All scripts use quoted variables (`"$VAR"`) preventing word splitting and glob expansion |
| T-01-07 (Missing platformio.ini) | build.sh, upload.sh, clean.sh, test.sh verify `test -f "$PROJECT_DIR/platformio.ini"` |
| T-01-08 (File tampering) | Scripts are in `.agents/skills/pio-mcp-manager/assets/` — version-controlled repo path |
| T-01-09 (Flash without confirmation) | upload.sh prints WARNING; ask-before-flash enforced at SKILL.md agent level (D-04) |
| T-01-SC (npm/pip installs) | Scripts only invoke pre-installed `pio` binary; no package installation |

## Threat Flags

None identified beyond the existing threat register.

## Known Stubs

None — scripts are fully functional with no placeholder data.

## Self-Check: PASSED

All 6 scripts exist, are executable, contain required shebangs, PATH checks, pio commands, and platformio.ini validation as verified by automated checks.
