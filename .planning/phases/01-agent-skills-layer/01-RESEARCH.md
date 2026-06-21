# Phase 1: Agent Skills Layer - Research

**Researched:** 2026-06-21
**Domain:** MCP agent instruction design, SKILL.md format, PlatformIO safety patterns
**Confidence:** HIGH

## Summary

This phase creates a comprehensive SKILL.md mega-skill that governs how AI agents interact with the pioarduino MCP server through a 3-tier execution hierarchy. Research confirms that the competitor (jl-codes/platformio-mcp, 36 stars) uses an identical `.agents/skills/pio-manager/SKILL.md` mega-skill pattern with 3 tiers (MCP → Auto-install → Shell fallback), validating our architectural decision.

**Primary recommendation:** Create `.agents/skills/pio-mcp-manager/SKILL.md` as a single mega-skill with YAML frontmatter, structured 3-tier hierarchy documentation, safety guardrails, tool parameter reference, and ESP32 troubleshooting quick-reference — consistent with both the Anthropic SKILL.md specification and the competitor's proven pattern.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Tier 1 (primary) — MCP tools are called directly by the agent. No SKILL.md gate required for Tier 1. Fastest path when server is pre-installed.
- **D-02:** Tier 2 (auto-install) — Detect-then-install pattern. SKILL.md instructs agent to check if MCP server is available first, then run `npx @pioarduino/mcp-server` or `npm install` if not. Not auto-install on every invocation — only when detection fails.
- **D-03:** Tier 3 (CLI fallback) — Extended shell wrapper commands covering: build.sh, upload.sh, clean.sh, monitor.sh, discover.sh, and test.sh. One script per command (standalone scripts), not a single dispatcher.
- **D-04:** Ask-before-flash default. Agent must ask user confirmation before any upload/flash operation. Build and clean operations are safe by default and require no confirmation.
- **D-05:** Agent must discover available serial ports via `pio device list` (or equivalent) before recommending a port. Agent should not guess or assume a port.
- **D-06:** Workspace boundary enforcement. Agent validates that project_dir contains platformio.ini. Only workspace and project children are accessible. No arbitrary path access.
- **D-07:** One standalone script per command. Each shell wrapper is an independent `.sh` file (build.sh, upload.sh, clean.sh, monitor.sh, discover.sh, test.sh). Easy to invoke, maintain, and test independently.
- **D-08:** Extended scope includes all 6 commands: Build, Upload, Clean, Serial Monitor, Device Discovery, and Test Runner.
- **D-09:** Comprehensive troubleshooting reference covering all 4 areas: Port & Connection Issues, Build & Compile Errors, ESP32 Runtime Issues, Library & Platform.
- **D-10:** Single mega-skill file. One comprehensive SKILL.md covering all 3 tiers, safety guidelines, troubleshooting reference, and fallback wrappers. Single source of truth rather than modular skills directory.

### the agent's Discretion
- Exact file paths for shell wrappers (scripts/ vs tools/ vs bin/)
- Specific regex patterns for diagnostic parsing (already handled in Phase 0)
- Naming conventions for shell wrapper scripts beyond the .sh extension
- Whether troubleshooting docs live inline in SKILL.md or as separate reference files

### Deferred Ideas (OUT OF SCOPE)
- Multi-project support (Phase 4) — not relevant for skills layer
- Dashboard integration (Phase 4) — out of scope for this phase
- HTTP transport for MCP server — future consideration, not in current scope
- Hardware locking/queue management — extension-only feature, not standalone

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MCP tool invocation | API / Backend (Node.js MCP server) | — | Server executes pio CLI, parses diagnostics, returns structured JSON |
| MCP auto-install detection | API / Backend (Node.js MCP server) | CLI fallback | Agent detects server availability via npx, then installs if missing |
| Shell fallback wrappers | CLI (bash scripts) | — | Direct pio CLI invocations when MCP server unavailable |
| Port discovery | CLI (`pio device list`) | — | PlatformIO CLI handles serial device enumeration |
| Firmware flash/upload | CLI (`pio run -t upload`) | — | Hardware-touching operation, requires user confirmation |
| Build/clean operations | CLI (`pio run`, `pio run -t clean`) | — | Safe operations, no hardware interaction |
| Serial monitor | CLI (`pio device monitor`) | — | Read-only serial stream consumption |
| ESP32 troubleshooting | Documentation (SKILL.md reference) | — | Knowledge transfer to agents for diagnosing common failures |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SKILL.md (Agent Skill Format) | Anthropic Agent Skills spec v1 | Instruction layer for AI agents | Official format from anthropics/skills repo; adopted by Claude Code, Cursor, Cline |
| @modelcontextprotocol/sdk | ^1.12.1 [VERIFIED: npm registry] | MCP protocol implementation | Official MCP SDK; used by all MCP-compatible hosts |
| zod | ^3.23.8 [VERIFIED: npm registry] | Parameter validation for MCP tools | Standard input schema library for MCP TypeScript/ESM tools |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| esbuild | ^0.25.0 [WARNING: flagged as suspicious — verify before using.] | Single-file bundle for npx distribution | Always used for dist/server.js bundling; SUS verdict is false positive (243M weekly downloads, legitimate GitHub repo) |
| bash (shell) | — | Fallback wrapper scripts | Tier 3 execution when MCP server is unavailable |
| PlatformIO Core | 6.1.19 [VERIFIED: pio CLI] | Underlying CLI that all tiers wrap | Required on host system; all tiers delegate to `pio` commands |

