# Phase 1: Agent Skills Layer - Discussion Log

**Date:** 2026-06-21
**Mode:** Interactive discuss-phase

## Areas Discussed

### 1. 3-tier Hierarchy Design

**Q1: Tier 1 (primary execution path)**
- Options: MCP tools primary / SKILL.md gate → MCP / Conditional routing
- **Decision:** MCP tools primary (recommended)
- Rationale: Fastest path when server is pre-installed. No additional gate overhead.

**Q2: Tier 2 (auto-install fallback)**
- Options: Auto-install on demand / Pre-install during setup / Detect-then-install
- **Decision:** Detect-then-install
- Rationale: Agent checks availability first, installs only if needed. Balances reliability with efficiency.

**Q3: Tier 3 (CLI fallback scope)**
- Options: Basic commands only / Extended commands / Single dispatcher script
- **Decision:** Extended commands
- Rationale: Covers all 6 command types (build, upload, clean, monitor, discover, test).

### 2. Safety Policy & Guardrails

**Q1: Flash/upload safety defaults**
- Options: Ask-before-flash / Auto-build ask-upload / All safe by default
- **Decision:** Ask-before-flash (recommended)
- Rationale: Most conservative approach. Build/clean are safe, flash/upload requires confirmation.

**Q2: Port discovery**
- Options: Agent must discover port / User-specified only / Auto-detect with fallback
- **Decision:** Agent must discover port (recommended)
- Rationale: Agent runs `pio device list` before recommending a port. No guessing.

**Q3: Workspace boundary enforcement**
- Options: Workspace boundary / No boundary warn / Project dir only
- **Decision:** Workspace boundary (recommended)
- Rationale: Validates project_dir contains platformio.ini. Only workspace/children accessible.

### 3. Fallback Shell Wrappers

**Q1: Script structure**
- Options: One script per command / Single dispatcher
- **Decision:** One script per command (recommended)
- Rationale: Independent scripts, easy to invoke, maintain, and test.

**Q2: Command scope**
- Selected: Build, Upload, Clean, Serial Monitor, Device Discovery, Test Runner
- **Decision:** All 6 commands included (extended scope)

### 4. Troubleshooting Reference Scope

**Q1: Troubleshooting areas**
- Selected: Port & Connection, Build & Compile, ESP32 Runtime, Library & Platform
- **Decision:** All 4 areas covered (comprehensive)

### 5. Skill Format

**Q1: File organization**
- Options: Single mega-skill file / Modular skills directory
- **Decision:** Single mega-skill file
- Rationale: Single source of truth, easier discovery.

## Canonical References Noted During Discussion
- None added beyond those from ROADMAP.md and codebase scout

## Deferred Ideas
- Multi-project support (Phase 4)
- Dashboard integration (Phase 4)
- HTTP transport for MCP server
- Hardware locking/queue management
