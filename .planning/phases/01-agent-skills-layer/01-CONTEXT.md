# Phase 1: Agent Skills Layer - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Create SKILL.md instruction layer that enables AI agents to safely interact with the pioarduino MCP server through a 3-tier execution hierarchy. This phase delivers:

- A comprehensive mega-skill SKILL.md covering the full 3-tier execution model
- Safety guidelines for agent interactions (port discovery, workspace boundaries, flash safety)
- Fallback shell wrapper scripts for when MCP isn't available (Tier 3 extended commands)
- ESP32 troubleshooting reference docs covering port/connection, build, runtime, and library issues

This phase is about **agent instructions and safety**, NOT about adding new MCP tools.
</domain>

<decisions>
## Implementation Decisions

### 3-Tier Execution Hierarchy
- **D-01:** Tier 1 (primary) — MCP tools are called directly by the agent. No SKILL.md gate required for Tier 1. Fastest path when server is pre-installed.
- **D-02:** Tier 2 (auto-install) — Detect-then-install pattern. SKILL.md instructs agent to check if MCP server is available first, then run `npx @pioarduino/mcp-server` or `npm install` if not. Not auto-install on every invocation — only when detection fails.
- **D-03:** Tier 3 (CLI fallback) — Extended shell wrapper commands covering: build.sh, upload.sh, clean.sh, monitor.sh, discover.sh, and test.sh. One script per command (standalone scripts), not a single dispatcher.

### Safety Policy & Guardrails
- **D-04:** Ask-before-flash default. Agent must ask user confirmation before any upload/flash operation. Build and clean operations are safe by default and require no confirmation.
- **D-05:** Agent must discover available serial ports via `pio device list` (or equivalent) before recommending a port. Agent should not guess or assume a port.
- **D-06:** Workspace boundary enforcement. Agent validates that project_dir contains platformio.ini. Only workspace and project children are accessible. No arbitrary path access.

### Fallback Shell Wrappers
- **D-07:** One standalone script per command. Each shell wrapper is an independent `.sh` file (build.sh, upload.sh, clean.sh, monitor.sh, discover.sh, test.sh). Easy to invoke, maintain, and test independently.
- **D-08:** Extended scope includes all 6 commands: Build, Upload, Clean, Serial Monitor, Device Discovery, and Test Runner.

### Troubleshooting Reference
- **D-09:** Comprehensive troubleshooting reference covering all 4 areas:
  - Port & Connection Issues (USB drivers, DTR/RTS overrides, cable problems, flash corruption recovery)
  - Build & Compile Errors (compilation errors, memory overflow, partition table issues, build failures)
  - ESP32 Runtime Issues (boot loops, crash dumps, Guru Meditation errors, watchdog timeouts)
  - Library & Platform (board definitions, library conflicts, platform version mismatches)

### Skill Format
- **D-10:** Single mega-skill file. One comprehensive SKILL.md covering all 3 tiers, safety guidelines, troubleshooting reference, and fallback wrappers. Single source of truth rather than modular skills directory.

### the agent's Discretion
- Exact file paths for shell wrappers (scripts/ vs tools/ vs bin/)
- Specific regex patterns for diagnostic parsing (already handled in Phase 0)
- Naming conventions for shell wrapper scripts beyond the .sh extension
- Whether troubleshooting docs live inline in SKILL.md or as separate reference files

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Configuration
- `.planning/ROADMAP.md` — Phase 1 goal, plan descriptions, and scope
- `.planning/REQUIREMENTS.md` — Phase 1 requirements (skills layer details)
- `.planning/PROJECT.md` — Project overview, technical context, architecture decisions

### Phase 0 Outputs (Dependencies)
- `src/server.js` — MCP server entry point (Phase 0, Tier 1 depends on this)
- `src/mcp/server.js` — MCP server implementation
- `src/mcp/tools/build.js` — Build tool implementation (Tier 3 wraps this)
- `src/mcp/tools/upload.js` — Upload tool implementation (Tier 3 wraps this)
- `src/mcp/tools/clean.js` — Clean tool implementation (Tier 3 wraps this)
- `src/mcp/errors.js` — Error taxonomy (Phase 0, safety rules reference this)
- `src/mcp/parsers.js` — Diagnostic parsers (Phase 0, troubleshooting references these)
- `src/mcp/metadata.js` — Build metadata extraction (Phase 0)
- `package.json` — Dependencies and scripts configuration
- `build.mjs` — esbuild configuration for bundling

### MCP SDK Reference
- No external MCP SDK specs referenced — agent uses @modelcontextprotocol/sdk ^1.12.1 patterns from Phase 0 implementation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 0 server code** (`src/server.js`, `src/mcp/`): Already implements stdio transport, tool registration, error taxonomy, diagnostic parsing. SKILL.md Tier 1 simply instructs agent to call these MCP tools.
- **`src/mcp/errors.js`**: Structured error codes (PROJECT_NOT_FOUND, ENV_NOT_FOUND, BUILD_FAILED, etc.) — SKILL.md safety guidelines should reference these for error handling expectations.
- **`src/mcp/parsers.js`**: GCC/Clang/linker/Python/CMake diagnostic parsers — troubleshooting reference can point to these as "what the MCP server understands."
- **`src/mcp/metadata.js`**: Duration, RAM/flash usage, binary size extraction — troubleshooting reference can reference expected metadata outputs.
- **`build.mjs`**: esbuild bundler config — shell wrappers may reference this for build invocation patterns.

### Established Patterns
- **Error handling**: Phase 0 uses structured error codes with validation helpers — SKILL.md should enforce same pattern for safety checks
- **Diagnostic parsing**: Regex-based extraction with deduplication — shell wrappers should produce same token-efficient output
- **Tool parameterization**: All Phase 0 tools accept optional project_dir, environment, verbose parameters — shell wrappers should mirror this interface
- **Bundle output**: esbuild produces single dist/server.js — Tier 2 auto-install expects this artifact

</code_context>

<specifics>
## Specific Ideas

- SKILL.md should be placed in `.agents/skills/` directory (consistent with competitor jl-codes/platformio-mcp pattern)
- Shell wrappers should live in `scripts/` or `bin/` directory for easy PATH inclusion
- The 3-tier hierarchy should be prominently documented at the top of SKILL.md so agents understand the execution flow immediately
- Troubleshooting reference should be structured as a quick-reference table format for fast agent scanning
- Safety guidelines should include concrete examples of what NOT to do (e.g., "don't flash without port confirmation")

</specifics>

<deferred>
## Deferred Ideas

- Multi-project support (Phase 4) — not relevant for skills layer
- Dashboard integration (Phase 4) — out of scope for this phase
- HTTP transport for MCP server — future consideration, not in current scope
- Hardware locking/queue management — extension-only feature, not standalone
</deferred>

---

*Phase: 01-agent-skills-layer*
*Context gathered: 2026-06-21 via discuss-phase*
