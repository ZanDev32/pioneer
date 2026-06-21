# pioarduino MCP Server

## Overview
Standalone MCP (Model Context Protocol) server for PlatformIO/pioarduino embedded firmware projects. Enables AI agents to build, upload, and clean firmware through structured tools with token-efficient diagnostic parsing.

## Problem It Solves
PlatformIO projects require command-line expertise for build/upload/clean operations. AI agents can execute shell commands but lack structured feedback, token efficiency, and safety guardrails. This MCP server provides:
1. **Structured diagnostics** — 16x token reduction vs raw compiler output
2. **Token efficiency** — Parsed warnings/errors as JSON, not 8KB raw logs
3. **Safety guardrails** — Environment validation, workspace boundary checks
4. **Universal portability** — Works with any MCP-compatible AI host (Claude Desktop, Cursor, VS Code, Codex)

## Technical Context
- **Runtime:** Node.js 18+ (ESM)
- **MCP SDK:** @modelcontextprotocol/sdk ^1.12.1 (latest, ahead of competitor's ^0.5.0)
- **Execution:** `child_process.exec` for `pio run` commands (standalone, no vscode API dependency)
- **Bundle:** esbuild single-file output for `npx` distribution
- **Diagnostic parsing:** Regex-based GCC/Clang warning/error extraction
- **Competitor:** jl-codes/platformio-mcp (36 stars, v2.2.x, standalone + .agents/skills)

## Architecture Decision: Hybrid MCP + Skills
Phase 0: Standalone MCP server (this project)
Phase 1: Agent skills (SKILL.md instruction layer)
Phase 2: Tool expansion (board discovery, serial monitor, library management)

### What Makes This Different
- Latest MCP SDK vs competitor's outdated version
- 16x token-efficient diagnostic parsing (competitor has no mention)
- Universal standalone execution (not VS Code locked)
- Simpler architecture: `child_process.exec` vs competitor's complex server-side locking

## Target Users
- AI agents that need to interact with PlatformIO firmware projects
- Developers using Claude Desktop, Cursor, VS Code Copilot with embedded firmware
- CI/CD pipelines needing programmatic PIO control

## Key Constraints
- Must work without VS Code context (fully standalone)
- PlatformIO Core (`pio` CLI) must be installed on the host system
- No access to `pioarduino-node-helpers` (internal to VS Code extension)
- No HTTP transport (MCP SDK HTTP module not stable yet)

## Distribution Strategy
- npm package: `@pioarduino/mcp-server`
- Skills: `.agents/skills/` directory for agent discovery
- Fallback: Shell wrappers for when MCP isn't available (Tier 3)
