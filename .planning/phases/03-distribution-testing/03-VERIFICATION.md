---
phase: 03-distribution-testing
verified: 2026-11-12T07:36:34Z
status: human_needed
score: 29/32 must-haves verified
covered_files:
  - .agents/skills/pio-mcp-manager/SKILL.md
  - .github/workflows/ci.yml
  - .planning/phases/03-distribution-testing/03-01-PLAN.md
  - .planning/phases/03-distribution-testing/03-01-SUMMARY.md
  - .planning/phases/03-distribution-testing/03-02-PLAN.md
  - .planning/phases/03-distribution-testing/03-02-SUMMARY.md
  - .planning/phases/03-distribution-testing/03-03-PLAN.md
  - .planning/phases/03-distribution-testing/03-03-SUMMARY.md
  - .planning/phases/03-distribution-testing/03-04-PLAN.md
  - .planning/phases/03-distribution-testing/03-04-SUMMARY.md
  - .planning/phases/03-distribution-testing/03-05-PLAN.md
  - .planning/phases/03-distribution-testing/03-05-SUMMARY.md
  - .planning/phases/03-distribution-testing/03-06-PLAN.md
  - .planning/phases/03-distribution-testing/03-06-SUMMARY.md
  - .planning/phases/03-distribution-testing/03-07-PLAN.md
  - .planning/phases/03-distribution-testing/03-07-SUMMARY.md
  - .planning/phases/03-distribution-testing/03-08-PLAN.md
  - .planning/phases/03-distribution-testing/03-08-SUMMARY.md
  - CHANGELOG.md
  - LICENSE
  - README.md
  - build.mjs
  - docs/host-smoke-test.md
  - package-lock.json
  - package.json
  - src/errors.js
  - src/parsers.js
  - src/server.js
  - src/tasks.js
  - src/tools/build.js
  - src/tools/check.js
  - src/tools/clean.js
  - src/tools/discover.js
  - src/tools/monitor.js
  - src/tools/test.js
  - src/tools/upload.js
  - test/fixtures/host-configs/claude-desktop.json
  - test/fixtures/host-configs/cursor.json
  - test/fixtures/host-configs/vscode.json
  - test/integration/build.test.js
  - test/integration/check.test.js
  - test/integration/clean.test.js
  - test/integration/discover.test.js
  - test/integration/monitor.test.js
  - test/integration/tasks.test.js
  - test/integration/test.test.js
  - test/integration/upload.test.js
  - test/protocol/stdio-smoke.test.js
  - test/uat-sesaiotnode.mjs
  - test/unit/errors.test.js
  - test/unit/host-configs.test.js
  - test/unit/metadata.test.js
  - test/unit/monitor-guard.test.js
  - test/unit/package.test.js
  - test/unit/parsers.test.js
  - test/unit/tasks.test.js
  - test/unit/utils.test.js
  - vitest.config.js
covered_digest: "v4:sha256:6f0f3dbf7308bd9a24aa1fac96cc76055d2aa36d25ea03d8c1e426ab7a8e13b6"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "The tag-triggered publish path (guard → dist-tag derivation → `npm publish --provenance`) executes and publishes under `next`"
    test: "Push a `v*` tag whose name equals `npm pkg get version` and watch the `publish (npm provenance)` job"
    expected: "Guard passes, job publishes `0.2.0-rc.1` with `--tag next`, `latest` untouched, attestation attached"
    why_human: "No tag exists by design (dispatch forbade tagging/pushing); the publish job has only ever been observed skipping, never running"
human_verification:
  - test: "Run the three-host RC gate in docs/host-smoke-test.md against a build published under `next` (Claude Desktop, Cursor, VS Code) and fill the sign-off table"
    expected: "All three rows read PASS: config placed where the host reads it, `${workspaceFolder}` / `PIO_WORKSPACE_ROOT` resolve, the server starts and answers `tools/list`, a build runs"
    why_human: "GUI host config placement, variable interpolation and startup behaviour cannot be observed from a headless Linux sandbox"
  - test: "Publish the RC: `git push origin HEAD v0.2.0-rc.1` (or `npm publish --tag next` via the pipeline)"
    expected: "`npm view @zandev32/pioneer dist-tags --json` reports `{\"next\":\"0.2.0-rc.1\"}` only; `latest` absent"
    why_human: "Irreversible external action; forbidden in this run, and gated behind the host validation above"
  - test: "After sign-off, `npm version 0.2.0` and push the tag"
    expected: "`package.json` + `package-lock.json` both read `0.2.0`, the tag equals the version, the publish job admits it and moves `latest`"
    why_human: "State-changing release action, one-way for the published contract (D-26)"
  - test: "Decide on the publish-job trigger hardening (see Gaps)"
    expected: "Either accept the current `startsWith(github.ref, 'refs/tags/v')` gate or add `github.event_name == 'push'` before the first tag is pushed"
    why_human: "Policy call: the effective invariant (tag exists + version matches + npm refuses republish) already holds; the literal must-have wording does not"