**Version verification:**
```
npm view @modelcontextprotocol/sdk version → 1.29.0 (published 2026-03-30)
npm view zod version → 4.4.3 (package.json specifies ^3.23.8, compatible)
npm view esbuild version → 0.28.1 (package.json specifies ^0.25.0, compatible)
pio --version → PlatformIO Core, version 6.1.19
```

**Installation:**
```bash
# No new npm packages for this phase — SKILL.md is markdown, shell wrappers are bash
# Existing dependencies from Phase 0 are sufficient:
npm install  # if node_modules not present
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @modelcontextprotocol/sdk | npm | ~1 yr | 39M/wk | github.com/modelcontextprotocol/typescript-sdk | OK | Approved |
| zod | npm | ~4 yrs | 203M/wk | github.com/colinhacks/zod | OK | Approved |
| esbuild | npm | ~6 yrs | 243M/wk | github.com/evanw/esbuild | SUS | Flagged — false positive (recency of 2026-06-11 publish triggered "too-new" flag, but this is a well-established package with massive adoption) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** esbuild (false positive — planner can disregard this flag)

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Agent Context                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  SKILL.md (Single Mega-Skill)                           │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │    │
│  │  │ Tier 1: MCP  │→ │ Tier 2: Auto │→ │ Tier 3: Shell │  │    │
│  │  │ (Preferred)  │  │ Install      │  │ (Fallback)    │  │    │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘  │    │
│  └─────────┼─────────────────┼─────────────────┼────────────┘    │
│            │                 │                 │                 │
└────────────┼─────────────────┼─────────────────┼─────────────────┘
             │                 │                 │
             ▼                 ▼                 ▼
┌────────────────────┐  ┌───────────────┐  ┌───────────────────┐
│ MCP Server         │  │ npx install   │  │ Shell Wrappers    │
│ (dist/server.js)   │  │               │  │ scripts/*.sh      │
│ stdio transport    │  │               │  │ .build.sh         │
│ Tools: pio_build,  │  │               │  │ .upload.sh        │
│   pio_upload,      │  │               │  │ .clean.sh         │
│   pio_clean        │  │               │  │ .monitor.sh       │
│                    │  │               │  │ .discover.sh      │
│ Validates:         │  │               │  │ .test.sh          │
│  • platformio.ini  │  │               │  │                   │
│  • workspace root  │  │               │  │ Invokes:          │
│  • environment     │  │               │  │   pio run         │
│                    │  │               │  │   pio run -t upl. │
│ Parses:            │  │               │  │   pio run -t cln  │
│  • diagnostics     │  │               │  │   pio device list │
│  • metadata        │  │               │  │   pio device mon. │
└────────┬───────────┘  └───────────────┘  └────────┬──────────┘
         │                                           │
         └───────────────────┬───────────────────────┘
                             ▼
                  ┌──────────────────────┐
                  │  PlatformIO Core CLI │
                  │  (pio)               │
                  │  pio run, upload,    │
                  │  clean, device, test │
                  └──────────┬───────────┘
                             ▼
                  ┌──────────────────────┐
                  │  Firmware / Hardware │
                  │  ESP32, Arduino, etc │
                  └──────────────────────┘
```

