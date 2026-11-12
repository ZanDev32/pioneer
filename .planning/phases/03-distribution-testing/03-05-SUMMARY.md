---
phase: 03-distribution-testing
plan: 05
subsystem: testing + docs
tags: [mcp, host-config, claude-desktop, cursor, vscode, vitest, npm-publish]

requires:
  - phase: 03-distribution-testing
    provides: "03-01 — vitest unit/integration projects, scoped package metadata, dist-only tarball"
provides:
  - "Checked-in host config fixtures for Claude Desktop, Cursor, and VS Code, validated on every unit run"
  - "Per-host drift test that fails on top-level-key, type, or -y drift with the host named"
  - "README install matrix (npx / global / clone-and-build) and three copy-paste host config blocks"
  - "SKILL.md Tier 2 install commands using @zandev32/pioneer"
affects: [03-06, 03-07, 03-08, user onboarding]

actuals:
  tokens: 2900
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Data-as-artifact testing: host JSON templates live under test/fixtures/ and are parsed per host, not against a shared schema"
    - "Docs drift guard: README install markers asserted in the same unit test that guards the fixtures"

key-files:
  created:
    - test/fixtures/host-configs/claude-desktop.json
    - test/fixtures/host-configs/cursor.json
    - test/fixtures/host-configs/vscode.json
    - test/unit/host-configs.test.js
  modified:
    - README.md
    - .agents/skills/pio-mcp-manager/SKILL.md

key-decisions:
  - "Host configs are validated per host, not against one shared schema — the hosts genuinely disagree (VS Code `servers`, the other two `mcpServers`; Claude Desktop has no `type`) (D-19)"
  - "All three fixtures launch through `npx -y @zandev32/pioneer`, so no fixture depends on a global install or a checked-out dist/"
  - "Fixture contents are pasted verbatim into README so doc and data cannot drift apart silently"
  - "README's old VS Code stdio block (`node /absolute/path/to/pioneer/dist/server.js`) was replaced by the npx form and folded into Host Configuration; the VS Code section keeps only its HTTP-mode instructions"

patterns-established:
  - "Fixture + per-host assertion test: one describe per host so failures name the drifting file"
  - "Placeholder-token sweep: fixtures are asserted against `<`, `TODO`, `CHANGEME`, `xxxx` before shipping"

requirements-completed: [NFR-2]

coverage:
  - id: D1
    description: "Three host config templates for Claude Desktop, Cursor, and VS Code that launch the published package over stdio"
    requirement: "NFR-2"
    verification:
      - kind: unit
        ref: "test/unit/host-configs.test.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "README install matrix (zero-install, global, clone-and-build) and per-host config blocks with real host config paths"
    requirement: "NFR-2"
    verification:
      - kind: unit
        ref: "test/unit/host-configs.test.js > README install paths"
        status: pass
    human_judgment: false
  - id: D3
    description: "SKILL.md Tier 2 install commands teach the scoped package name"
    requirement: "NFR-2"
    verification:
      - kind: automated
        ref: "grep -nE 'npx (-y )?@zandev32/pioneer|npm (install|i) -g @zandev32/pioneer' .agents/skills/pio-mcp-manager/SKILL.md"
        status: pass
    human_judgment: false

metrics:
  duration: 5min
  started: 2026-11-12T06:05:00Z
  completed: 2026-11-12T06:08:20Z
  tasks: 2
  files: 6
  commits: 3
plan_head_before: 06e9af6e5767271580e60f2d508cfc4d4bbdd20b
plan_head_after: a8f51787cb9d84978028d65cbae9f57ef741b5d4

commits: 3
status: complete
---

# Phase 3 Plan 05: Host Configuration Templates and Install Matrix Summary

Three machine-checked host config templates plus a README install matrix, so Claude Desktop, Cursor, and VS Code setups cannot silently drift off `npx -y @zandev32/pioneer` (D-19, D-27).

## Performance

- **Duration:** ~5 min
- **Started:** 2026-11-12T06:05:00Z
- **Completed:** 2026-11-12T06:08:20Z
- **Tasks:** 2/2
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- Three fixtures under `test/fixtures/host-configs/` encode the real per-host shapes: Claude Desktop `mcpServers` with no `type`, Cursor `mcpServers` + `type: "stdio"`, VS Code `servers` + `type: "stdio"` + `cwd`.
- `test/unit/host-configs.test.js` (7 cases) guards those shapes, the `-y` + `@zandev32/pioneer` arg sequence, `--workspace` / `PIO_WORKSPACE_ROOT` wiring, placeholder-token hygiene, and the README install markers.
- README now documents all three install paths in D-27 order and gives copy-paste blocks with each host's real config file path; the misleading `node /absolute/path/to/pioneer/dist/server.js` block is gone.
- SKILL.md Tier 2 teaches `npx -y @zandev32/pioneer` / `npm i -g @zandev32/pioneer`; the repo ships no unscoped invocation.

