---
phase: 03-distribution-testing
plan: 02
subsystem: distribution
tags: [mcp-sdk, registry, licensing, changelog, publishing]
requirements: [TS-1, NFR-2]
requirements-completed: [TS-1, NFR-2]

requires:
  - phase: 03-distribution-testing (plan 03-01)
    provides: version stamping, dist-only tarball, vitest runner, esbuild build
provides:
  - All 12 MCP tools registered through `registerTool(name, { description, inputSchema }, handler)`
  - `@modelcontextprotocol/sdk` pinned to `^1.32.2` (resolved 1.32.2) in package.json + lockfile
  - Release metadata: repository/bugs/homepage, publishConfig.access=public, prepublishOnly build hook
  - CHANGELOG.md (Keep a Changelog) and Apache-2.0 LICENSE
affects: [03-03 integration lane, 03-04 seam refactor, 03-05 host docs, 03-07 publish workflow/provenance, 03-08 release notes]

actuals:
  tokens: 9590
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "registerTool(name, { description, inputSchema }, cb) with a raw Zod shape, never a JSON schema"
    - "release metadata lives in package.json (publishConfig/prepublishOnly) rather than release tooling"

key-files:
  created:
    - CHANGELOG.md
    - LICENSE
  modified:
    - package.json
    - package-lock.json
    - src/tasks.js
    - src/tools/build.js
    - src/tools/upload.js
    - src/tools/clean.js
    - src/tools/discover.js
    - src/tools/check.js
    - src/tools/monitor.js
    - src/tools/test.js

key-decisions:
  - "SDK pin `^1.32.2` kept on the 1.x line; 2.x deferred per D-29 (registry latest for the scoped package is 1.32.2)"
  - "Descriptions and Zod shapes preserved verbatim; only the argument structure changed (positional -> config object)"
  - "`prepublishOnly: npm run build`, deliberately not `prepare`, so consumer installs and `npm ci` never rebuild"
  - "LICENSE keeps the canonical Apache-2.0 appendix placeholders rather than inventing a copyright holder line"
  - "CHANGELOG 0.2.0 section states only changes already true at HEAD; 03-08 completes the release-specific entries"
  - "CHANGELOG.md is not added to the `files` allowlist (npm does not auto-include it); the changelog entry claims only LICENSE ships in the tarball"

patterns-established:
  - "Tool registration: one `registerTool` call per tool with `{ description, inputSchema: <raw zod shape> }`"
  - "Release metadata is verified by a `node -e` assertion over package.json plus file-existence greps, not prose"

coverage:
  - id: D1
    description: "All 12 tools register through the non-deprecated `registerTool` API on SDK 1.32.2 and the built server lists them over stdio"
    requirement: TS-1
    verification:
      - kind: integration
        status: pass
  - id: D2
    description: "Release metadata is publish-ready: repository identity, public publishConfig, prepublish build hook, Apache-2.0 LICENSE, Keep a Changelog CHANGELOG.md"
    requirement: NFR-2
    verification:
      - kind: automated
        status: pass
    human_judgment: false

metrics:
  duration: 12min
  completed: 2026-11-12
status: complete
plan_head_before: 06e9af6e5767271580e60f2d508cfc4d4bbdd20b
plan_head_after: eb220e3b3c265ce539a08eda52203db96622cf0e
---

# Phase 03 Plan 02: SDK 1.x migration and release metadata

**All 12 tool registrations moved to `registerTool` on a pinned SDK 1.32.2, and the package now carries the repository identity, Apache-2.0 LICENSE, changelog, and publish-time build hook that publishing depends on.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-11-12T14:05Z (worktree session start)
- **Completed:** 2026-11-12T14:08:49+08:00
- **Tasks:** 2 of 2 executed (task 1 checkpoint pre-approved by the human)
- **Files modified:** 12 (10 in task 2, 3 in task 3 with package.json shared)

## Accomplishments

- Migrated all 12 `server.tool(...)` call sites (1 each in `build/upload/clean/check/test`, 2 in `discover`, 3 in `monitor`, 2 in `tasks`) to `server.registerTool(name, { description, inputSchema }, handler)` with descriptions and Zod shapes preserved exactly.
- Bumped `@modelcontextprotocol/sdk` from `^1.12.1` (locked 1.29.0) to `^1.32.2` (resolved 1.32.2) — the current latest 1.x, as confirmed against the registry before the checkpoint was pre-approved.
- Completed release metadata: `repository`/`bugs`/`homepage` now name `github.com/ZanDev32/pioneer`, `publishConfig.access = "public"`, `prepublishOnly` runs the build, and full Apache-2.0 `LICENSE` + Keep a Changelog `CHANGELOG.md` exist.

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm the MCP SDK 1.x pin before installing it** — checkpoint, no commit. Pre-approved by the human (registry evidence: `@modelcontextprotocol/sdk` dist-tag `latest` = 1.32.2, no 2.x line, publisher `@modelcontextprotocol`).
2. **Task 2: Migrate the 12 registrations to `registerTool` on the pinned 1.x SDK** — `53b2d8b` (feat)
3. **Task 3: Add release metadata: changelog, license, repository, publish build hook** — `eb220e3` (docs)

**Plan metadata:** SUMMARY commit (this file; no STATE/ROADMAP writes — the orchestrator owns those for this wave).

## Verification (observed)

Clean-room, all run inside the plan worktree after the two commits landed:

