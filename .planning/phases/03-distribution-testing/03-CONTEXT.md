# Phase 3: Distribution & Testing - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Package the pioarduino MCP server for npm distribution (`@ZanDev32/pioneer`), set up CI/CD with GitHub Actions, build a Vitest test suite with hybrid unit/integration layout, and validate MCP server operation across Claude Desktop, Cursor, and VS Code through automated protocol compliance checks and milestone-gated manual host validation.

This phase delivers **distribution readiness and quality assurance** — not new MCP tools, not skills enhancements, not competitive features.
</domain>

<decisions>
## Implementation Decisions

### Package Naming & Publishing
- **D-01:** Package name: `@ZanDev32/pioneer` (scoped under user's personal npm org). Bin entry: `pioneer` (unchanged). This keeps the brand while gaining scoped namespace protection.
- **D-02:** First scoped publish at `0.2.0` — bumping minor from current `0.1.0` to signal the rename as a breaking change for consumers. Single release candidate: `0.2.0-rc.1` → `0.2.0`.
- **D-03:** Git tag trigger (`v*`) + CI publish. Pre-publish gates: `npm ci → npm run build → npm test`. Publish with `--provenance` for supply-chain attestation. `--access public` on first publish (scoped package requirement).
- **D-04:** `"files": ["dist/"]` already in package.json — keep the allowlist approach. No `.npmignore` needed.

### Versioning & Release Strategy
- **D-05:** Manual semver + Keep a Changelog (`CHANGELOG.md`). Zero tooling dependencies — `npm version patch/minor/major` creates git tag + commit. Full control over bump semantics.
- **D-06:** Pre-release strategy: single release candidate (`0.2.0-rc.1`) for MCP host validation before tagging `latest`. No full alpha→beta→rc ladder.

### Test Framework & Strategy
- **D-07:** **Vitest** — migrate from Jest 29. Native ESM support (no `--experimental-vm-modules` flag), esbuild transforms (same toolchain as `build.mjs`), Jest-compatible API (`describe`/`it`/`expect`). Faster CI startup, zero-config for `"type": "module"`.
- **D-08:** Write fresh tests targeting the standalone server's modules. Do NOT port the extension repo's 233 VS Code-centric tests — they test `vscode` module mocks irrelevant to this server.
- **D-09:** Mock `runPioCommand` at module boundary (`vi.mock('../utils.js')`) as single mock point for all 7 tool modules. Tests validate Zod schema enforcement, error wrapping, and response shaping without real CLI execution.
- **D-10:** Inline string fixtures for parser unit tests (PIO CLI output format is stable, samples ~50-200 chars). Shared fixture files in `test/fixtures/` only for integration layer (full build logs).
- **D-11:** Build priority: parsers → errors → utils → TaskManager → tool handlers. Parsers and errors are pure functions with no `child_process` dependency — fastest to write, highest confidence, most regex-heavy (highest bug risk).

### Test Structure & Organization
- **D-12:** Hybrid layout: `test/unit/` for pure functions (parsers, errors, metadata), `test/integration/` for tool handlers (mocked `runPioCommand`). Vitest workspaces allow different timeouts per subdirectory (`testTimeout: 2000` for unit, `testTimeout: 30000` for integration).
- **D-13:** Integration tests tagged `#e2e` when they require a real PlatformIO project and `pio` CLI. Existing `test/uat-sesaiotnode.mjs` demonstrates this pattern — keep as opt-in CI run.

### CI/CD Pipeline Design
- **D-14:** Single file GitHub Actions workflow (`ci.yml`) with tag trigger. Matrix: `ubuntu-latest`, `macos-latest`, `windows-latest` × Node 18, 20, 22 for build + unit tests. PlatformIO integration tests on `ubuntu-latest` only (Windows needs MSYS2 workarounds, macOS has slower toolchain downloads).
- **D-15:** PlatformIO installed via `actions/setup-python@v6` + `pip install platformio` (not the community `setup-platformio-action` which has low adoption).
- **D-16:** Caching: `setup-node` built-in `cache: 'npm'` for Node deps. `actions/cache@v4` for `~/.platformio/.cache` and `~/.cache/pip` with `runner.os`-prefixed keys.
- **D-17:** npm publish: trigger on `git tag v*`, run `npm ci && npm run build && npm test` as safety gate, then `npm publish --provenance`. Granular npm token (`Automation` type, bypasses 2FA) stored as `NPM_TOKEN` repository secret.

### MCP Host Integration Testing
- **D-18:** **MCP Inspector CLI** in CI for automated JSON-RPC protocol compliance — validates `tools/list` and `tools/call` for all 12 tools, works with stdio transport. Official MCP project (10.2k ★).
- **D-19:** **Config file template validation** — automated JSON validation of all 3 host config templates (Claude Desktop, Cursor, VS Code) to catch key name drift (`mcpServers` vs `servers`, `type` field presence differences).
- **D-20:** **Manual smoke test checklists** gated to milestone releases (v0.2.0, v1.0.0) for host-specific validation no automation can cover: config file placement, variable resolution (`PIO_WORKSPACE_ROOT`), startup behavior per host.

### the agent's Discretion
- Exact Vitest config file structure (`vitest.config.js` vs `vitest.workspace.js`)
- Specific test file naming convention under `test/unit/` and `test/integration/`
- Detailed GitHub Actions workflow YAML (job names, step ordering, badge URL)
- CHANGELOG.md format and initial content
- Whether to add `publishConfig.access: "public"` to package.json
- Token scope details for `NPM_TOKEN` (granular per-package)
- Exact mock setup boilerplate for `vi.mock` in tool handler tests
- Fixture file format and organization under `test/fixtures/`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Configuration
- `.planning/ROADMAP.md` — Phase 3 goal and plan descriptions (NPM package, Claude Desktop, Cursor, VS Code mcp.json, Test suite, CI/CD)
- `.planning/REQUIREMENTS.md` — Phase 3 requirements. NFR-2: portability across Linux/macOS/Windows. NFR-3: safety validation.
- `.planning/PROJECT.md` — Project overview, technical context, architecture decisions, distribution strategy

### Phase 0 Outputs (Core Server)
- `src/server.js` — MCP server entry point, tool registration, CLI arg parsing, HTTP + stdio transport
- `src/tools/build.js` — Build tool with `runPioCommand` helper pattern
- `src/tools/upload.js` — Upload tool
- `src/tools/clean.js` — Clean tool
- `src/tools/discover.js` — Board/device discovery tools
- `src/tools/monitor.js` — Serial monitor tools (start/stop/read)
- `src/tools/check.js` — Static analysis tool
- `src/tools/test.js` — Test runner tool
- `src/utils.js` — `runPioCommand` wrapper — the single mock seam for all tool handler tests
- `src/errors.js` — Error taxonomy (ERROR_CODES, validation helpers)
- `src/parsers.js` — GCC/Clang/linker/Python/CMake diagnostic parsers — regex-heavy, highest bug risk, test first
- `src/metadata.js` — Build metadata extraction (duration, RAM/flash, binary size)
- `src/tasks.js` — TaskManager for async build/upload with `pio_task_status` polling

### Phase 1 Outputs (Constraints)
- `.agents/skills/pio-mcp-manager/SKILL.md` — 3-tier execution hierarchy (MCP → Auto-install → CLI fallback). Tier 2 references `npx @ZanDev32/pioneer`.
- `scripts/build.sh`, `scripts/upload.sh`, `scripts/clean.sh`, `scripts/monitor.sh`, `scripts/discover.sh`, `scripts/test.sh` — Tier 3 fallback shell wrappers

### Phase 2 Outputs (Decisions)
- `.planning/phases/02-tool-expansion/02-CONTEXT.md` — D-02: No `serialport` npm library (keeps distribution clean). D-04: MCP notifications not sole progress mechanism.

### Build & Configuration
- `package.json` — Current version `0.1.0`, bin `pioneer`, files `["dist/"]`, dependencies: `@modelcontextprotocol/sdk` ^1.12.1 + `zod` ^3.23.8
- `build.mjs` — esbuild config: entry `src/server.js`, target `node18`, platform `node`, external: `['child_process', 'fs', 'path', 'os', 'crypto', 'net']`
- `tsconfig.json` — TypeScript config for type checking
- `README.md` — Installation and host configuration documentation (Claude Desktop, Cursor, VS Code)

### Existing Test
- `test/uat-sesaiotnode.mjs` — Manual UAT script against real PlatformIO project (`SesaIoTNode`, `KitchenGuard-V1` env). Demonstrates E2E test pattern. Keep as opt-in `#e2e` tagged test.

### MCP Ecosystem
- MCP Inspector (`@modelcontextprotocol/inspector`) — Official MCP project (10.2k ★). CLI mode for CI automation, UI mode for debugging.
- `@modelcontextprotocol/sdk` ^1.12.1 — MCP SDK used by the server. Reference for `StdioServerTransport`, `McpServer`, tool registration patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`runPioCommand` in `src/utils.js`**: Central PIO CLI executor — the single mock seam for all 7 tool modules. Mock at module boundary with `vi.mock('../utils.js')` in all integration tests.
- **`src/errors.js`**: Full error taxonomy — pure validation functions (`assertPioProject`, `assertEnvExists`, `assertWithinWorkspace`) are prime candidates for first unit tests.
- **`src/parsers.js`**: Regex-based diagnostic parsers — pure function inputs (CLI output strings) and outputs (diagnostic objects). Highest bug risk due to regex complexity — test first.
- **`src/metadata.js`**: Duration, RAM/flash, binary size extraction — pure string parsing, straightforward to test with inline fixtures.
- **`src/tasks.js`**: In-memory `Map`-based TaskManager — stateful module that benefits from isolated unit tests for lifecycle (create/update/cleanup/TTL eviction).

### Established Patterns
- **Tool registration**: `register*Tools(server, ctx)` pattern — each tool module exports a registration function. Tests can create a minimal `McpServer` instance and verify tool schemas.
- **`runPioCommand` contract**: Returns `{ stdout, stderr, combined }`. All tool handlers follow: Zod validation → `runPioCommand` → parse output → format response. Tests should verify each layer independently.
- **Bundle output**: esbuild produces single `dist/server.js` — CI should test the bundled output, not just source files.
- **Error handling**: Structured error codes returned as MCP tool results, not thrown exceptions. Tests should verify error code presence and shape.

### Integration Points
- **CI/CD**: Everything flows through `npm run build` (esbuild) and `npm test` (Vitest). CI workflow must replicate the dev environment: Node 18+, `npm ci`, `node build.mjs`.
- **npm publish**: `"files": ["dist/"]` in package.json means only `dist/` ships. `src/`, `test/`, `build.mjs`, `node_modules/` are excluded automatically.
- **Host configs**: Three distinct formats — Claude Desktop (`claude_desktop_config.json` with `mcpServers`), VS Code (`.vscode/mcp.json` with `servers` and `"type": "stdio"`), Cursor (`.cursor/mcp.json`, format closer to Claude Desktop but evolving).
</code_context>

<specifics>
## Specific References

### User's npm Org
- Package scoped to `@ZanDev32` — the user's personal npm organization. All `npx` and install commands use `@ZanDev32/pioneer`.

### Reference Project for E2E Tests
- `/home/zandev32/Documents/klaklik/SesaIoTNode` — Real PlatformIO project with `KitchenGuard-V1` environment. Used by existing UAT script. Suitable for tagged `#e2e` integration tests.

### Competitor
- `jl-codes/platformio-mcp` (36 stars) — validated disk-spooled serial monitoring, 3-tool monitor design. Distribution approach differs (they use `.agents/skills/` directory, not standalone MCP tools like pioneer).
</specifics>