## Task Commits

Each task was committed atomically (TDD: RED test commit where a test could be written first):

1. **Task 1: Host config fixtures and the drift test** - `1ea6b3a` (feat) — fixtures + test
2. **Task 2a: README assertions (RED)** - `ec7e7f7` (test) — added the failing README cases
3. **Task 2: README install matrix, host blocks, scoped SKILL.md** - `a8f5178` (docs)

Task 1 combined fixtures with the test in one commit because the RED state was four `ENOENT` failures on files that did not exist yet; there was no assertion-level RED to commit separately for data fixtures. Task 2's RED *was* assertion-level and is committed separately (see verification below).

## Files Created/Modified

- `test/fixtures/host-configs/claude-desktop.json` — Claude Desktop template, `mcpServers`, no `type`, `--workspace` + `PIO_WORKSPACE_ROOT`
- `test/fixtures/host-configs/cursor.json` — Cursor template, `mcpServers`, `type: "stdio"`, `${workspaceFolder}` workspace arg
- `test/fixtures/host-configs/vscode.json` — VS Code template, `servers`, `type: "stdio"`, `cwd` + `PIO_WORKSPACE_ROOT`
- `test/unit/host-configs.test.js` — 4 host-shape cases + 3 README/hygiene cases
- `README.md` — three install paths, Host Configuration section with three blocks and real host config paths, VS Code section collapsed to HTTP mode, CHANGELOG link
- `.agents/skills/pio-mcp-manager/SKILL.md` — Tier 2 install line uses the scoped package

## Verification (observed output)

### 1. Full suite green, host-config test listed, case names visible

```
$ npm ci
added 231 packages in 948ms

$ npm test
 RUN  v5.1.0 /home/zandev32/.omp/wt/t73b759eea/m

 Test Files  2 passed (2)
      Tests  10 passed | 2 skipped (12)
EXIT:0

$ npx vitest run test/unit/host-configs.test.js --reporter=verbose
 ✓ |unit| test/unit/host-configs.test.js > claude-desktop host config > uses mcpServers, no type field, and a resolved project path 2ms
 ✓ |unit| test/unit/host-configs.test.js > cursor host config > uses mcpServers with type stdio and the workspaceFolder variable 0ms
 ✓ |unit| test/unit/host-configs.test.js > vscode host config > uses servers with type stdio, cwd, and PIO_WORKSPACE_ROOT 0ms
 ✓ |unit| test/unit/host-configs.test.js > README install paths > documents zero-install, global install, and clone-and-build 0ms
 ✓ |unit| test/unit/host-configs.test.js > README install paths > names every supported host 0ms
 ✓ |unit| test/unit/host-configs.test.js > README install paths > uses the same npx -y scoped-package launch shape as the fixtures 0ms
 ✓ |unit| test/unit/host-configs.test.js > fixture hygiene > leaves no placeholder tokens behind 0ms
      Tests  7 passed (7)
EXIT:0
```

Task 2 RED before the docs edit (`ec7e7f7`):

```
 × README install paths > documents zero-install, global install, and clone-and-build
AssertionError: README: zero-install path via npx: expected '# Pioneer\n\nStandalone MCP (Model Co…' to contain 'npx @zandev32/pioneer'
 × README install paths > uses the same npx -y scoped-package launch shape as the fixtures
AssertionError: README: scoped package with -y: … to contain 'npx -y @zandev32/pioneer'
      Tests  2 failed | 5 passed (7)
EXIT:1
```

Drift detection proved by temporarily renaming VS Code's top-level key, then restoring the file (`git status` clean of that file afterwards):

```
 FAIL  |unit| test/unit/host-configs.test.js > vscode host config > uses servers with type stdio, cwd, and PIO_WORKSPACE_ROOT
AssertionError: vscode: top-level key must be "servers": expected [ 'mcpServers' ] to deeply equal [ 'servers' ]
      Tests  1 failed | 3 passed (4)
```

### 2. Fixture contents and the host config path each mirrors

`test/fixtures/host-configs/claude-desktop.json` — mirrors `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pioneer": {
      "command": "npx",
      "args": ["-y", "@zandev32/pioneer", "--workspace", "/absolute/path/to/project"],
      "env": {
        "PIO_WORKSPACE_ROOT": "/absolute/path/to/project"
      }
    }
  }
}
```

`test/fixtures/host-configs/cursor.json` — mirrors `~/.cursor/mcp.json` (or project `.cursor/mcp.json`):

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

`test/fixtures/host-configs/vscode.json` — mirrors `.vscode/mcp.json`:

