---
phase: 01-agent-skills-layer
plan: 01
subsystem: agent-skills-layer
tags: [documentation, agent-skills, mcp-server]
dependency_graph:
  requires: []
  provides: [agent-execution-hierarchy, safety-guardrails, troubleshooting-reference]
  affects: [future-shell-wrapper-tasks]
tech-stack:
  added: [SKILL.md (Anthropic Agent Skills format)]
  patterns: [3-tier-execution, ask-before-flash, detect-then-install]
key-files:
  created: [.agents/skills/pio-mcp-manager/SKILL.md]
  modified: []
decisions:
  - "D-01: Tier 1 MCP direct calls, no SKILL.md gate"
  - "D-02: Tier 2 detect-then-install, not auto-install every time"
  - "D-03: Tier 3 shell fallback with 6 standalone scripts"
  - "D-04: Ask-before-flash mandatory for upload operations"
  - "D-05: Port discovery via pio device list before recommending port"
  - "D-06: Workspace boundary enforcement (platformio.ini validation)"
  - "D-07: One standalone script per command"
  - "D-08: Extended scope includes all 6 commands"
  - "D-09: Comprehensive troubleshooting reference covering 4 areas"
  - "D-10: Single mega-skill file"
metrics:
  duration_minutes: 5
  completed_date: 2026-06-21
  tasks_completed: 3
  tasks_total: 3
  lines_of_documentation: 231
---

# Phase 01 Plan 01: Create Mega-Skill SKILL.md Summary

**One-liner:** Created a comprehensive 231-line SKILL.md mega-skill with 3-tier execution hierarchy, safety guardrails, tool parameter reference, and ESP32 troubleshooting quick-reference for the pioarduino MCP server.

## Tasks Completed

| Task | Name | Commit | Files Created |
|------|------|--------|---------------|
| 1 | Create SKILL.md directory structure and YAML frontmatter | ab6e846 | `.agents/skills/pio-mcp-manager/SKILL.md` |
| 2 | Write 3-tier execution hierarchy and safety guardrails | ab6e846 | `.agents/skills/pio-mcp-manager/SKILL.md` |
| 3 | Write ESP32 troubleshooting quick-reference and validate | ab6e846 | `.agents/skills/pio-mcp-manager/SKILL.md` |

## What Was Built

A single comprehensive SKILL.md file at `.agents/skills/pio-mcp-manager/SKILL.md` (231 lines, well under the 500-line limit) that serves as the single source of truth for how AI agents interact with the pioarduino MCP server. The file contains:

### 3-Tier Execution Hierarchy
- **🟢 Tier 1 (Preferred):** Direct MCP tool calls (`pio_build`, `pio_upload`, `pio_clean`) — fastest path with structured diagnostics
- **🟡 Tier 2 (Self-Healing):** Detect-then-install pattern — check availability, ask user, install only if confirmed
- **🔴 Tier 3 (Fallback):** Shell wrapper scripts — 6 standalone scripts with warning about missing safety guardrails

### Safety Rules
- **Ask-before-flash:** Mandatory user confirmation before any upload/flash operation
- **Port discovery:** Run `pio device list` before recommending a port — never guess
- **Workspace boundaries:** Validate `platformio.ini` exists in project_dir
- **Error code reference:** All 9 error codes documented with meanings and codes

### Tool Parameter Reference
Complete parameter tables for all 3 MCP tools with types, optionality, defaults, descriptions, and return shapes.

### ESP32 Troubleshooting Quick-Reference
4 areas covered in table format:
1. Port & Connection Issues (USB drivers, DTR/RTS, cables, flash corruption)
2. Build & Compile Errors (compilation, memory overflow, partition tables)
3. ESP32 Runtime Issues (boot loops, Guru Meditation, watchdog, brownout)
4. Library & Platform (board definitions, conflicts, version mismatches, frameworks)

### Shell Fallback Reference
All 6 Tier 3 scripts documented with usage signatures and the underlying `pio` commands they invoke.

## Deviations from Plan

None — plan executed exactly as written.

## Auth Gates

None.

## Known Stubs

None — this is a documentation-only task with no runtime code.

## Threat Flags

None — the SKILL.md documents mitigations for T-01-01 through T-01-SC from the plan's threat model. No new threat surface introduced.

## Self-Check: PASSED

- ✅ `.agents/skills/pio-mcp-manager/SKILL.md` exists (231 lines, ≤ 500 limit)
- ✅ Valid YAML frontmatter with `name: "pio-mcp-manager"` and `description:`
- ✅ 3-tier hierarchy documented with emoji color coding
- ✅ All 6 shell scripts referenced (build.sh, upload.sh, clean.sh, monitor.sh, discover.sh, test.sh)
- ✅ Safety rules: ask-before-flash (6 confirm mentions), port discovery (4 pio device list mentions), workspace boundaries (9 platformio.ini mentions)
- ✅ All 9 error codes referenced by name
- ✅ All 4 troubleshooting areas covered (Port/Connection, Build/Compile, Runtime, Library/Platform)
- ✅ All 10 decisions (D-01 through D-10) reflected in content
- ✅ Commit exists: ab6e846