---

# Phase 3: Distribution & Testing Verification Report

**Phase Goal (ROADMAP):** Package for npm, test with multiple AI hosts — `@zandev32/pioneer` publish setup, Claude Desktop / Cursor / VS Code config, fresh Vitest suites, GitHub Actions CI/CD.

**Verified:** 2026-11-12T07:36:34Z (HEAD `77fb258`, branch `master`, `origin/master` at the same commit)
**Status:** `human_needed`
**Re-verification:** No — initial verification (no prior `03-VERIFICATION.md`)

## Goal Achievement

Distribution readiness is delivered and machine-verified end-to-end: the package builds to a single `dist/server.js`, the tarball is dist-only, the suite is green with enforced coverage floors, the protocol lane and the pinned Inspector commands pass against the built bundle, and the hosted CI on HEAD is green across 3 OS × Node 22/24. What is *not* achieved is the phase's own milestone gate: the RC has never been published (`next` does not exist) and no human has run the three-host checklist — both are `blocking-human` by D-06/D-20/D-26 and were excluded from this run.

## Must-Have Table

Roadmap Phase 3 has no separate success-criteria list; must-haves below are the union of the eight PLANS' `must_haves` (deduplicated) plus the roadmap/REQUIREMENTS bullets the phase claims. Evidence IDs refer to the Evidence section.

