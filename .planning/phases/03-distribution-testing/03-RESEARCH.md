# Phase 3: Distribution & Testing - Research

**Researched:** 2026-11-09
**Domain:** npm scoped publishing with provenance, GitHub Actions release CI, Vitest ESM migration, MCP protocol compliance testing, MCP host configuration formats
**Confidence:** HIGH on registry/CI/test-runner mechanics (all verified against npm docs, npm registry, and installed packages this session); MEDIUM on host-config details (official docs read this session, but host schemas drift)

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Package Naming & Publishing**
- **D-01:** Package name: `@ZanDev32/pioneer` (scoped under user's personal npm org). Bin entry: `pioneer` (unchanged). This keeps the brand while gaining scoped namespace protection.
- **D-02:** First scoped publish at `0.2.0` — bumping minor from current `0.1.0` to signal the rename as a breaking change for consumers. Single release candidate: `0.2.0-rc.1` → `0.2.0`.
- **D-03:** Git tag trigger (`v*`) + CI publish. Pre-publish gates: `npm ci → npm run build → npm test`. Publish with `--provenance` for supply-chain attestation. `--access public` on first publish (scoped package requirement).
- **D-04:** `"files": ["dist/"]` already in package.json — keep the allowlist approach. No `.npmignore` needed.

**Versioning & Release Strategy**
- **D-05:** Manual semver + Keep a Changelog (`CHANGELOG.md`). Zero tooling dependencies — `npm version patch/minor/major` creates git tag + commit. Full control over bump semantics.
- **D-06:** Pre-release strategy: single release candidate (`0.2.0-rc.1`) for MCP host validation before tagging `latest`. No full alpha→beta→rc ladder.

**Test Framework & Strategy**
- **D-07:** **Vitest** — migrate from Jest 29. Native ESM support (no `--experimental-vm-modules` flag), esbuild transforms (same toolchain as `build.mjs`), Jest-compatible API (`describe`/`it`/`expect`). Faster CI startup, zero-config for `"type": "module"`.
- **D-08:** Write fresh tests targeting the standalone server's modules. Do NOT port the extension repo's 233 VS Code-centric tests — they test `vscode` module mocks irrelevant to this server.
- **D-09:** Mock `runPioCommand` at module boundary (`vi.mock('../utils.js')`) as single mock point for all 7 tool modules. Tests validate Zod schema enforcement, error wrapping, and response shaping without real CLI execution.
- **D-10:** Inline string fixtures for parser unit tests (PIO CLI output format is stable, samples ~50-200 chars). Shared fixture files in `test/fixtures/` only for integration layer (full build logs).
- **D-11:** Build priority: parsers → errors → utils → TaskManager → tool handlers. Parsers and errors are pure functions with no `child_process` dependency — fastest to write, highest confidence, most regex-heavy (highest bug risk).

**Test Structure & Organization**
- **D-12:** Hybrid layout: `test/unit/` for pure functions (parsers, errors, metadata), `test/integration/` for tool handlers (mocked `runPioCommand`). Vitest workspaces allow different timeouts per subdirectory (`testTimeout: 2000` for unit, `testTimeout: 30000` for integration).
- **D-13:** Integration tests tagged `#e2e` when they require a real PlatformIO project and `pio` CLI. Existing `test/uat-sesaiotnode.mjs` demonstrates this pattern — keep as opt-in CI run.

**CI/CD Pipeline Design**
- **D-14:** Single file GitHub Actions workflow (`ci.yml`) with tag trigger. Matrix: `ubuntu-latest`, `macos-latest`, `windows-latest` × Node 18, 20, 22 for build + unit tests. PlatformIO integration tests on `ubuntu-latest` only (Windows needs MSYS2 workarounds, macOS has slower toolchain downloads).
- **D-15:** PlatformIO installed via `actions/setup-python@v6` + `pip install platformio` (not the community `setup-platformio-action` which has low adoption).
- **D-16:** Caching: `setup-node` built-in `cache: 'npm'` for Node deps. `actions/cache@v4` for `~/.platformio/.cache` and `~/.cache/pip` with `runner.os`-prefixed keys.
- **D-17:** npm publish: trigger on `git tag v*`, run `npm ci && npm run build && npm test` as safety gate, then `npm publish --provenance`. Granular npm token (`Automation` type, bypasses 2FA) stored as `NPM_TOKEN` repository secret.

**MCP Host Integration Testing**
- **D-18:** **MCP Inspector CLI** in CI for automated JSON-RPC protocol compliance — validates `tools/list` and `tools/call` for all 12 tools, works with stdio transport. Official MCP project (10.2k ★).
- **D-19:** **Config file template validation** — automated JSON validation of all 3 host config templates (Claude Desktop, Cursor, VS Code) to catch key name drift (`mcpServers` vs `servers`, `type` field presence differences).
- **D-20:** **Manual smoke test checklists** gated to milestone releases (v0.2.0, v1.0.0) for host-specific validation no automation can cover: config file placement, variable resolution (`PIO_WORKSPACE_ROOT`), startup behavior per host.

### Claude's Discretion
- Exact Vitest config file structure (`vitest.config.js` vs `vitest.workspace.js`)
- Specific test file naming convention under `test/unit/` and `test/integration/`
- Detailed GitHub Actions workflow YAML (job names, step ordering, badge URL)
- CHANGELOG.md format and initial content
- Whether to add `publishConfig.access: "public"` to package.json
- Token scope details for `NPM_TOKEN` (granular per-package)
- Exact mock setup boilerplate for `vi.mock` in tool handler tests
- Fixture file format and organization under `test/fixtures/`

### Deferred Ideas (OUT OF SCOPE)
None recorded in `03-CONTEXT.md` — the file has no `<deferred>` block. Phase boundary is explicit: "distribution readiness and quality assurance — not new MCP tools, not skills enhancements, not competitive features" (`03-CONTEXT.md:11`).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NFR-2 (portability) | Node.js 18+ (ESM), Linux/macOS/Windows, no deps beyond MCP SDK + zod | Vitest pinned to 3.2.7 to keep the Node 18 leg of the D-14 matrix (§Standard Stack); bundled `dist/server.js` verified to run under Node 26 locally (installed `node v26.13.0`) |
| NFR-3 (safety) | Env validation before execution, workspace boundaries, structured errors | Protocol test asserts `PROJECT_NOT_FOUND` structured error without touching a device (§Code Examples) |
| ROADMAP plan: NPM package | Publish `@ZanDev32/pioneer` | §Package & Publish Mechanics, §Blocking Findings B-1/B-2 |
| ROADMAP plan: Claude Desktop config | `claude_desktop_config.json` entry | §Host Config Canonical Forms |
| ROADMAP plan: Cursor integration | `.cursor/mcp.json` entry | §Host Config Canonical Forms |
| ROADMAP plan: VS Code mcp.json | `.vscode/mcp.json` entry | §Host Config Canonical Forms; `.vscode/` is gitignored (`.gitignore:34`) so the template must live elsewhere |
| ROADMAP plan: Test suite | Port/replace the extension repo's suite | D-08 supersedes `REQUIREMENTS.md:110` ("port from extension repo: 233 tests"); Vitest 3.2.7 + `test.projects` handles the D-12 split |
| ROADMAP plan: CI/CD | `.github/workflows/ci.yml` | §GitHub Actions Workflow Mechanics |
| D-01..D-20 | See User Constraints | §Validation Architecture maps every decision to a verification level |

## Summary

Every D-01..D-20 decision is mechanically implementable on this stack, but three of them rest on facts that are false in the current tree and one is rejected by the npm registry. All four are fixed by small, local edits — none require re-litigating a decision's intent.

**Blocking findings the planner MUST resolve (details in §Blocking Findings):**

1. **B-1 — `@ZanDev32/pioneer` cannot be published as a new package.** npm's own validator reports `validForNewPackages: false` with `warnings: ["name can no longer contain capital letters"]`, and npm docs state "New packages must not have uppercase letters in the name." The publishable form is the lowercase `@zandev32/pioneer` (registry 404 = available). This contradicts D-01 *as written* and needs one user confirmation before the publish plan is executable.
2. **B-2 — `files: ["dist/"]` is NOT in `package.json`.** D-04 assumes it is. `npm pack --dry-run` currently ships 32 `.planning/` files, 14 `src/` files, and 7 `.agents/` files (1.27 MB unpacked) into the tarball.
3. **B-3 — `repository.url` points at someone else's repo** (`https://github.com/pioarduino/pioarduino-vscode-ide`) and the clone has **no git remote**. Provenance requires "a public repository that matches (case-sensitive) where you are publishing with provenance from."
4. **B-4 — `runPioCommand` is not the single mock seam D-09 assumes**: the async code paths in `src/tools/build.js:128`, `src/tools/upload.js:89`, and `src/tools/test.js:204` call `execFile('pio', …)` inline, bypassing `src/utils.js`.

**Primary recommendation:** publish as **`@zandev32/pioneer` at `0.2.0`** with `files: ["dist/"]`, `publishConfig.access: "public"`, `prepublishOnly: npm run build`, a `repository.url` pointing at `github.com/ZanDev32/pioneer`, **Vitest 3.2.7** (last line supporting Node 18) with `test.projects` split into `unit`/`integration`, and a separate `protocol` CI job on Node 24 running a pinned `@modelcontextprotocol/inspector@2.14.0 --cli`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Package metadata & tarball contents | Build artifact (`dist/`) | `package.json` | Only `dist/` ships; `files` allowlist is the single control point (`package.json` docs: `files` wins over `.gitignore` at package root) |
| Version stamping | Build (`build.mjs`) | `package.json` | `src/server.js:89` reads `process.env.npm_package_version \|\| '0.1.0'`; the fallback must stop being a hardcoded literal |
| Signing / attestation | CI (GitHub Actions OIDC) | npm registry | Provenance is minted by the CI provider's OIDC token, never on a laptop |
| Unit/integration test execution | Node test runner (Vitest, local + CI) | — | Pure functions and mocked handlers; no network, no device |
| Protocol compliance | CI, spawned subprocess | `dist/server.js` over stdio | Inspector spawns the built bundle and speaks JSON-RPC to it |
| E2E firmware tests | Developer machine / opt-in CI | `pio` CLI + real project | Requires `/home/zandev32/Documents/klaklik/SesaIoTNode` and a serial device |
| Host configuration | Host client (Claude Desktop / Cursor / VS Code) | Server (`PIO_WORKSPACE_ROOT`, MCP `roots`) | Each host has its own file format and interpolation rules; the server only sees env + `roots` |

## Blocking Findings

### B-1: `@ZanDev32/pioneer` is rejected by npm as a new package

```
$ node -e "…validate-npm-package-name('@ZanDev32/pioneer')"
{ "validForNewPackages": false,
  "validForOldPackages": true,
  "warnings": [ "name can no longer contain capital letters" ] }
```
(validator shipped inside npm 12.2.2 at `/usr/lib/node_modules/npm/node_modules/validate-npm-package-name`)

npm docs, name rules: "New packages must not have uppercase letters in the name." — https://docs.npmjs.com/cli/v11/configuring-npm/package-json#name

Registry check this session:
- `npm view @zandev32/pioneer version` → `E404` (name free)
- `npm view pioneer version description` → `0.11.7`, "Delicious Cucumber tests" (unscoped name is taken — scoping is correct, only the casing is wrong)

**Disposition:** D-01's *intent* (scoped, brand-preserving, bin unchanged) is fully preserved by `@zandev32/pioneer`. Every user-facing string may still read "ZanDev32"; only the npm name must be lowercase. **Planner must gate the publish task behind `checkpoint:human-verify`** confirming the user accepts the lowercase scope (or has a legacy org that accepted uppercase, which is unverifiable from here).

### B-2: `files` allowlist is missing

`package.json` has no `files` key. `npm pack --dry-run --json` includes, by top-level directory:

| Directory | Files shipped |
|---|---|
| `.planning/` | 32 |
| `src/` | 14 |
| `.agents/` | 7 |
| `test/` | 1 |
| root | `tsconfig.json`, `package.json`, `build.mjs`, `README.md` |
| `dist/` | 1 (`dist/server.js`, mode 493 = 0755) |

npm also warns: `"No .npmignore file found, using .gitignore for file exclusion."` `dist/` ships anyway because `bin` targets are always included — https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files ("Certain files are always included… The file(s) in the `bin` field").

**Also missing:** no `LICENSE` file exists although `"license": "Apache-2.0"`. npm auto-includes `LICENSE` when present; ship one or state the license only in metadata.

### B-3: provenance repo mismatch

Provenance prerequisites (https://docs.npmjs.com/generating-provenance-statements): "Ensure your package.json is configured with a public repository that matches (case-sensitive) where you are publishing with provenance from." Current value:

```json
"repository": { "type": "git", "url": "https://github.com/pioarduino/pioarduino-vscode-ide" }
```

`git remote -v` prints nothing (no remote configured; branch is `master`). Publishing with a mismatched `repository` yields an attestation that points at the wrong source, and a private/absent repo cannot be attested at all.

### B-4: the mock seam has three bypasses

`grep -n "execFile('pio'" src/tools/*.js`:
```
src/tools/build.js:128
src/tools/test.js:204
src/tools/upload.js:89
```
These are the `params.async` branches; the sync branches do call the shared executor (`src/tools/build.js:205`, `src/tools/upload.js:171`, `src/tools/test.js:277`). Root-cause fix is to route the three async branches through `runPioCommand` (it already accepts `{ projectDir, maxBuffer, timeout }` and resolves/rejects with `{ stdout, stderr, combined, exitCode }` / `{ code, stdout, stderr, combined, message, timedOut }` — `src/utils.js:23-57`). One refactor beats a second mock point in every integration test.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | **3.2.7** (not latest 5.1.0) | Test runner | Vitest 5.1.0 declares `engines: { node: "^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0" }`; D-14's matrix includes Node 18. `vitest@3.2.7` declares `^18.0.0 \|\| ^20.0.0 \|\| >=22.0.0` — verified via `npm view vitest@3.2.7 engines`. |
| `@vitest/coverage-v8` | 3.2.7 (must match) | Coverage | Default provider is `v8`; the peer package version tracks the runner (https://vitest.dev/guide/coverage) |
| `@modelcontextprotocol/inspector` | **2.14.0**, pinned | Protocol compliance CLI | Official MCP project; `engines: "^22.23.4 \|\| ^24.22.1 \|\| >=26.12.1"` → must run in its own Node 24 job, not in the 18/20/22 matrix |
| `esbuild` | 0.25.12 (installed) | Bundler | Already the build tool; `build.mjs` targets `node18`, ESM, single `dist/server.js` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@modelcontextprotocol/sdk` | 1.29.0 (installed; `^1.12.1` declared) | Server runtime + `StdioClientTransport` | Keep as the runtime client for any in-process protocol test (`node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js`) |
| `actions/checkout` | v7.0.1 (latest) | Repo checkout | npm's own example still uses `@v6`; either works |
| `actions/setup-node` | v7.1.0 (latest) | Node matrix + `.npmrc` | `registry-url` writes the auth `.npmrc`; v6+ auto-caches npm, so pass `package-manager-cache: false` in the publish job |
| `actions/setup-python` | v6 (D-15 locks v6; v7.1.0 exists) | PIO install | `pip install platformio` after setup |
| `actions/cache` | v4 (D-16 locks v4; v6.1.0 exists) | PIO + pip caches | Key prefix by `runner.os` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `NPM_TOKEN` secret (D-17) | npm Trusted Publishing (OIDC, no token) | Trusted publishing "requires npm CLI version 11.5.1 or later and Node version 22.14.0 or higher" (https://docs.npmjs.com/trusted-publishers) and needs a per-package config on npmjs.com. D-17 is locked; note it as the follow-up hardening step, do not implement now |
| Inspector CLI | `StdioClientTransport` from the already-installed SDK | Zero extra install and works on Node 18, but D-18 locks the Inspector. A 30-line SDK client is the natural fallback if the Inspector job is flaky |
| Vitest | `node:test` | No coverage provider, no projects, more boilerplate; D-07 locks Vitest |

**Installation:**
```bash
npm rm jest
npm i -D vitest@3.2.7 @vitest/coverage-v8@3.2.7
```

**Version verification (this session):**
```bash
npm view vitest version      # 5.1.0   -> engines require Node >=22.12
npm view vitest@3.2.7 engines # ^18.0.0 || ^20.0.0 || >=22.0.0
npm view @modelcontextprotocol/inspector version   # 2.14.0
npm view @modelcontextprotocol/inspector engines   # ^22.23.4 || ^24.22.1 || >=26.12.1
npm view @modelcontextprotocol/sdk version         # 1.32.2 (installed: 1.29.0)
```

## Package Legitimacy Audit

`gsd-tools query package-legitimacy check --ecosystem npm vitest @vitest/coverage-v8 @modelcontextprotocol/inspector` (run 2026-11-09):

| Package | Registry | Age | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `vitest` | npm | first publish 2021-12-03 | 179,734,329 | github.com/vitest-dev/vitest | SUS (`too-new` — latest version published 2026-11-02) | Approved at **3.2.7**; the flag is release recency, not package age |
| `@vitest/coverage-v8` | npm | first publish 2023-06-06 | 61,833,838 | github.com/vitest-dev/vitest | SUS (`too-new`) | Approved at **3.2.7** (must match runner) |
| `@modelcontextprotocol/inspector` | npm | first publish 2024-11-19 | 809,800 | github.com/modelcontextprotocol/inspector | SUS (`too-new`; `postinstall: node scripts/install-clients.mjs`) | Approved, **pinned to 2.14.0** and run with `npx --yes` in its own Node 24 job |

**Packages removed due to SLOP verdict:** none.
**Packages flagged as suspicious [SUS]:** all three — the seam's `too-new` signal fires on the newest release date, so the planner inserts a `checkpoint:human-verify` before the first `npm i -D vitest@3.2.7 @vitest/coverage-v8@3.2.7`. The Inspector's `postinstall` executes `node scripts/install-clients.mjs`; it is the official MCP repo, but CI should install it via `npx --yes @modelcontextprotocol/inspector@2.14.0` once per job rather than as a devDependency (keeps the tarball and lockfile clean).

## Architecture Patterns

### System Architecture Diagram

```
                       ┌──────────────────── CI (GitHub Actions) ────────────────────┐
 git push/PR ─────────►│ test job: matrix {ubuntu,macos,windows} × {18,20,22}        │
                       │   npm ci → npm run build → npm test (unit+integration)      │
                       │ protocol job: ubuntu, node 24                               │
                       │   npm ci → npm run build                                    │
                       │   npx --yes @modelcontextprotocol/inspector@2.14.0 --cli \  │
                       │       node dist/server.js --method tools/list               │
                       │   … --method tools/call --tool-name pio_task_list           │
                       │ e2e job (manual/dispatch only): ubuntu + platformio         │
                       └───────────────┬─────────────────────────────────────────────┘
                                       │ git tag v*  (push event)
                                       ▼
                       ┌──────────────── publish job ─────────────────┐
                       │ permissions: contents:read, id-token:write  │
                       │ npm ci → npm run build → npm test           │
                       │ version↔tag guard                           │
                       │ npm publish --provenance --access public    │
                       │   (rc tags: --tag next)                     │
                       └───────────────┬─────────────────────────────┘
                                       ▼
                             registry.npmjs.org  ──►  npx @zandev32/pioneer
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
 Claude Desktop                  Cursor                       VS Code
 claude_desktop_config.json      .cursor/mcp.json             .vscode/mcp.json
 {mcpServers:{…}}                {mcpServers:{type:"stdio"}}  {servers:{type:"stdio"}}
        │                              │                              │
        └──────────────► stdio spawn: npx -y @zandev32/pioneer ◄──────┘
                                       │
                                       ▼
                          dist/server.js (bundled, shebang, 0755)
                          registers 12 tools → JSON-RPC over stdin/stdout
```

### Recommended Project Structure
```
test/
├── unit/                 # pure functions: parsers, errors, metadata, tasks
│   ├── parsers.test.js
│   ├── errors.test.js
│   ├── metadata.test.js
│   └── tasks.test.js
├── integration/          # tool handlers with vi.mock('../../src/utils.js')
│   ├── build.test.js
│   └── …
├── protocol/             # spawned-bundle JSON-RPC assertions (Node >=18)
│   └── stdio-smoke.test.js
├── e2e/                  # opt-in only: real project + pio CLI + device
│   └── sesaiotnode.e2e.mjs
├── fixtures/
│   ├── build-logs/       # full PIO output for integration layer (D-10)
│   └── host-configs/     # claude-desktop.json, cursor.json, vscode.json (D-19)
└── uat-sesaiotnode.mjs   # untouched legacy script (D-13)
```
`test/fixtures/host-configs/` is deliberate: `.vscode/` is listed in `.gitignore:34`, so a checked-in `.vscode/mcp.json` would never be committed. Templates live under `test/` (never shipped — `files: ["dist/"]`) and the test asserts their shape.

### Pattern 1: `test.projects` with per-directory timeouts (D-12)
**What:** one root config, two inline projects. `workspace` is deprecated since Vitest 3.2; `projects` is the replacement and is "functionally the same" (https://vitest.dev/guide/projects).
**When to use:** always for this repo — the D-12 timeouts differ by an order of magnitude.
```js
// vitest.config.js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.js'],
          testTimeout: 2000,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.js'],
          testTimeout: 30000,
        },
      },
      {
        test: {
          name: 'protocol',
          include: ['test/protocol/**/*.test.js'],
          testTimeout: 30000,
        },
      },
    ],
  },
})
```
Selection: `vitest run --project unit` (flag verified present in 3.2.7: `package/dist/chunks/cac.BfaZ95xE.js:1124`). Defaults confirmed in the same build: `testTimeout` 5000 ms, `hookTimeout` 10000 ms.

### Pattern 2: single mock seam for tool handlers (D-09)
**What:** mock `src/utils.js` once per integration test file; assert the tool's Zod layer, error wrapping, and response shape.
**When to use:** every `src/tools/*.js` handler.
```js
// test/integration/build.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/utils.js', () => ({
  runPioCommand: vi.fn(),
  hasErrors: vi.fn(() => false),
}))

import { runPioCommand } from '../../src/utils.js'
import { registerBuildTools } from '../../src/tools/build.js'
```
`vi.mock` is hoisted above imports by the transformer, so the factory cannot close over outer variables unless you use `vi.hoisted` (https://vitest.dev/guide/mocking/modules — "it will transform every static import into a dynamic one and move the `vi.mock` call to the top of the file").

### Pattern 3: protocol smoke without a device (D-18)
**What:** spawn the built bundle over stdio and assert the wire contract, not behaviour.
**When to use:** every CI run; it is the only check that exercises the shipped artifact.
```bash
npx --yes @modelcontextprotocol/inspector@2.14.0 --cli \
  node dist/server.js --method tools/list
npx --yes @modelcontextprotocol/inspector@2.14.0 --cli \
  node dist/server.js --method tools/call --tool-name pio_task_list
```
Flag syntax verified at https://github.com/modelcontextprotocol/inspector/blob/main/clients/cli/README.md. v2 exit codes: "A failing tool call now exits non-zero (`5`), where v1 exited `0`" (https://github.com/modelcontextprotocol/inspector/blob/main/docs/v1-to-v2-migration.md).

Assertable with **no** PlatformIO project and **no** serial device:
- `tools/list` returns exactly 12 names, and each entry has `inputSchema` of `type: "object"` (spec: https://modelcontextprotocol.io/specification/2025-06-18/server/tools — "`inputSchema`: JSON Schema defining expected parameters").
- `tools/call` `pio_task_list` returns `{ content: [{ type: "text", text }], isError: false }` where `text` parses to `{ running_tasks: [], count: 0 }` (`src/tasks.js:218-230` touches only the in-memory `TaskManager`).
- `tools/call` `pio_build` with `PIO_WORKSPACE_ROOT` pointed at an empty temp dir returns `isError: true` and `text` parsing to `{ error: { code: "PROJECT_NOT_FOUND", … } }` — `assertPioProject` (`src/errors.js:133-142`) throws before any `pio` invocation, so this passes on a runner with no PlatformIO installed.

### Pattern 4: host config templates as data (D-19)
**What:** three JSON files under `test/fixtures/host-configs/`, validated by one test that asserts the *host-specific* keys rather than a shared schema.
**When to use:** every CI run; catches `servers`/`mcpServers` drift.

### Anti-Patterns to Avoid
- **Shipping `src/` "just in case":** the tarball exists to run `dist/server.js`; source maps aside, nothing else is consumed.
- **`prepare: npm run build`:** `prepare` "Does not run during `npm publish`, but does run during `npm ci` and `npm install`" — it would rebuild on every CI install and every consumer install. Use `prepublishOnly`, which "Runs BEFORE the package is prepared and packed, ONLY on `npm publish`" (https://docs.npmjs.com/cli/v11/using-npm/scripts).
- **Committing a `.vscode/mcp.json`:** gitignored; validate a copy under `test/fixtures/`.
- **Mocking `child_process`:** mocking `runPioCommand` is the seam; mocking Node internals couples 12 tests to exec semantics.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-directory test timeouts | Two Jest configs / two npm scripts with env vars | `test.projects` (Vitest ≥3.2) | Built-in, one config file, `--project` selection |
| ESM mocking | Manual module loader hacks | `vi.mock('../../src/utils.js')` | Hoisting handled by the transformer |
| Coverage report | Custom c8 invocation | `@vitest/coverage-v8` (`coverage.provider: 'v8'` default) | Integrated thresholds + reporters |
| JSON-RPC handshake | Hand-written stdin/stdout framing | Inspector CLI (`--cli --method …`) | Correct framing, initialization, exit codes; v2 signals failed tool calls with exit 5 |
| Provenance attestation | Manual Sigstore signing | `npm publish --provenance` on a GitHub-hosted runner | Registry verifies OIDC identity and logs to the transparency ledger |
| Release gating | Custom version-parsing scripts | `npm version patch\|minor\|major` (D-05) + a tag↔version equality check | `npm version` writes the commit and tag atomically |

**Key insight:** every item here is a solved problem with a maintained implementation already reachable from this stack — the only custom code this phase needs is the 12-tool name list and the three host config fixtures.

## Common Pitfalls

### Pitfall 1: Latest Vitest silently drops Node 18
**What goes wrong:** `npm i -D vitest` installs 5.1.0; every Node 18 matrix leg fails at install with an engine error (or worse, with an unsupported-syntax crash).
**Why it happens:** Vitest 5 requires `^22.12.0 || ^24.0.0 || >=26.0.0`.
**How to avoid:** pin `vitest@3.2.7` and `@vitest/coverage-v8@3.2.7`; add a comment in `package.json`-adjacent docs stating the reason is D-14's Node 18 leg.
**Warning signs:** `EBADENGINE` in the Node 18 job only.

### Pitfall 2: `dist/` is gitignored, so `npm publish` without a build ships a broken package
**What goes wrong:** a fresh clone has no `dist/`; `bin` points at `./dist/server.js`; `npx @zandev32/pioneer` fails with `Cannot find module`.
**Why it happens:** `.gitignore:2` ignores `dist/` while `bin` depends on it.
**How to avoid:** `"prepublishOnly": "npm run build"` (runs only on `npm publish`) plus the CI build step that already precedes publish.
**Warning signs:** `npm pack --dry-run` output missing `dist/server.js`.

### Pitfall 3: Pre-release publishes `latest` unless `--tag` is passed
**What goes wrong:** `0.2.0-rc.1` becomes the default install for every `npx` user.
**Why it happens:** npm docs, `tag` config: "If used in the `npm publish` command, this is the tag that will be added to the package submitted to the registry" — default `latest`.
**How to avoid:** `npm publish --provenance --access public --tag next` for `-rc.N`, plain publish for the final. D-06's single RC then gets promoted by publishing `0.2.0`.
**Warning signs:** `npm view @zandev32/pioneer dist-tags` showing `latest: 0.2.0-rc.1`.

### Pitfall 4: Tag and `package.json` version drift
**What goes wrong:** tag `v0.2.0` publishes `0.1.0` (or fails with "version already exists").
**Why it happens:** the workflow trusts the tag; nothing reconciles it with `version`.
**How to avoid:** guard step — compare `${GITHUB_REF_NAME#v}` with `npm pkg get version` and `exit 1` on mismatch.
**Warning signs:** registry `latest` older than the newest release tag.

### Pitfall 5: `--provenance` fails without OIDC
**What goes wrong:** `npm publish --provenance` errors ("provenance generation requires…") when `permissions: id-token: write` is missing, or when run on a self-hosted runner / local shell.
**Why it happens:** attestation is minted from the CI provider's OIDC token; npm docs require "a cloud-hosted runner" and `id-token: write`.
**How to avoid:** `permissions: { contents: read, id-token: write }` on the publish job, `runs-on: ubuntu-latest`, and never run the publish command locally.
**Warning signs:** publish job fails after a green test job; no attestation badge on npmjs.com.

### Pitfall 6: `vi.mock` path resolved relative to the test file, not the repo
**What goes wrong:** `vi.mock('../utils.js')` in `test/integration/build.test.js` silently mocks nothing (no error), so tests hit the real `pio`.
**Why it happens:** Vitest resolves the specifier from the importing test file.
**How to avoid:** from `test/integration/`, the seam is `'../../src/utils.js'`. From `test/unit/` it is also `'../../src/…'`. Add one assertion that the mock was called before asserting output.
**Warning signs:** integration tests take seconds and fail with `pio: command not found` on CI Node-only jobs.

### Pitfall 7: The `--cli` Inspector changes argument parsing and exit codes between v1 and v2
**What goes wrong:** a v1-style script (`--cli node build/index.js --method …` with a `--` separator) behaves differently on 2.x, and failed tool calls now exit 5.
**Why it happens:** documented migration in `docs/v1-to-v2-migration.md`: "Exit codes, argument ordering, and the `--` separator all changed."
**How to avoid:** pin the exact version (`@modelcontextprotocol/inspector@2.14.0`) with `npx --yes` and write assertions against exit 0.
**Warning signs:** job passes locally (`latest` resolves to a different version) and fails in CI, or vice versa.

### Pitfall 8: `npx` on Windows needs `-y` and a shell-resolvable command
**What goes wrong:** a host config that omits `-y` hangs the first launch on a prompt; `command: "npx"` fails where `npx.cmd` is required.
**Why it happens:** Windows resolves executables via `PATHEXT`; some hosts spawn without a shell.
**How to avoid:** every template uses `"command": "npx", "args": ["-y", "@zandev32/pioneer", "--workspace", "…"]`. Manual checklist (D-20) covers the Windows cases that automation cannot.
**Warning signs:** host shows the server as "failed" with no user-visible output.

### Pitfall 9: MCP client `roots` is not universal
**What goes wrong:** the server resolves the workspace to `process.cwd()` on a host that neither sends `roots` nor sets cwd to the project, so every tool errors `PROJECT_NOT_FOUND`.
**Why it happens:** documented in `src/workspace.js:13-25`: "VS Code's MCP client does NOT advertise `roots`".
**How to avoid:** document `--workspace ${workspaceFolder}` (VS Code/Cursor) or `env: { PIO_WORKSPACE_ROOT }` (Claude Desktop) in every template; keep the manual checklist focused on this.
**Warning signs:** tools work in Cursor but not VS Code for the same project.

## Code Examples

### Canonical stdio entry per host (D-19 fixtures)

Claude Desktop — `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows), `~/.config/Claude/claude_desktop_config.json` (Linux). Top-level key is `mcpServers`; there is **no** `type` field and **no** `${workspaceFolder}` support — pass the project explicitly:
```json
{
  "mcpServers": {
    "pioneer": {
      "command": "npx",
      "args": ["-y", "@zandev32/pioneer", "--workspace", "/absolute/path/to/project"],
      "env": { "PIO_WORKSPACE_ROOT": "/absolute/path/to/project" }
    }
  }
}
```
Sources: https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers (paths + `mcpServers` shape) and `src/server.js:34` (`process.env.PIO_WORKSPACE_ROOT`).

Cursor — `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global). Supports `${workspaceFolder}`, `${env:NAME}`, `${userHome}`, `${pathSeparator}`, and `envFile`:
```json
{
  "mcpServers": {
    "pioneer": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@zandev32/pioneer", "--workspace", "${workspaceFolder}"]
    }
  }
}
```
Source: https://cursor.com/docs/mcp — STDIO table lists `type` as Required (`"stdio"`), `command` Required, `args`/`env`/`envFile` optional; interpolation list at "Config interpolation". Note the doc's own JSON examples omit `type` while the field table requires it — templates should include `type` (harmless, and matches the table).

VS Code — `.vscode/mcp.json` uses `servers`. `type: "stdio"` is Required; `cwd` defaults to the workspace folder; `${env:NAME}` and `${workspaceFolder}` are supported:
```json
{
  "servers": {
    "pioneer": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@zandev32/pioneer"],
      "cwd": "${workspaceFolder}",
      "env": { "PIO_WORKSPACE_ROOT": "${workspaceFolder}" }
    }
  }
}
```
Sources: https://code.visualstudio.com/docs/agents/reference/mcp-configuration ("Top-level server object | `servers`", "`type` | Yes", "`cwd` … Defaults to the workspace folder", "Environment-variable references | `${env:NAME}`") and https://code.visualstudio.com/docs/agent-customization/mcp-servers ("Portable files use a top-level `mcpServers` object. The VS Code format uses `servers`."). If the user prefers the portable workspace-root `.mcp.json`, the shape becomes `mcpServers` + `${NAME}` and loses `cwd`/`envFile`.

### Publish job skeleton (D-03 + D-17)
```yaml
on:
  push:
    tags: ['v*']
permissions:
  contents: read
  id-token: write          # required for --provenance
jobs:
  publish:
    runs-on: ubuntu-latest   # provenance requires a GitHub-hosted runner
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: '24.x'
          registry-url: 'https://registry.npmjs.org'
          package-manager-cache: false   # npm's own example disables caching in release builds
      - run: npm ci
      - run: npm run build
      - run: npm test
      - name: Tag must match package.json version
        run: test "${GITHUB_REF_NAME#v}" = "$(npm pkg get version | tr -d '"')"
      - run: npm publish --provenance --access public ${{ contains(github.ref_name, '-') && '--tag next' || '' }}
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```
Provenance prerequisites and this exact step ordering are from https://docs.npmjs.com/generating-provenance-statements; `registry-url`/`NODE_AUTH_TOKEN` wiring is from the `actions/setup-node` README.

### Version stamp fix
`src/server.js:48` and `src/server.js:89` both use:
```js
version: process.env.npm_package_version || '0.1.0',
```
Under a plain `node dist/server.js` (and under most host spawns) `npm_package_version` is unset, so the server advertises `0.1.0` forever. Cheapest correct fix: inject at build time in `build.mjs` (`define: { __PIONEER_VERSION__: JSON.stringify(pkg.version) }`) or read `../package.json` at startup. [INFERENCE] that `npx` does not reliably export `npm_package_version` to the spawned bin — flag as a manual smoke-test item rather than a verified fact.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `vitest.workspace.js` | `test.projects` inline config | Vitest 3.2 | One root config; `workspace` is deprecated |
| `--experimental-vm-modules` for ESM | Native ESM, no flag | Vitest 0.x onward | Drops the Jest invocation in `package.json:13` |
| Long-lived `NPM_TOKEN` | OIDC trusted publishing | npm 11.5.1 / Node 22.14 | Not adopted now (D-17 locked); the provenance attestation is available either way |
| `.vscode/mcp.json` as the only VS Code destination | Portable workspace-root `.mcp.json` (`mcpServers`) | 2026 VS Code releases | Document both; the `.vscode/mcp.json` form still works and is the one with `cwd`/`envFile` |
| Inspector v1 CLI | v2 CLI (`mcp-inspector` binary, exit codes 0–5) | Inspector 2.0 | Pin the version; failed tool calls now fail the job |

**Deprecated/outdated:**
- Jest 29 for this repo — replaced by D-07.
- `vitest.workspace.*` — deprecated in 3.2.
- The extension repo's 233 `vscode`-mocked tests — explicitly out of scope per D-08 (contradicts `REQUIREMENTS.md:110`; D-08 is the later, locked decision).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The npm scope the user will create is `zandev32` (lowercase) | Blocking Findings B-1 | Publish fails with E400; plan needs a rename task before release |
| A2 | The public repo will be `github.com/ZanDev32/pioneer` | B-3 | Provenance attestation points elsewhere; publish may be rejected |
| A3 | `npx` does not export `npm_package_version` to the spawned bin | Code Examples | Server advertises a stale version in the MCP `initialize` response; only cosmetic unless asserted |
| A4 | Node 24 is available on `ubuntu-latest` runners for the Inspector job | Standard Stack | Protocol job cannot run; fall back to the SDK `StdioClientTransport` test |
| A5 | `actions/cache@v4` still runs on current runners (D-16 locks v4; v6 exists) | Standard Stack | Deprecation warning or failure; bump to v6 would require a decision change |
| A6 | The macOS/Windows matrix legs need no PlatformIO install for unit+integration tests | CI | If `npm test` ever shells out to `pio`, those legs fail |
| A7 | `test/uat-sesaiotnode.mjs` should remain a standalone script rather than being converted to a Vitest file | Common Pitfalls / Structure | Converts to a `test/e2e` project; more work, no behaviour change |

## Open Questions

1. **Lowercase scope acceptance (blocks D-01). → RESOLVED (D-01a)** — `@zandev32/pioneer` confirmed valid and free (the registry rejects capitals in new names). Gate: 03-01 task 1 `checkpoint:human-verify`.
   - What we know: npm rejects uppercase in new package names; `@zandev32/pioneer` is free.
   - What's unclear: whether the user already owns an npm org whose legacy name contains capitals (untestable without credentials).
   - Recommendation: one `checkpoint:human-verify` before the package.json rename task; default to `@zandev32/pioneer`.

2. **Where the public repo lives (blocks `--provenance`). → RESOLVED (D-03a)** — public `github.com/ZanDev32/pioneer`, `origin` added before the first tag. Gate: 03-07 task 1 `checkpoint:human-verify`.
   - What we know: no git remote; `repository.url` points at `pioarduino/pioarduino-vscode-ide`.
   - What's unclear: whether the user wants a fresh `ZanDev32/pioneer` repo or a fork target.
   - Recommendation: create `ZanDev32/pioneer` as public, `git remote add origin`, fix `repository.url` + add `bugs`/`homepage`.

3. **Whether `test/uat-sesaiotnode.mjs` becomes a Vitest e2e file. → RESOLVED (A7, YAGNI)** — stays a standalone script; the opt-in e2e job in 03-06 is the only place it is referenced. Revisit only if a second consumer appears.
   - What we know: it hardcodes `/home/zandev32/Documents/klaklik/SesaIoTNode` and `KitchenGuard-V1` (`test/uat-sesaiotnode.mjs:15-16`), and Vitest's default `include` (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) never matches it.
   - What's unclear: whether CI should ever run it.
   - Recommendation: leave it as a script; add `test/e2e/*.e2e.mjs` only if a second consumer appears (YAGNI).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | ✓ | v26.13.0 | — |
| npm | Publish, pack, `npm ci` | ✓ | 12.2.2 | — |
| npx | Host configs, Inspector | ✓ | bundled with npm | `node dist/server.js` in templates |
| git | Tags, `npm version` | ✓ | present (branch `master`) | — |
| git remote | Provenance repo match | ✗ | — | create `origin` before release |
| PlatformIO CLI | E2E only | ✓ | 6.1.19 (`/home/zandev32/.local/bin/pio`) | skip e2e |
| `jq` | Inspector output assertions | ✓ | present | assert in Node instead |
| `gh` | Creating the public repo | ✓ | `/usr/bin/gh` | web UI |
| Real PIO project | E2E | ✓ | `/home/zandev32/Documents/klaklik/SesaIoTnode` | skip e2e |

**Missing dependencies with no fallback:** a public git remote with a matching `repository.url` — blocks `--provenance` as specified (B-3).
**Missing dependencies with fallback:** none else.

## Validation Architecture

`workflow.nyquist_validation` is enabled (key absent from `.planning/config.json` → treated as enabled).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.7 + `@vitest/coverage-v8` 3.2.7 (to install; Jest 29 removed) |
| Config file | `vitest.config.js` (none exists — Wave 0) |
| Quick run command | `npx vitest run --project unit` |
| Full suite command | `npm test` → `vitest run` (unit + integration + protocol) |
| Coverage command | `npx vitest run --coverage` |

### Phase Requirements → Test Map

| Req / Decision | Behavior | Level | Automated Command | File Exists? |
|---|---|---|---|---|
| D-01 (name/bin) | Tarball exposes `pioneer` bin and the scoped name | unit | `node -e "const p=require('./package.json');if(!p.name.startsWith('@')||!p.bin.pioneer)process.exit(1)"` | ❌ Wave 0 (`test/unit/package.test.js`) |
| D-02 (0.2.0) | `version === "0.2.0"` at release; RC first | manual | tag↔version guard step in `ci.yml` | ❌ Wave 0 |
| D-03 (tag publish + provenance) | Publish only from `v*`, attestation present | manual/CI | workflow run; `npm view … dist.attestations` | ❌ Wave 0 |
| D-04 (`files`) | Only `dist/` ships | unit | `npm pack --dry-run --json` parsed in `test/unit/package.test.js` | ❌ Wave 0 |
| D-05 (manual semver) | `npm version` drives bumps, CHANGELOG updated | manual | checklist item on the release PR | ❌ Wave 0 (`CHANGELOG.md`) |
| D-06 (single RC) | `0.2.0-rc.1` published under `next`, not `latest` | manual/CI | `npm view … dist-tags` after RC publish | ❌ Wave 0 |
| D-07 (Vitest) | Jest gone; `npm test` runs Vitest with no ESM flag | unit | `npm test` | ❌ Wave 0 (`package.json` edit) |
| D-08 (fresh tests) | No `vscode` **module mocks** anywhere in `test/` (the host *name* — e.g. `test/fixtures/host-configs/vscode.json` — is not a mock) | unit | `grep -rE "from ['\"]vscode['\"]\|require\(['\"]vscode['\"]\)" test/` must be empty | ❌ Wave 0 |
| D-09 (mock seam) | All 12 handlers tested via `vi.mock('../../src/utils.js')` | unit/integration | `npx vitest run --project integration` | ❌ Wave 0 |
| D-10 (fixtures) | Inline strings for parsers; `test/fixtures/` only for integration | unit | `npx vitest run --project unit` | ❌ Wave 0 |
| D-11 (priority) | parsers → errors → utils → tasks → handlers | unit | coverage report per file | ❌ Wave 0 |
| D-12 (hybrid layout) | `test/unit` 2 s, `test/integration` 30 s | unit | `npx vitest run --project unit --project integration` | ❌ Wave 0 |
| D-13 (e2e opt-in) | e2e never runs on plain `npm test` | integration | `npm test` must not execute it; `PIO_E2E=1 vitest run --project e2e` for opt-in | ❌ Wave 0 |
| D-14 (matrix) | 9 matrix legs green | CI | `.github/workflows/ci.yml` | ❌ Wave 0 |
| D-15 (PIO install) | `setup-python@v6` + `pip install platformio` | CI | workflow log | ❌ Wave 0 |
| D-16 (caching) | npm cache + PIO/pip caches keyed by `runner.os` | CI | workflow log ("Cache restored") | ❌ Wave 0 |
| D-17 (publish gate) | `npm ci && build && test` precede publish | CI | workflow ordering; fails on red test | ❌ Wave 0 |
| D-18 (protocol) | 12 tools listed; `pio_task_list` and `PROJECT_NOT_FOUND` call | protocol | Inspector `--method tools/list`, `--method tools/call` | ❌ Wave 0 (`test/protocol/stdio-smoke.test.js` + CI job) |
| D-19 (config templates) | Three templates parse and carry host-correct keys | unit | `npx vitest run --project unit -t "host config"` | ❌ Wave 0 (`test/fixtures/host-configs/*.json`) |
| D-20 (manual checklists) | Host smoke test executed at v0.2.0 / v1.0.0 | manual | `docs/host-smoke-test.md` checklist | ❌ Wave 0 |
| NFR-2 | `dist/server.js` runs on Node 18/20/22 | integration | matrix `node dist/server.js --help` | ❌ Wave 0 |
| NFR-3 | Structured `PROJECT_NOT_FOUND`, no shell interpolation | protocol/unit | Inspector call + unit test on `runPioCommand` argv | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --project unit`
- **Per wave merge:** `npm test` (unit + integration + protocol)
- **Phase gate:** full suite green on all matrix legs + protocol job green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.js` — `test.projects` for `unit` (2000 ms) / `integration` (30000 ms) / `protocol`
- [ ] `test/unit/parsers.test.js`, `test/unit/errors.test.js`, `test/unit/metadata.test.js`, `test/unit/tasks.test.js` — D-11 order
- [ ] `test/integration/*.test.js` — 12 handlers via `vi.mock('../../src/utils.js')`
- [ ] `test/protocol/stdio-smoke.test.js` + CI protocol job (Node 24, pinned Inspector)
- [ ] `test/fixtures/host-configs/{claude-desktop,cursor,vscode}.json` — D-19
- [ ] `test/fixtures/build-logs/` — one real PIO failure log for the integration layer
- [ ] `test/unit/package.test.js` — `files`, `bin`, `name`, `publishConfig` assertions (cheap, catches B-2 regressions)
- [ ] `package.json`: remove `jest`, add `vitest` scripts, `files`, `prepublishOnly`
- [ ] `.github/workflows/ci.yml`
- [ ] `CHANGELOG.md`

## Security Domain

`security_enforcement` is enabled (key absent from `.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local stdio process; no user auth surface |
| V3 Session Management | partial | `crypto.randomUUID()` session ids in HTTP mode only (`src/server.js:140`) |
| V4 Access Control | yes | Workspace boundary — `assertWithinWorkspace` (`src/errors.js:87-120`), `PROJECT_OUTSIDE_WORKSPACE` |
| V5 Input Validation | yes | `zod` schemas on all 12 tools; `assertPioProject` / `assertEnvExists` (`src/errors.js:133-172`) |
| V6 Cryptography | no | Never hand-rolled; `crypto` used only for UUIDs |
| V14 Configuration | yes | Host config templates; `NPM_TOKEN` is an Automation token scoped to publish rights only |

### Known Threat Patterns for Node + npm + MCP stdio

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via `project_dir`/`port` | Tampering | `execFile` with argv arrays, never `shell: true` — verified: `grep -rn "shell:" src/` returns nothing; `src/utils.js:35` |
| Path traversal outside workspace | Elevation of privilege | `assertWithinWorkspace` + fixed-root mode (`src/errors.js:80-120`) |
| Supply-chain substitution of the published tarball | Tampering | `--provenance` + lockfile + `npm ci`; `files: ["dist/"]` shrinks the attack surface |
| Compromised long-lived npm token | Spoofing | Granular Automation token, repo secret only (D-17); trusted publishing is the eventual upgrade |
| Secrets leaking into `dist/` bundle | Information disclosure | Only `src/` is bundled; no `.env` read anywhere; `env: { ...process.env }` is propagated to `pio`, not logged |
| Malicious host config pointing at a look-alike package | Spoofing | README + templates pin `@zandev32/pioneer`; provenance badge is the user-verifiable signal |

## Sources

### Primary (HIGH confidence)
- https://docs.npmjs.com/generating-provenance-statements — provenance prerequisites, `id-token: write`, public-repo match, GitHub-hosted runner, npm CLI 9.5.0+
- https://docs.npmjs.com/cli/v11/configuring-npm/package-json — `name` (no uppercase for new packages), `files`, `bin` shebang requirement, `.npmignore`/`.gitignore` fallback
- https://docs.npmjs.com/cli/v11/commands/npm-publish — `access` default, `tag` semantics, `provenance` config
- https://docs.npmjs.com/cli/v11/using-npm/scripts — `prepublishOnly` runs only on publish; `prepare` runs on `npm ci`
- https://docs.npmjs.com/trusted-publishers — OIDC alternative (npm CLI 11.5.1+, Node 22.14+)
- https://raw.githubusercontent.com/modelcontextprotocol/inspector/main/clients/cli/README.md — `--cli`, `--method`, `--tool-name`, `--tool-arg`
- https://raw.githubusercontent.com/modelcontextprotocol/inspector/main/docs/cli-smoke-testing.md — pin exact version, `npx --yes`, Node engine floor
- https://raw.githubusercontent.com/modelcontextprotocol/inspector/main/docs/v1-to-v2-migration.md — exit codes 0–5, argument ordering change
- https://vitest.dev/guide/projects — `projects` replaces deprecated `workspace` (since 3.2)
- https://vitest.dev/guide/mocking/modules — `vi.mock` hoisting / transform behaviour
- https://vitest.dev/guide/coverage — v8 provider, `@vitest/coverage-v8`
- https://modelcontextprotocol.io/specification/2025-06-18/server/tools — `tools/list` Tool fields, `content`/`isError` result shape
- https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers — Claude Desktop config paths + `mcpServers`
- https://code.visualstudio.com/docs/agents/reference/mcp-configuration — `servers` vs `mcpServers`, `type`, `cwd`, `${env:NAME}`
- https://code.visualstudio.com/docs/agent-customization/mcp-servers — "Portable files use a top-level `mcpServers` object. The VS Code format uses `servers`."
- npm registry queries this session: `npm view vitest@3.2.7 engines`, `npm view @modelcontextprotocol/inspector engines`, `npm view pioneer`, `npm view @zandev32/pioneer`
- Local verification: `npm pack --dry-run --json`, `head -1 dist/server.js`, `ls -l dist/server.js` (mode 0755), `grep -rn "shell:" src/`

### Secondary (MEDIUM confidence)
- https://cursor.com/docs/mcp — `mcpServers` shape, STDIO field table, interpolation variables (`type` required in the table, omitted in the examples)
- https://github.com/actions/setup-node — `registry-url`/`NODE_AUTH_TOKEN`, npm auto-cache, `package-manager-cache: false`
- GitHub API `releases/latest` for `actions/checkout` (v7.0.1), `actions/setup-node` (v7.1.0), `actions/cache` (v6.1.0), `actions/setup-python` (v7.1.0)

### Tertiary (LOW confidence)
- [INFERENCE] `npx` does not export `npm_package_version` to the spawned bin (A3)
- [INFERENCE] Node 24 availability on `ubuntu-latest` for the Inspector job (A4)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version read from the registry this session (`npm view … engines`), including the Node-18 constraint that forces Vitest 3.2.7
- Architecture: HIGH — tool count, registration order, error shapes and the `runPioCommand` contract read directly from `src/`
- Publishing mechanics: HIGH — npm docs quote the exact prerequisites; the name-casing blocker reproduced with npm's own validator
- Host configs: MEDIUM — official docs read this session, but Cursor's own table and examples disagree on `type`, and VS Code is mid-migration to the portable `.mcp.json`
- Pitfalls: HIGH — all but #8 derived from documented behaviour or reproduced locally

**Research date:** 2026-11-09
**Valid until:** 2027-01-08 for npm/CI mechanics (60 days); 30 days for host config schemas and Inspector CLI flags, which move faster