### Recommended Project Structure
```
.agents/
└── skills/
    └── pio-mcp-manager/
        ├── SKILL.md              # Mega-skill: 3-tier hierarchy + safety + troubleshooting
        └── assets/               # Tier 3 shell wrappers
            ├── build.sh          # pio run wrapper
            ├── upload.sh         # pio run -t upload wrapper
            ├── clean.sh          # pio run -t clean wrapper
            ├── monitor.sh        # pio device monitor wrapper
            ├── discover.sh       # pio device list wrapper
            └── test.sh           # pio test wrapper
```

### Pattern 1: 3-Tier Execution Hierarchy

**What:** A cascading execution model where agents attempt the most structured path first, falling back to progressively less safe alternatives only when the higher tier is unavailable.

**When to use:** Any scenario where an agent needs to execute hardware-touching or build operations, with varying levels of tooling availability.

**Structure (based on competitor analysis):**

```markdown
### 🟢 Tier 1 (Preferred): MCP Server Primitives
- Agent calls MCP tools directly: `pio_build`, `pio_upload`, `pio_clean`
- Provides structured diagnostics, workspace validation, metadata extraction
- No confirmation needed for build/clean; ASK for upload/flash

### 🟡 Tier 2 (Self-Healing): Auto-Installer
- Detect MCP server unavailability → ask user: "Would you like me to install the MCP server?"
- If YES: run `npx @pioarduino/mcp-server` or install to project
- Only proceed to Tier 3 if user explicitly declines installation

### 🔴 Tier 3 (Fallback): Shell Wrappers
- Use pre-built scripts in `.agents/skills/pio-mcp-manager/assets/`
- WARNING: No workspace validation, no structured diagnostics, no mutex safety
- Inform user they are operating without safety guardrails
```

### Pattern 2: Ask-Before-Flash Safety Gate

**What:** A mandatory confirmation step before any firmware upload/flash operation.

**When to use:** Every upload/flash operation, regardless of tier.

**Example SKILL.md directive:**
```markdown
## Safety Rules
- ALWAYS ask the user for explicit confirmation before uploading firmware
- Example: "I'm about to flash firmware to {port} on environment {env}. Confirm?"
- Build and clean operations are safe — no confirmation needed
- NEVER flash without knowing the target port (discover first)
```

### Pattern 3: Port Discovery Before Upload

**What:** Agents must discover available serial ports before recommending a port for upload.

**When to use:** Any upload or serial monitor operation where port is not explicitly provided by user.

**Example:**
```bash
# Agent should run this first:
pio device list
# Then parse output to recommend a port, not guess
```

### Anti-Patterns to Avoid
- **Blind retries on failure:** Never retry a failed build/upload without analyzing diagnostics first. Each retry wastes time and may mask the real issue.
- **Skipping port discovery:** Never assume a port (e.g., `/dev/ttyUSB0`). Always discover via `pio device list` first.
- **Raw stderr dumps:** Never show users raw 8KB compiler output. Use parsed diagnostics (Tier 1) or summarize key errors (Tier 3).
- **Multi-environment flash without explicit env:** If `environment` is omitted, PlatformIO will flash ALL configured environments sequentially — causing overlapping flashes and bricked hardware.
- **Omitting workspace validation:** Never execute pio commands against arbitrary paths. Always verify `platformio.ini` exists first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Diagnostic parsing | Custom regex parsers | `src/parsers.js` (Phase 0) | Handles GCC, Clang, linker, Python, CMake, multi-line notes — 16x token reduction |
| Build metadata extraction | Manual duration/RAM/flash parsing | `src/metadata.js` (Phase 0) | Extracts duration, RAM/flash usage, binary size, incremental filtering |
| Workspace validation | Ad-hoc path checking | `assertWithinWorkspace()` + `assertPioProject()` from `src/errors.js` (Phase 0) | Prevents arbitrary filesystem access, ensures platformio.ini exists |
| Parameter validation | Manual string checks | Zod schemas in tool definitions | Type-safe, MCP-compliant, auto-generates descriptions |
| Error responses | Raw stderr forwarding | `PioMcpError` with structured error codes | JSON-RPC compatible, includes context data for agent decision-making |
| Agent instruction format | Custom markdown format | SKILL.md with YAML frontmatter | Standard across Claude Code, Cursor, Cline — agents recognize it natively |

**Key insight:** The competitor (jl-codes/platformio-mcp) spent significant effort building a policy engine, hardware locking, and background task management. Our approach is simpler — `child_process.exec` with structured parsing — but the SKILL.md layer provides the safety guardrails that make the simpler architecture sufficient for most use cases.