| # | Must-have | Status | Proof |
|---|-----------|--------|-------|
| 1 | Package identity: `@zandev32/pioneer`, bin `pioneer` → `./dist/server.js`, `files: ["dist/"]` | ✓ VERIFIED | `package.json`; `test/unit/package.test.js:23-27`; E1 |
| 2 | `npm pack` ships only `dist/` + package metadata | ✓ VERIFIED | E8 — 4 files: LICENSE, README.md, dist/server.js, package.json |
| 3 | Built bundle reports `package.json` version in `--help` and in MCP `initialize` | ✓ VERIFIED | E4 (`Pioneer v0.2.0-rc.1`), E9 (`serverInfo.version`), `src/server.js:48,89` fed by `build.mjs` `define` |
| 4 | `test/unit/package.test.js` asserts the bundle is under the 5 MB ceiling | ✓ VERIFIED | 862,653 B; test ran (not skipped) — E3 |
| 5 | `npm test` runs Vitest over unit+integration, no `--experimental-vm-modules`; per-dir timeouts 2000/30000 | ✓ VERIFIED | E5; `package.json:scripts`; `vitest.config.js` unit `testTimeout: 2000`, integration `30000` |
| 6 | All 12 tools use `registerTool` with explicit `{description, inputSchema}`; SDK `^1.32.2`; no deprecation warnings | ✓ VERIFIED | E10 (12 `registerTool`, 0 `server.tool(`), E2 (resolved 1.32.2), E9 stderr clean |
| 7 | Release metadata: `repository.url`, `publishConfig.access`, `prepublishOnly` build, Keep-a-Changelog CHANGELOG, Apache-2.0 LICENSE | ✓ VERIFIED | `package.json`; `CHANGELOG.md`; `LICENSE` (`Apache License` ×4); E12 |
| 8 | Unit layer over the five pure modules with inline string fixtures; no unit test spawns real `pio` | ✓ VERIFIED | E5 (16 files); `test/unit/utils.test.js:4` mocks `child_process`; `test/fixtures/` holds only host configs |
| 9 | Parser dedup by `file:line:message` and the four-parser merge order are asserted | ✓ VERIFIED | `test/unit/parsers.test.js:212-237`; impl `src/parsers.js:269-282` |
| 10 | ~50 KB synthetic log parses through `parseAllDiagnostics` in < 100 ms (NFR-1 measured) | ✓ VERIFIED | `test/unit/parsers.test.js:253-271` (asserts ≥50 KiB input and `< 100`), test green |
| 11 | `TaskManager` TTL cleanup driven by fake timers, timers always destroyed | ✓ VERIFIED | `test/unit/tasks.test.js:10,15,163` (leak test on `destroy()`) |
| 12 | Every `pio` invocation in `src/tools/` flows through the single executor in `src/utils.js` | ✓ VERIFIED | E11 — only `execFile('pio', …)` is `src/utils.js:35`; monitor's `execFile`/`spawn` are `stty`/`cat` (`src/tools/monitor.js:212,219`) |
| 13 | All 12 tools have an integration test that drives the handler and asserts the response/error envelope | ✓ VERIFIED | E13; e.g. `test/integration/build.test.js` registers handlers on a fake server and invokes them with `runPioCommand` mocked |
| 14 | On win32 `pio_serial_start` rejects with `PLATFORM_UNSUPPORTED` naming the constraint and the WSL/Tier-3 alternative | ✓ VERIFIED | `src/tools/monitor.js:165-170`, `src/errors.js:52` (`-32010`), `test/unit/monitor-guard.test.js:30-54` |
| 15 | Coverage floors 80/70/80/80 global and `src/parsers.js` ≥ 85 % lines, enforced not decorative | ✓ VERIFIED | E6 (89.27 / 77.30 / 94.73 / 91.11; parsers 100 %), E7 (exit 1 when the floor is raised) |
| 16 | Three host fixtures validated by one unit test asserting host-specific keys, not a shared schema | ✓ VERIFIED | `test/unit/host-configs.test.js:12-49` (per-host `serverEntry` + `expectNpxLaunch`) |
| 17 | VS Code uses `servers`; Claude Desktop and Cursor use `mcpServers`; `type: "stdio"` only where the host requires it | ✓ VERIFIED | E14 (claude-desktop omits `type`; cursor and vscode carry it; vscode top key `servers`) |
| 18 | Every template launches `npx -y @zandev32/pioneer`; README documents zero-install / global / clone-and-build; SKILL teaches the scoped name | ✓ VERIFIED | E14, E15; `test/unit/host-configs.test.js` asserts `-y` immediately precedes the package and the README paths |
| 19 | `npm run test:protocol` builds the bundle and passes a lane that talks to `dist/server.js` over stdio | ✓ VERIFIED | E5 — `npm run build && vitest run --project protocol`, 5/5; `test/protocol/stdio-smoke.test.js:31` entry = `dist/server.js` |
| 20 | Protocol lane asserts `protocolVersion: '2025-11-25'` and exactly 12 tools with `inputSchema.type === 'object'` | ✓ VERIFIED | `test/protocol/stdio-smoke.test.js:194-221`; E9 independently reproduces both |
| 21 | `pio_task_list` on a fresh server → `{running_tasks: [], count: 0}`; `pio_build` on an empty workspace → structured `PROJECT_NOT_FOUND` | ✓ VERIFIED | `test/protocol/stdio-smoke.test.js:224-238`; E19 reproduces `pio_task_list` through the pinned Inspector |
| 22 | CI runs a 3 OS × Node 22/24 matrix, full suite + coverage on Ubuntu, `test:unit` only on macOS/Windows — and it actually runs | ✓ VERIFIED | E16 (parse), E17 (green run: 6/6 matrix cells + protocol) |
| 23 | CI triggers on `push` (`master`, tags `v*`), `pull_request` (`master`) and `workflow_dispatch` | ✓ VERIFIED | E16 |
| 24 | Protocol job pins the Inspector version; an opt-in e2e job exists and only runs on `workflow_dispatch` | ✓ VERIFIED | E16 (`@modelcontextprotocol/inspector@2.14.0`, e2e `if`), E18 (pinned CLI invocations executed locally), E17 (green / skipped) |
| 25 | Publish job runs only for a pushed `v*` tag and cannot be triggered by `pull_request` or `workflow_dispatch` | ⚠️ PARTIAL — human decision | Tag-only + PR-safe ✓ (E16 `if: startsWith(github.ref,'refs/tags/v')`, E17 skipped on push). Literal `workflow_dispatch` clause is **not** enforced: dispatching on a tag ref yields `github.ref = refs/tags/…`, so the job would start. Effective publish invariant still holds (tag/version guard + npm refuses republish) — see Gaps |
| 26 | A tag/version mismatch fails before `npm publish` | ✓ VERIFIED | E16 — `test "${GITHUB_REF_NAME#v}" = "$(npm pkg get version \| tr -d '"')"` is step 6 of 8, publish is step 8 |
| 27 | Hyphen version → `--tag next`; plain version → `latest` | ✓ VERIFIED | E16 — `case "$version" in *-*) flag=--tag next …` |
| 28 | `origin` remote matches `https://github.com/ZanDev32/pioneer` and equals `repository.url` | ✓ VERIFIED | E12 (`origin https://github.com/ZanDev32/pioneer.git`) |
| 29 | `package.json` version `0.2.0-rc.1`; CHANGELOG `0.2.0` section names the rename as breaking; lockfile agrees | ✓ VERIFIED | E2, E15, `CHANGELOG.md` `### Breaking` |
| 30 | Milestone-gated manual checklist covering config placement, `PIO_WORKSPACE_ROOT`, startup behaviour for all three hosts, launched as `npx -y @zandev32/pioneer@next`, with a sign-off table and the `npm version 0.2.0` release step | ✓ VERIFIED | `docs/host-smoke-test.md:1-215` (host sections at 48/92/126, `@next` at 64/105/141, sign-off table 196-209, release step 211-213) |
| 31 | The RC is published under the `next` dist-tag | ✗ PENDING (human gate) | E20 — no tag locally or on GitHub, `npm view @zandev32/pioneer` → 404, no `next` dist-tag. Deferred by D-06/D-26 and by this run's no-push rule |
| 32 | Host validation is recorded before the `v0.2.0` tag is pushed | ✗ PENDING (human gate) | `docs/host-smoke-test.md` sign-off rows blank by design; `03-08-SUMMARY.md:55-64` records the checkpoint |

