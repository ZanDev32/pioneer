# Phase 3: Distribution & Testing - Context

**Gathered:** 2026-06-24
**Updated:** 2026-11-09 — added D-21..D-29 (verification depth, release flow, install paths, MCP SDK generation) after the first plan set was verified
**Status:** Ready for planning

<domain>
## Phase Boundary

Package the pioarduino MCP server for npm distribution (`@ZanDev32/pioneer`), set up CI/CD with GitHub Actions, build a Vitest test suite with hybrid unit/integration layout, and validate MCP server operation across Claude Desktop, Cursor, and VS Code through automated protocol compliance checks and milestone-gated manual host validation.

This phase delivers **distribution readiness and quality assurance** — not new MCP tools, not skills enhancements, not competitive features.
</domain>

<decisions>
## Implementation Decisions

### Package Naming & Publishing
- **D-01:** Package name: `@zandev32/pioneer` (scoped under user's personal npm org). Bin entry: `pioneer` (unchanged). This keeps the brand while gaining scoped namespace protection. **Amended 2026-11-09 (D-01a):** originally `@ZanDev32/pioneer`, but npm's validator returns `validForNewPackages: false` — `"name can no longer contain capital letters"` — so the scope must be lowercase. Confirmed free on the registry (404). Unscoped `pioneer` is taken (0.11.7).
- **D-02:** First scoped publish at `0.2.0` — bumping minor from current `0.1.0` to signal the rename as a breaking change for consumers. Single release candidate: `0.2.0-rc.1` → `0.2.0`.
- **D-03:** Git tag trigger (`v*`) + CI publish. Pre-publish gates: `npm ci → npm run build → npm test`. Publish with `--provenance` for supply-chain attestation. `--access public` on first publish (scoped package requirement). **Amended 2026-11-09 (D-03a):** `--provenance` requires `repository.url` to name a public repo the publisher controls; the clone currently has no git remote and `package.json` points at `pioarduino/pioarduino-vscode-ide`. Phase 3 creates the public repo `github.com/ZanDev32/pioneer`, sets it as `origin`, and updates `repository.url` before the first publish.
- **D-04:** `"files": ["dist/"]` allowlist approach — no `.npmignore`. **Corrected 2026-11-09 (D-04a):** the field is *missing* from `package.json` today (`npm pack --dry-run` ships 60 files: `src/`, `.planning/`, `.agents/`), so Phase 3 must add it rather than merely keep it.

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

### MCP SDK Generation (discussed 2026-11-09)
- **D-28:** 0.2.0 ships on the **v1 SDK line**: pin `@modelcontextprotocol/sdk` to `^1.32.2` (verified: 1.29.0 locked today, 1.32.2 is the newest 1.x, and every 1.x caps at `LATEST_PROTOCOL_VERSION = '2025-11-25'`), rename the 12 `server.tool(...)` registrations to `server.registerTool(...)` (all `tool()` overloads are `@deprecated` in the installed SDK), and make the protocol lane assert the negotiated `protocolVersion === '2025-11-25'` rather than accepting whatever the server returns. — **Reversibility:** costly — the pin is cheap, but undoing the `registerTool` rename plus a later major-version move touches all 12 tool modules and the protocol lane.
- **D-29:** Do **not** adopt `@modelcontextprotocol/server@2.x` (the `2026-07-28` stateless spec, package renamed and GA 2026-07-27) in Phase 3. Deferred to its own phase because the stateless core's value is remote/HTTP hosting (Workers, Durable Objects) while `pioneer` is a local stdio server, and v2 keeps 1.x client interop so 0.2.0 loses no host compatibility. Trigger to schedule it: before 1.0.0, or as soon as a target host requires a 2026-07-28 feature. — **Reversibility:** one-way for the published contract — once 0.2.0 advertises 2025-11-25, adding a 2026-07-28 protocol means a new release with its own attestation, and the version number cannot be republished.

### Verification Depth & Release Flow (discussed 2026-11-09)
- **D-21:** CI OS lane depth — `ubuntu-latest` runs the full suite; `windows-latest` and `macos-latest` run `npm run test:unit` only. Matches D-14's stated intent and stops a POSIX-only regression from turning an OS red that can never support the monitor tool. — **Reversibility:** reversible — one matrix cell plus one script in `ci.yml`.
- **D-22:** POSIX-only serial monitor gets an explicit platform guard: on `win32`, `pio_serial_start` rejects with a `PioMcpError` naming the platform constraint and the supported alternative, and a unit test asserts that error. Windows users see a real message instead of a raw spawn `ENOENT`.
- **D-23:** CI enforces a coverage floor of **80 statements / 70 branches / 80 functions / 80 lines** (global, `src/`). Raised from 70/60/70/70 on purpose: the phase writes the whole test suite, so the floor is set once and is priced into the plan. — **Reversibility:** reversible — a `thresholds` object in `vitest.config.js`.
- **D-24:** Additional per-file floor: `src/parsers.js` ≥ **85% lines**. It is the regex-heavy module where a silent regression yields wrong diagnostics rather than a crash; a globally well-covered `errors.js` must not mask it.
- **D-25:** `npm test` = `vitest run` over **unit + integration only** (no build step). The protocol lane is `npm run test:protocol` (build + stdio `tools/list`/`tools/call`), invoked by CI and by its own plan's verify. Coverage is measured from unit + integration only; protocol tests exercise the bundle, not source, and would double-count.
- **D-26:** Release flow — `latest` is set by publishing a fresh **`0.2.0`** through the same pipeline (new build, own provenance attestation), never by moving a dist-tag onto `0.2.0-rc.1`. Publish triggers on a pushed `v*` tag only (`workflow_dispatch` is not a publishing path). The dist-tag is derived from semver: versions containing `-` publish with `--tag next`, plain versions publish as `latest`, so a typo cannot push a prerelease to `latest`. — **Reversibility:** one-way — a published version number and its `latest` pointer are externally visible and cannot be unpublished without breaking consumer installs.
- **D-27:** Install paths documented and verified, `npx` first: (1) `npx @zandev32/pioneer` — zero-install; (2) `npm i -g @zandev32/pioneer` then `pioneer`; (3) clone + `npm ci && npm run build` for contributors. Host config fixtures use `command: "npx"` with `args: ["-y", "@zandev32/pioneer"]`, and a unit test asserts the README documents all three paths and that the fixtures carry that same arg shape.

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
- Package scoped to `@zandev32` — the user's personal npm organization (lowercase required for new packages; see D-01a). All `npx` and install commands use `@zandev32/pioneer`.

### Reference Project for E2E Tests
- `/home/zandev32/Documents/klaklik/SesaIoTNode` — Real PlatformIO project with `KitchenGuard-V1` environment. Used by existing UAT script. Suitable for tagged `#e2e` integration tests.

### Competitor
- `jl-codes/platformio-mcp` (36 stars) — validated disk-spooled serial monitoring, 3-tool monitor design. Distribution approach differs (they use `.agents/skills/` directory, not standalone MCP tools like pioneer).
</specifics>