```json
{
  "servers": {
    "pioneer": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@zandev32/pioneer", "--workspace", "${workspaceFolder}"],
      "cwd": "${workspaceFolder}",
      "env": {
        "PIO_WORKSPACE_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

### 3. README install section (quoted from the file)

```markdown
## Installation

Requires Node.js >= 22.12.0 and PlatformIO Core (`pio`) on `PATH`. Three install paths, least commitment first — all of them run the same `@zandev32/pioneer` package.

### Zero-Install

Run straight from the npm registry without adding anything globally:

```bash
npx @zandev32/pioneer --workspace /path/to/pio/project
```

Add `-y` in host configs and scripts so npm never stops to ask `Ok to proceed? (y)`:

```bash
npx -y @zandev32/pioneer --workspace /path/to/pio/project
```

### Global Install

```bash
npm i -g @zandev32/pioneer
pioneer --workspace /path/to/pio/project
```

### Clone and Build (Contributors)

From a clone of this repository:

```bash
npm ci
npm run build
node dist/server.js --workspace /path/to/pio/project
```

Release history lives in [CHANGELOG.md](CHANGELOG.md).
```

`## Host Configuration` follows the Usage section and carries three blocks identical to the fixtures, each preceded by its real config path (Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`, `%APPDATA%\Claude\claude_desktop_config.json`, `~/.config/Claude/claude_desktop_config.json`; Cursor: `~/.cursor/mcp.json` / `.cursor/mcp.json`; VS Code: `.vscode/mcp.json`), plus the note that VS Code does not advertise MCP roots so the workspace must come from `--workspace` or `PIO_WORKSPACE_ROOT`.

### 4. No placeholder tokens survive in any fixture

```
$ grep -rnE '<|TODO|CHANGEME|xxxx' test/fixtures/host-configs/; echo "grep exit: $?"
grep exit: 1
```

Exit 1 = zero matches across all three files. The same sweep is asserted in `test/unit/host-configs.test.js > fixture hygiene > leaves no placeholder tokens behind`.

## Decisions Made

- Per-host assertions instead of one schema (D-19); each describe names the host in every assertion message.
- Fixtures choose the published invocation (`npx -y`) rather than a local `dist/` path, so the templates work on a clean machine.
- README blocks are verbatim copies of the fixtures — the unit test asserts the shared `npx -y @zandev32/pioneer` shape, so a single edit cannot update one without the other going red.
- The legacy VS Code "Option 2/Option 3" stdio blocks were removed rather than left beside the new blocks: their `node /absolute/path/to/pioneer/dist/server.js` and `npm install -g .` instructions contradicted D-27. The HTTP-mode instructions were kept unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale VS Code stdio instructions contradicted the new install matrix**
- **Found during:** Task 2 (README rewrite)
- **Issue:** The plan asked to replace the `node /absolute/path/to/pioneer/dist/server.js` block with the `npx` form but left VS Code Option 3 (`cd /path/to/pioneer && npm install -g .`) in place. Keeping it would have left two install conventions in one README, one of them the source-checkout hack D-27 removes.
- **Fix:** VS Code's section now documents HTTP mode only, with a one-line pointer to the Host Configuration VS Code block; the stdio/global blocks live in Host Configuration.
- **Files modified:** `README.md`
- **Verification:** `npx vitest run test/unit/host-configs.test.js` green; `git grep 'dist/server.js'` in README shows only the clone-and-build contributor command.
- **Committed in:** `a8f5178`

### Plan text not executed

- **CHANGELOG.md link:** the plan says to link it; `CHANGELOG.md` does not exist yet in this worktree (plan 03-02 creates it in the same wave). The link is written as `[CHANGELOG.md](CHANGELOG.md)` — correct once 03-02 merges — but no test asserts its existence, since that would race the sibling plan.

---

**Total deviations:** 1 auto-fixed (Rule 1) + 1 cross-plan dependency note
**Impact on plan:** None on the deliverables; both keep one documentation convention instead of two.

## Known Stubs

None — no stubs, mocks, or unwired data sources in this plan's files.

## Threat Flags

None — no new network endpoint, auth path, or trust boundary. The fixtures are inert JSON; T-3-07 is mitigated in `test/unit/host-configs.test.js`.

## Self-Check: PASSED

- FOUND: test/fixtures/host-configs/claude-desktop.json
- FOUND: test/fixtures/host-configs/cursor.json
- FOUND: test/fixtures/host-configs/vscode.json
- FOUND: test/unit/host-configs.test.js
- FOUND: README.md (Host Configuration section present)
- FOUND: .agents/skills/pio-mcp-manager/SKILL.md (scoped install line)
- FOUND: 1ea6b3a, ec7e7f7, a8f5178 (all ancestors of HEAD)