**Score:** 29/32 verified (1 partial awaiting a human policy call, 2 pending on the milestone human gate).

## Evidence

Environment: Node `v26.13.0`, npm `12.2.2`, Python `3.14.9`, Linux x64. All commands below were executed in this checkout at HEAD `77fb258`.

### E1 — `npm ci`
```
added 231 packages in 1s
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)   [blocked by this sandbox's npm]
```
The blocked postinstall is sandbox-local; esbuild's binary was already present and the build below succeeded.

### E2 — locked dependency set
```
$ npm ls vitest @vitest/coverage-v8 @modelcontextprotocol/sdk esbuild --depth=0
├── @modelcontextprotocol/sdk@1.32.2
├── @vitest/coverage-v8@5.1.0
├── esbuild@0.28.2
└── vitest@5.1.0
lock: 0.2.0-rc.1 | 0.2.0-rc.1 | vitest 5.1.0 | sdk 1.32.2 | esbuild 0.28.2
```

### E3 — `npm run build` and the bundle ceiling
```
Built dist/server.js successfully
-rwxr-xr-x 1 zandev32 zandev32 862653 Nov 12 15:29 dist/server.js
```
The bundle test is *not* skipped when `dist/` exists (verbose run):
```
✓ |unit| test/unit/package.test.js > built bundle > is a single file under the 5 MB ceiling 0ms
✓ |unit| test/unit/package.test.js > built bundle > reports the package.json version in the help banner 84ms
```

### E4 — `node dist/server.js --help`
```

Pioneer v0.2.0-rc.1

Usage:
  pioneer [options]
…
```

### E5 — `npm test` and `npm run test:protocol`
```
$ npm test
 Test Files  16 passed (16)
      Tests  142 passed (142)
   Duration  847ms

$ npm run test:protocol
npm notice run npm run build && vitest run --project protocol
Built dist/server.js successfully
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### E6 — `npm run test:coverage` (floors 80/70/80/80, parsers 85)
```
File           | % Stmts | % Branch | % Funcs | % Lines
All files      |   89.27 |    77.3 |   94.73 |   91.11
 src/parsers.js|     100 |    93.1 |     100 |     100