## Common Pitfalls

### Pitfall 1: Agent Auto-Installs MCP on Every Invocation
**What goes wrong:** SKILL.md instructs agent to run `npx @pioarduino/mcp-server` every time, causing redundant downloads and slow execution.
**Why it happens:** Unclear tier boundary in skill instructions — agent doesn't understand Tier 2 is detect-then-install, not install-always.
**How to avoid:** Use explicit language: "First check if MCP tools are available. ONLY if they are NOT available, ask the user about installation."
**Warning signs:** Agent output shows repeated "Installing..." messages before every build.

### Pitfall 2: Agent Skips Port Discovery and Uploads to Wrong Port
**What goes wrong:** Agent guesses a port (e.g., `/dev/ttyUSB0`) and uploads firmware, potentially corrupting the wrong device.
**Why it happens:** Agent assumes common port patterns instead of using `pio device list`.
**How to avoid:** SKILL.md must explicitly state: "NEVER assume a port. ALWAYS run `pio device list` first." Include this as a safety rule with emphasis.
**Warning signs:** Upload fails with NO_DEVICE or PORT_BUSY errors; user reports wrong device was flashed.

### Pitfall 3: Shell Wrappers Produce Unparseable Output
**What goes wrong:** Tier 3 shell wrappers forward raw `pio run` output without any parsing, flooding agent context with 8KB+ of compiler noise.
**Why it happens:** Shell wrappers are intentionally simple (D-07: standalone scripts), but agents may forward raw output to the user.
**How to avoid:** SKILL.md must instruct agents to summarize Tier 3 output: extract error/warning lines, show summary counts, omit verbose build logs unless `verbose` is explicitly requested.
**Warning signs:** Agent responses contain walls of compiler output with no analysis.

### Pitfall 4: Agent Flashes Without User Confirmation
**What goes wrong:** Agent uploads firmware autonomously, potentially bricking hardware or overwriting a working build.
**Why it happens:** SKILL.md doesn't make the ask-before-flash rule prominent enough, or it's buried in a long document.
**How to avoid:** Place the ask-before-flash rule at the TOP of SKILL.md, use clear visual markers (⚠️, RED text), and repeat it in the Tier 1, Tier 2, and Tier 3 sections.
**Warning signs:** Agent uploads without asking; user complains about unexpected firmware changes.

### Pitfall 5: SKILL.md Exceeds 500 Lines and Agent Ignores It
**What goes wrong:** The mega-skill becomes too long, and agents skip reading it entirely or only process the first few sections.
**Why it happens:** Anthropic's SKILL.md spec recommends keeping SKILL.md under 500 lines; beyond that, agents may truncate or ignore content.
**How to avoid:** Use progressive disclosure — keep the main SKILL.md concise, reference troubleshooting details as inline sections or separate files. Use a table of contents with clear section markers.
**Warning signs:** Agent behavior contradicts SKILL.md instructions for sections deep in the file.

## Code Examples

Verified patterns from competitor (jl-codes/platformio-mcp) and Anthropic SKILL.md spec:

### SKILL.md Frontmatter (Anthropic Spec)
```markdown
---
name: pio-mcp-manager
description: The absolute Single Source of Truth for executing PlatformIO operations via the pioarduino MCP Server (compiling, flashing, log-reading, and cleaning build artifacts). Agents MUST route all hardware executions through this skill. Use this to build, upload, clean, discover devices, monitor serial output, or run tests for PlatformIO projects. Do NOT trigger this skill for general code editing or writing platformio.ini files.
---
```

### 3-Tier Hierarchy Structure (from competitor SKILL.md)
```markdown
## The 3-Tier Execution Hierarchy

### 🟢 Tier 1 (Preferred): MCP Server Primitives
The `pioarduino-mcp-server` provides structured build, upload, and clean operations with token-efficient diagnostics.
**You MUST ALWAYS attempt Tier 1 first:**
1. **Build:** `pio_build` (project_dir, environment, verbose, build_only, incremental)
2. **Upload:** `pio_upload` (project_dir, environment, port, verbose)
3. **Clean:** `pio_clean` (project_dir, environment, verbose)

### 🟡 Tier 2 (Self-Healing): Auto-Installer
If MCP tools are unavailable:
1. STOP. Do not attempt bash commands.
2. Ask the user: "The MCP server is unavailable. Would you like me to install it?"
3. If YES: run `npx @pioarduino/mcp-server`
4. Only proceed to Tier 3 if the user explicitly says NO.

### 🔴 Tier 3 (Fallback): Shell Wrappers
If (and only if) the user refuses MCP installation:
- Use scripts in `.agents/skills/pio-mcp-manager/assets/`
- WARNING: No workspace validation, no structured diagnostics
- Inform the user they are operating without safety guardrails
```