```text
$ npm ci && npm run build
Built dist/server.js successfully

$ node dist/server.js --help
Pioneer v0.1.0
Usage:
  pioneer [options]

$ node /tmp/list-tools.mjs          # SDK Client + StdioClientTransport against dist/server.js
server: {"name":"pioneer","version":"0.1.0"}
count: 12
- pio_task_status (schema keys: task_id)
- pio_task_list (schema keys: none)
- pio_build (schema keys: environment,verbose,build_only,include_memory,incremental,async)
- pio_upload (schema keys: environment,port,verbose,async)
- pio_clean (schema keys: environment,verbose)
- pio_list_devices (schema keys: filter)
- pio_list_boards (schema keys: none)
- pio_serial_start (schema keys: environment,port,baud)
- pio_serial_stop (schema keys: task_id,delete_log)
- pio_serial_read (schema keys: task_id,log_file,lines,search_pattern)
- pio_check (schema keys: environment,tool,severity,verbose)
- pio_run_tests (schema keys: environment,filter,timeout_seconds,verbose,async)

$ grep -rn 'server\.tool(' src/
(no output — 0 deprecated call sites)

$ grep -rn 'registerTool(' src/ | wc -l
12

$ npm test
Test Files  1 passed (1)
     Tests  5 passed (5)

$ node -e "const p=require('./package.json');const ok=p.repository.url==='https://github.com/ZanDev32/pioneer'&&p.publishConfig.access==='public'&&p.scripts.prepublishOnly==='npm run build';process.exit(ok?0:1)"
(exit 0)

$ test -f CHANGELOG.md && test -f LICENSE && grep -q '^## \[Unreleased\]' CHANGELOG.md && head -2 LICENSE | grep -q 'Apache License'
(exit 0)

$ npm pack --dry-run
npm notice 11.4kB LICENSE
npm notice 3.5kB  README.md
npm notice 861.9kB dist/server.js
npm notice 1.5kB  package.json
```

`LICENSE` is 201 lines of canonical Apache-2.0 text (header through the appendix box), copied byte-identically from a known-good Apache-2.0 `LICENSE` in the dependency tree and diff-verified against it.

## Files Created/Modified

- `package.json` — SDK pin `^1.32.2`; `repository.url`/`bugs`/`homepage` → `github.com/ZanDev32/pioneer`; `publishConfig.access: "public"`; `scripts.prepublishOnly: "npm run build"`.
- `package-lock.json` — SDK 1.29.0 → 1.32.2 with the registry integrity hash.
- `src/tasks.js` (2), `src/tools/discover.js` (2), `src/tools/monitor.js` (3), `src/tools/build.js`, `src/tools/upload.js`, `src/tools/clean.js`, `src/tools/check.js`, `src/tools/test.js` — positional `server.tool(...)` → `server.registerTool(name, { description, inputSchema }, handler)`.
- `CHANGELOG.md` (created) — Keep a Changelog preamble, `## [Unreleased]`, `## [0.2.0]` with Breaking/Added/Changed, link-reference block pinned to the new repo.
- `LICENSE` (created) — full Apache-2.0 text matching `"license": "Apache-2.0"`.

## Decisions Made

- **SDK stays on the 1.x line.** `^1.32.2` is the registry latest for `@modelcontextprotocol/sdk`; D-29 defers any 2.x adoption, so no 2.x package was installed, referenced, or imported.
- **Raw Zod shapes kept.** `inputSchema` receives the original object literal (`{ task_id: z.string()... }`), never a converted JSON schema, so hosts see byte-identical tool schemas apart from nothing at all — verified via `tools/list` property keys.
- **`prepublishOnly`, not `prepare`.** `prepare` would rebuild on every `npm ci` and every consumer install; `prepublishOnly` only fires on the publish path (plan-specified).
- **CHANGELOG filled from facts, not stubs.** The 0.2.0 section lists changes already true at HEAD (scoped publish, SDK/`registerTool`, Node floor, repo URLs); 03-08 owns version-specific release notes.
- **No `files` change for CHANGELOG.** npm does not auto-include `CHANGELOG.md`; rather than widen the tarball allowlist (03-01's contract), the changelog wording states only that LICENSE ships.

## Deviations from Plan

None functionally — plan executed as written, with two cosmetic notes:

1. The mechanical conversion also re-indented the schema literals by two spaces (they are now nested inside `inputSchema`) and dropped the trailing comma after each handler. No token, description, field name, `.optional()`, or `.default()` changed; `tools/list` confirms identical property sets.
2. Task 1 (`checkpoint:human-verify`, `gate="blocking-human"`) was pre-approved by the human with registry evidence supplied before execution — logged as `⚡ checkpoint pre-approved by human (SDK 1.32.2 = registry latest)`; no checkpoint message was returned.

**Total deviations:** 0 auto-fixed (no Rule 1-3 triggers).
**Impact on plan:** none.

## Issues Encountered

- `npm ci` reports esbuild's postinstall script blocked by the local allowScripts policy; the esbuild binary still resolves and `node build.mjs` builds successfully. Pre-existing environment behavior, not caused by this plan.

## Threat Flags

None — no new endpoints, auth paths, file-access patterns, or trust-boundary schema changes. T-3-08 (repository spoofing via `repository.url`) is mitigated here: the URL now names the publishing repo, so `--provenance` attests the intended source.

## Known Stubs

None. `CHANGELOG.md`'s 0.2.0 release notes are intentionally completed in 03-08, but the file itself carries accurate content for every change that has landed.

## Self-Check: PASSED

- FOUND: `package.json` (`repository.url`, `bugs.url`, `homepage`, `publishConfig.access`, `scripts.prepublishOnly`)
- FOUND: `CHANGELOG.md`, `LICENSE` (201 lines, Apache-2.0)
- FOUND: `53b2d8b` (ancestor of HEAD), `eb220e3` (HEAD)
- FOUND: 0 `server.tool(` sites, 12 `registerTool(` sites
- FOUND: `npm test` 5/5 green after `npm ci`