Statements   : 89.27% ( 866/970 )
Branches     : 77.3% ( 528/683 )
Functions    : 94.73% ( 108/114 )
Lines        : 91.11% ( 800/878 )
```

### E7 — floors are enforced, not decorative (anti-vacuity probe)
```
$ npx vitest run --project unit --coverage --coverage.thresholds.lines=99   # CLI-only override, config untouched
REAL_EXIT=1
4                # ERROR: Coverage … does not meet global threshold
$ npm run test:coverage
REAL_EXIT_DEFAULT=0
```

### E8 — `npm pack --dry-run`
```
npm notice 11.4kB LICENSE
npm notice 5.1kB README.md
npm notice 862.7kB dist/server.js
npm notice 1.6kB package.json
npm notice total files: 4
npm notice package size: 170.4 kB
```

### E9 — real stdio handshake against `dist/server.js` (raw JSON-RPC, no SDK helper)
```
STDERR: "Pioneer starting...\nWorkspace: resolved lazily via MCP roots or cwd\nMode: stdio (JSON-RPC over stdin/stdout)\nServer ready\n"
initialize.protocolVersion = 2025-11-25
serverInfo = {"name":"pioneer","version":"0.2.0-rc.1","capabilities":{"logging":{}}}
tools/list count = 12
pio_build,pio_check,pio_clean,pio_list_boards,pio_list_devices,pio_run_tests,pio_serial_read,pio_serial_start,pio_serial_stop,pio_task_list,pio_task_status,pio_upload
```
No `DeprecationWarning` on stderr.

### E10 — tool registration surface
```
registerTool( count: 12
server.tool( count: 0
```

### E11 — single `pio` executor seam
```
src/utils.js:35: execFile('pio', args, execOptions, …)
src/tools/monitor.js:212: execFile('stty', ['-F', serialPort, baud, 'raw'], …)
src/tools/monitor.js:219: spawn('cat', [serialPort], …)
```
Of the three process spawns in `src/`, only `utils.js` invokes `pio`; the monitor's two are the documented `stty`+`cat` capture, not a `pio` bypass.

### E12 — repository / pack provenance
```
origin  https://github.com/ZanDev32/pioneer.git (fetch)
origin  https://github.com/ZanDev32/pioneer.git (push)
$ node -p '"repository.url = " + require("./package.json").repository.url'
repository.url = https://github.com/ZanDev32/pioneer
```

### E13 — tool → integration test map
```
pio_build → build.test.js        pio_check → check.test.js       pio_clean → clean.test.js
pio_list_boards, pio_list_devices → discover.test.js
pio_run_tests → test.test.js    pio_upload → upload.test.js
pio_serial_read, pio_serial_start, pio_serial_stop → monitor.test.js
pio_task_list, pio_task_status → tasks.test.js
```

### E14 — host fixtures
```
claude-desktop.json: {"mcpServers":{…"args":["-y","@zandev32/pioneer","--workspace","/absolute/path/to/project"],"env":{"PIO_WORKSPACE_ROOT":…}}}   # no "type"
cursor.json:         {"mcpServers":{"pioneer":{"type":"stdio","args":["-y","@zandev32/pioneer","--workspace","${workspaceFolder}"]}}}
vscode.json:         {"servers":{"pioneer":{"type":"stdio","args":["-y","@zandev32/pioneer","--workspace","${workspaceFolder}"],"cwd":…,"env":{"PIO_WORKSPACE_ROOT":…}}}}
```

### E15 — README install matrix, CHANGELOG, SKILL
```
README.md:7   Requires Node.js >= 22.12.0 … Three install paths … @zandev32/pioneer
README.md:14  npx @zandev32/pioneer --workspace /path/to/pio/project
README.md:26  npm i -g @zandev32/pioneer
README.md:35  npm ci            (clone-and-build)
SKILL.md:57   npx -y @zandev32/pioneer   or   npm i -g @zandev32/pioneer
CHANGELOG.md  ## [0.2.0] - unreleased | ### Breaking — Published as the scoped package @zandev32/pioneer
```

### E16 — parsed `.github/workflows/ci.yml` (PyYAML)
```
triggers: {"push":{"branches":["master"],"tags":["v*"]},"pull_request":{"branches":["master"]},"workflow_dispatch":null}
permissions(top): {'contents': 'read'}
JOB test: runs-on=${{ matrix.os }} steps=10
  matrix: {"os":["ubuntu-latest","macos-latest","windows-latest"],"node":[22,24]}
   - Full suite          (if: runner.os == 'Linux'        → npm test)
   - Coverage floors     (if: runner.os == 'Linux' && matrix.node == 22 → npm run test:coverage)
   - Unit suite          (if: runner.os != 'Linux'        → npm run test:unit)
JOB protocol: ubuntu-latest steps=6
   - Inspector tools/list → npx --yes @modelcontextprotocol/inspector@2.14.0 --cli node dist/server.js --method tools/list
   - Inspector tools/call → … --method tools/call --tool-name pio_task_list
JOB e2e: if=github.event_name == 'workflow_dispatch' && vars.PIO_E2E_PROJECT != ''
JOB publish: if=startsWith(github.ref, 'refs/tags/v') permissions={'contents':'read','id-token':'write'} steps=8
   steps: Checkout · Set up Node.js · Install dependencies · Build bundle · Full suite ·
          Check tag matches package version · Derive dist-tag · Publish to npm
```
`grep -c "continue-on-error"` → 0; `grep -c "npm publish"` → 1.

### E17 — the hosted matrix actually ran and is green on HEAD (GitHub Actions API)
```
runs: 43175561402 77fb258 push completed success  2026-11-12T07:28:52Z master
      43175362904 d2cb481 push completed failure
      43175248884 ffbeb76 push completed failure
      43174815733 a0f770d push completed failure
      43174600553 0ab058d push completed failure

jobs of 43175561402 (HEAD):
success   protocol (inspector)
success   test (macos-latest, node 24)      success   test (macos-latest, node 22)
success   test (windows-latest, node 24)    success   test (windows-latest, node 22)
success   test (ubuntu-latest, node 22)     success   test (ubuntu-latest, node 24)
skipped   e2e (manual)
skipped   publish (npm provenance)
```
The pre-fix run failed **only** on `test (windows-latest, node 22)` and `test (windows-latest, node 24)` — the matrix genuinely exercises Windows and caught the two defects fixed by `a0f770d`/`d2cb481`/`77fb258`. `publish` skipped on a non-tag push confirms the tag gate at runtime.

### E18 — the pinned Inspector commands work (executed locally, same argv as CI)
```
$ npx --yes @modelcontextprotocol/inspector@2.14.0 --help
Usage: mcp-inspector [options]   --cli  Run CLI …
Mode flags (--web, --cli, --tui) must appear before app options. All following arguments are forwarded unchanged.
```

### E19 — Inspector `tools/call` against the built bundle
```
$ npx --yes @modelcontextprotocol/inspector@2.14.0 --cli node dist/server.js --method tools/call --tool-name pio_task_list
{ "content": [ { "type": "text", "text": "{\n  \"running_tasks\": [],\n  \"count\": 0\n}" } ] }
EXIT=0
```

### E20 — release state: nothing published, no tag
```
$ git tag -l                                  (empty)
$ curl api.github.com/repos/ZanDev32/pioneer/tags   →  []
$ npm view @zandev32/pioneer version          → npm error 404
$ npm view @zandev32/pioneer dist-tags        → npm error 404
```

### E21 — working tree (no repository file changed by this verification)
```
$ git status --porcelain
?? .planning/.omp-checkpoint.json
?? .planning/.omp-next-action.json
?? .planning/.omp-task-results.json
?? .planning/.omp-ui-state.json
?? .planning/phases/03-distribution-testing/03-VERIFICATION.md
?? .planning/state.json

$ git diff --stat
(empty)
```
The five `.omp-*` / `state.json` files were already untracked before verification began; this report is the only file added. `dist/`, `coverage/`, `node_modules/` are gitignored, so `npm ci`/`npm run build`/`npm run test:coverage` left no tracked change.

## Key Links / Data-Flow

| From | To | Via | Status |
|------|----|-----|--------|
| `build.mjs` `define.__PIONEER_VERSION__` | `src/server.js:48` (help banner) + `:89` (`serverInfo.version`) | esbuild define | ✓ WIRED — E4/E9 both print `0.2.0-rc.1` |
| `package.json` `bin.pioneer` | `./dist/server.js` | npm bin link | ✓ WIRED — E3/E4 |
| `vitest.config.js` project globs | `test/unit`, `test/integration`, `test/protocol` | `test.projects` | ✓ WIRED — E5 |
| `coverage.thresholds` | CI `npm run test:coverage` | script | ✓ WIRED — E7 shows a failing floor exits 1 |
| `runPioCommand` export | every handler branch incl. `params.async` | `vi.mock('../utils.js')` | ✓ WIRED — E13 |
| `wrapToolError` | `{error:{code,message,data}}` | every integration test | ✓ WIRED — E13 |
| Protocol lane entry | `dist/server.js` | `spawn` + `StdioClientTransport` | ✓ WIRED — E5/E9 |
| `PIO_WORKSPACE_ROOT` / `--workspace` (read by `src/server.js`) | all three host fixtures + smoke checklist | template args/env | ✓ WIRED — E14, E15, `docs/host-smoke-test.md:89,162,192` |
| `GITHUB_REF_NAME` tag | version guard → `npm publish --provenance` | single job, ordered steps | ✓ WIRED in YAML (E16); never executed (E20) |
| `repository.url` | provenance attestation target | npm OIDC | ✓ WIRED (public repo exists, E12) |
| `NPM_TOKEN` secret | `NODE_AUTH_TOKEN` in the publish step only | step `env` | ✓ WIRED — E16 (single occurrence) |

Data-flow: no rendered value resolves to a static stub. The protocol assertions read the live bundle; the publish guard reads `npm pkg get version` at run time; the host tests read the real fixture files.

## Requirements Coverage

| Requirement | Claimed by | Status | Evidence |
|---|---|---|---|
| TS-1 MCP protocol compliance (stdio, tools registered before transport, JSON-RPC errors with structured data) | 03-02, 03-06 | ✓ SATISFIED | E9, E19; `test/protocol/stdio-smoke.test.js`. Note: REQUIREMENTS still says "MCP 2024-11-05"; D-28 supersedes it with the negotiated `2025-11-25`, asserted at `stdio-smoke.test.js:200-201` |
| TS-4 token-efficient diagnostics | 03-03 | ✓ SATISFIED | 100 % line coverage on `src/parsers.js`; dedup/merge tests E-9; integration error envelopes E13 |
| TS-5 build metadata extraction | 03-03 | ✓ SATISFIED | `test/unit/metadata.test.js` (duration, RAM/flash, `firmware.bin`/`.elf`, incremental cache) |
| NFR-1 performance: startup < 2 s, parsing < 100 ms/50 KB, bundle < 5 MB, 50 MB buffer | 03-01, 03-03, 03-06 | ✓ SATISFIED | `stdio-smoke.test.js:204` (< 2000 ms), parsers perf test (< 100 ms), 862 KB bundle, `src/utils.js:25` `maxBuffer ?? 50 * 1024 * 1024` |
| NFR-2 portability: SDK+zod only, Linux/macOS/Windows | 03-02, 03-03, 03-04, 03-05, 03-06 | ✓ SATISFIED, with honoured deviation | `dependencies` = exactly `@modelcontextprotocol/sdk`, `zod`; E17 green on 3 OS × 2 Node. Node floor is `>=22.12.0`, not the original "18+" — see Honoured deviations |
| NFR-3 safety: structured errors, workspace boundary, no blind retries | 03-04, 03-06 | ✓ SATISFIED | `PROJECT_OUTSIDE_WORKSPACE` enforced `src/errors.js:101`, tested `test/unit/errors.test.js:134`, `test/integration/monitor.test.js:218`; error envelopes E13 |
| Global SC #4: single-file bundle < 5 MB | — | ✓ SATISFIED | E3 |
| Global SC #6: "tests passing (port from extension repo: 233 tests)" | — | SUPERSEDED by D-08 | 142 fresh Vitest tests stand in; porting the 233 VS Code-mock tests is an explicit non-goal |

No orphaned requirements: every ID claimed by a plan maps to verified code, and no plan claims an ID absent from REQUIREMENTS.

## Anti-Patterns & Vacuity Checks

| File | Finding | Severity | Impact |
|---|---|---|---|
| `.github/workflows/ci.yml:129` | Publish gate checks only `github.ref`, never `github.event_name`. A `workflow_dispatch` run *on a tag ref* satisfies `startsWith(github.ref,'refs/tags/v')`, so the job starts; the tag/version guard then admits it, and npm refuses the republish. `pull_request` and branch pushes are correctly excluded | ⚠️ Warning | Contradicts the literal must-have #25; cannot publish a *new* version. One-line hardening: `if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')` |
| `test/unit/package.test.js:56` | `describe.skipIf(!bundleBuilt)` silently skips the ceiling/banner assertions when `dist/` is absent, and `npm test` has no build step (D-25). CI builds first, so the assertions ran here (E3) | ℹ️ Info | A local `npm ci && npm test` reports green without exercising the bundle |
| `.planning/phases/03-distribution-testing/03-VALIDATION.md` | Still `status: draft`, and its "Test Infrastructure" table asserts "Vitest 3.2.7 … D-14's matrix includes Node 18" — stale after the D-14 amendment (Vitest 5.1.0, Node 22/24) | ℹ️ Info | Documentation drift that would mislead a later reader; `validate-phase` was never run for this phase |
| `03-06-PLAN.md` key-links | Says the lockfile "pins Vitest 3.2.7 for the Node 18 lane" — same staleness, plan text only | ℹ️ Info | No code impact |
| `.planning/WINDOWS.md` | 2 open `deviation` entries, both matching the human-approved D-14 / esbuild amendments | ℹ️ Info | If `workflow.windows_enforce` is on, `/gsd-ship` will report `open_count: 2`; the human may waive them |

Stub scan: no `TBD`/`FIXME`/`XXX` in any phase-changed file (only a lockfile hash and a test's own regex contain the substring). No `.only`/`.todo`; the only `.skip` is the documented `skipIf` above. The `return null`/`return []` hits in `src/` are guard clauses (`check.js:36,41`, `workspace.js:57,101,116`, `monitor.js:91`), not stubs — each is reached by tests and coverage on those files is 72–100 %. No `continue-on-error`, no retry wrappers, no `npm publish` outside the single publish step.

Probe execution: **not applicable** — no `scripts/*/tests/probe-*.sh` in the repo and no 03-* plan declares a probe.

## Honoured Deviations (recorded, not defects)

1. **D-14 amended (human-approved this run).** `vitest@5.1.0` declares `^22.12.0 || ^24.0.0 || >=26.0.0`, so `engines.node` is `>=22.12.0` and the CI matrix is Node 22 + 24 instead of the original 18/20/22. Recorded in `.planning/WINDOWS.md` id 1 and in `03-01-SUMMARY.md:key-decisions`. NFR-2's "Node 18+" bullet is superseded accordingly.
2. **esbuild `^0.25.0` → `^0.28.2`**, required by the vite 8 peer of vitest 5.1.0 (`.planning/WINDOWS.md` id 2).
3. **`build.mjs` target stays `node18`** while `engines` is `>=22.12.0` — conservative output, runs on 22/24. No action needed.

## Gaps

No blocker. Automated must-haves are achieved; the two pending truths and one partial are listed below.

| Truth | Status | Why | Needed |
|---|---|---|---|
| #25 publish job "cannot be triggered by `workflow_dispatch`" | partial | The `if` inspects `github.ref` only; a dispatch on a tag ref starts the job. The tag/version guard plus npm's no-republish rule keep a *new* release impossible | Add `github.event_name == 'push' &&` to `.github/workflows/ci.yml:129`, or accept and amend the must-have |
| #31 RC published under `next` | pending | No tag pushed, no publish (E20); forbidden by this run's dispatch and gated behind host validation (D-06/D-26) | Human: push `v0.2.0-rc.1` after sign-off |
| #32 host validation recorded before `v0.2.0` | pending | Three-host GUI validation cannot run in a headless sandbox | Human: complete `docs/host-smoke-test.md` sign-off |

Deferred items: none — no later milestone phase claims the publish or host-validation work; Phase 4 ("Competitive Features") does not cover it.

## Human verification required

1. **Three-host RC validation — Claude Desktop, Cursor, VS Code.** Run `docs/host-smoke-test.md` against the build published under `next` for every host, then fill the sign-off table at lines 196-209. Expected: all three rows `PASS` — config file placed where that host reads it, `${workspaceFolder}` / `PIO_WORKSPACE_ROOT` resolve, the server starts and answers `tools/list`, a build completes. Why human: GUI host config placement, variable interpolation and startup behaviour are invisible from a headless sandbox. Milestone gate: needs roughly 45–60 minutes across the three hosts, and a failing host blocks the release.

2. **Publish the RC under `next`.** Push `v0.2.0-rc.1` (or run the pipeline with `npm publish --tag next`). Expected: `npm view @zandev32/pioneer dist-tags --json` → `{"next":"0.2.0-rc.1"}` only. This is also the only way to exercise the unrun publish path (`behavior_unverified_items`).

3. **Cut `0.2.0` only after sign-off.** `npm version 0.2.0` then push `v0.2.0`. Expected: `package.json` and `package-lock.json` both `0.2.0`, tag equals version, publish job moves `latest`.

4. **Decide the publish-trigger hardening** (Gaps, first row) before the first tag is pushed.

**Release state as verified (E20): there is NO `v0.2.0` tag — no tag at all, locally or on GitHub — `@zandev32/pioneer` returns 404 from the registry, no `next` dist-tag exists, and `latest` has not moved. Nothing was tagged, pushed, or published during this verification, and `git status --porcelain` shows no repository file modified apart from the pre-existing untracked GSD runtime JSON files.**

---

_Verified: 2026-11-12T07:36:34Z_
_Verifier: GSD verifier (Phase3Verifier, omp)_