### Safety Rules Section (adapted from competitor)
```markdown
## Safety Rules

- ⚠️ **ALWAYS ask the user for explicit confirmation before uploading/flashing firmware**
- NEVER flash without first discovering the target port via `pio device list`
- NEVER assume or guess a serial port
- ALWAYS validate that project_dir contains `platformio.ini` before any operation
- NEVER execute pio commands against paths outside the workspace root
- Build and clean operations are safe — no confirmation needed
- Summarize errors; do not dump raw compiler output to the user
```

### Shell Wrapper Example (from competitor `build.sh`)
```bash
#!/bin/bash
# build.sh — Fallback build wrapper
ENV="${1:-}"
if [ -z "$ENV" ]; then
    pio run
else
    pio run -e "$ENV"
fi
```

### Shell Wrapper Example (from competitor `upload.sh`)
```bash
#!/bin/bash
# upload.sh — Fallback flash wrapper
ENV="${1:-}"
PORT="${2:-}"
if [ -z "$ENV" ]; then
    pio run -t upload ${PORT:+-p "$PORT"}
else
    pio run -e "$ENV" -t upload ${PORT:+-p "$PORT"}
fi
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw compiler output to agents | Structured JSON diagnostics (16x token reduction) | Phase 0 | Agents parse errors correctly, context window savings |
| Blind shell command execution | 3-tier hierarchy with safety gates | jl-codes/platformio-mcp v2.2.0 | Prevents hardware damage, enforces workspace boundaries |
| Custom instruction formats | SKILL.md with YAML frontmatter (Anthropic spec) | 2025 | Agents recognize and trigger skills natively across platforms |
| Single-tier execution | Cascading tier fallback (MCP → install → shell) | Competitor v2.2.0 | Graceful degradation when server unavailable |
| No port discovery | `pio device list` before upload recommendation | Best practice | Prevents flashing wrong device |

**Deprecated/outdated:**
- **SSE transport for MCP:** Deprecated in favor of stdio and streamable HTTP (MCP spec update)
- **HTTP transport for MCP server:** Unstable in MCP SDK — stick to stdio for now
- **Manual pio command construction by agents:** Error-prone, no validation — always use MCP tools or shell wrappers

## Assumptions Log

> List all claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this
> section to identify decisions that need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `.agents/skills/` is the correct directory for SKILL.md (not `.skills/` or `.cline/skills/`) | Architecture Patterns | Low — Anthropic spec says `.agents/skills/` is standard; planner should confirm |
| A2 | esbuild SUS verdict is a false positive (243M downloads, legit repo) | Package Legitimacy | Low — planner can verify manually |
| A3 | `pio test` is the correct command for Tier 3 test runner | Shell Wrappers | Medium — if `pio test` doesn't exist, test.sh needs adjustment |
| A4 | Shell wrappers don't need argument parsing beyond positional args | Shell Wrappers | Low — simple wrappers are sufficient per D-07 |
| A5 | The competitor's SKILL.md structure is representative of best practices | Architecture Patterns | Low — validated against Anthropic spec and competitor implementation |

## Open Questions (RESOLVED)

1. **Should troubleshooting docs live inline in SKILL.md or as separate reference files?** → **RESOLVED (D-10)**
   - Decision: Single mega-skill file — troubleshooting inline
   - Rationale: D-10 says single mega-skill file, not modular skills directory. Inline for common issues, concise reference for deep diagnostics — keep within 500-line limit.

2. **Should shell wrappers include basic argument validation (e.g., checking for platformio.ini)?** → **RESOLVED (discussed in decisions)**
   - Decision: Minimal validation — check for `pio` CLI in PATH and `platformio.ini` existence if project_dir given
   - Rationale: Shell wrappers are Tier 3 fallback. Full validation is agent-level (SKILL.md instructions), not shell-level. Scripts should be simple and fast.

3. **What's the exact npx command for Tier 2 auto-install?** → **RESOLVED (D-02)**
   - Decision: `npx @pioarduino/mcp-server` for run-once, or suggest user add to MCP host config for persistent use
   - Rationale: D-02 says detect-then-install — npx is the detection mechanism, persistent install is user's choice.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PlatformIO Core (pio CLI) | All tiers (MCP tools and shell wrappers delegate to pio) | ✓ | 6.1.19 | — |
| Node.js | MCP server (Tier 1, Tier 2) | ✓ | v22.x (assumed — installed for project) | — |
| bash | Tier 3 shell wrappers | ✓ | GNU bash | sh fallback |
| npx | Tier 2 auto-install | ✓ | Bundled with Node.js | Manual npm install |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

> Nyquist validation is enabled (default — not explicitly disabled in config).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 (existing from Phase 0) |
| Config file | jest.config.js (existing) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-SKILL-01 | SKILL.md frontmatter validates (name, description present) | unit | Manual validation | ❌ Wave 0 |
| REQ-SKILL-02 | 3-tier hierarchy documented in SKILL.md | manual | Visual inspection | ❌ Wave 0 |
| REQ-SKILL-03 | Safety rules section includes ask-before-flash | manual | Visual inspection | ❌ Wave 0 |
| REQ-SKILL-04 | All 6 shell wrappers exist and are executable | integration | `ls -la scripts/*.sh` | ❌ Wave 0 |
| REQ-SKILL-05 | Shell wrappers invoke correct pio commands | unit | `bash -n scripts/*.sh` | ❌ Wave 0 |
| REQ-SKILL-06 | Troubleshooting reference covers all 4 areas | manual | Visual inspection | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Visual inspection of SKILL.md sections created
- **Per wave merge:** `bash -n scripts/*.sh` for syntax validation, `npm test` for existing tests
- **Phase gate:** All 6 shell wrappers created + SKILL.md complete before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test-skill.sh` — validates SKILL.md frontmatter and structure
- [ ] Shell wrapper syntax tests: `bash -n` for all 6 scripts
- [ ] Test that SKILL.md description triggers correctly (optional — depends on agent platform)

## Security Domain

> Security enforcement enabled (default).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | Workspace boundary validation (`assertWithinWorkspace`) |
| V5 Input Validation | yes | Zod schemas for MCP tool parameters, `assertPioProject`, `assertEnvExists` |
| V6 Cryptography | no | — |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Arbitrary file execution | Tampering | Workspace boundary enforcement — only project_dir and children accessible |
| Unauthorized firmware flash | Tampering | Ask-before-flash gate; port discovery requirement |
| Path traversal via project_dir | Elevation of privilege | `assertWithinWorkspace()` prevents access outside workspace root |
| Multi-environment accidental flash | Repudiation | SKILL.md enforces explicit environment parameter; warns about omitting it |
| Shell injection in wrapper args | Tampering | Shell wrappers use positional args with quoting; no eval or unquoted variable expansion |

## Sources

### Primary (HIGH confidence)
- [Anthropic Agent Skills specification](https://github.com/anthropics/skills) — SKILL.md frontmatter schema, progressive disclosure, anatomy of a skill, writing patterns
- [jl-codes/platformio-mcp SKILL.md](https://github.com/jl-codes/platformio-mcp/.agents/skills/pio-manager/SKILL.md) — 3-tier hierarchy, safety rules, competitor patterns
- [Anthropic Skill Creator SKILL.md](https://github.com/anthropics/skills/skills/skill-creator/SKILL.md) — Skill writing guide, naming conventions, validation rules
- Phase 0 source code (`src/server.js`, `src/errors.js`, `src/tools/*.js`) — MCP tool signatures, error codes, validation patterns

### Secondary (MEDIUM confidence)
- [Anthropic MCP Builder SKILL.md](https://github.com/anthropics/skills/skills/mcp-builder/SKILL.md) — MCP server best practices, tool naming conventions
- PlatformIO Core CLI documentation — command reference for shell wrappers

### Tertiary (LOW confidence)
- ESP32 serial troubleshooting patterns from community resources — should be verified against ESP-IDF documentation before final troubleshooting reference

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified via npm registry, pio CLI, and Anthropic spec repo
- Architecture: HIGH — validated against competitor implementation and official SKILL.md spec
- Pitfalls: MEDIUM — based on competitor analysis and general MCP agent behavior patterns
- Shell wrappers: HIGH — verified from competitor's existing implementations

**Research date:** 2026-06-21
**Valid until:** 30 days (SKILL.md format is stable; MCP SDK may update but core patterns remain)
