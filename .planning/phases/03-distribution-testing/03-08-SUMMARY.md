---
phase: 03-distribution-testing
plan: 08
subsystem: distribution
tags: [release, changelog, docs, verification, host-validation]
requires:
  - 03-07 tag-triggered publish job (dist-tag derivation, tag/version guard)
  - 03-05 host config fixtures
  - 03-02 changelog skeleton and package identity
provides:
  - "package version 0.2.0-rc.1 (package.json + package-lock.json)"
  - "filled 0.2.0 changelog section with an empty [Unreleased] above it"
  - "docs/host-smoke-test.md — the three-host milestone gate checklist"
affects:
  - ".github/workflows/ci.yml publish job (the RC version is what derives --tag next)"
  - "README host-configuration section (bare spec stays canonical from 0.2.0)"
tech-stack:
  added: []
  patterns:
    - "Keep a Changelog + SemVer with a link-reference block"
    - "milestone-gated manual checklist (D-20) with a per-host sign-off table"
key-files:
  created:
    - docs/host-smoke-test.md
  modified:
    - package.json
    - package-lock.json
    - CHANGELOG.md
decisions:
  - "Version written as 0.2.0-rc.1 by direct edit, not npm version: the dispatch forbids tag creation and pushing, so the RC tag is deferred to the publish step"
  - "CHANGELOG keeps the 0.2.0 heading with '- unreleased' until the final 0.2.0 publish; the compare refs already point at v0.2.0 so they resolve once the tag exists"
  - "Tarball contents left as files: [\"dist/\"] — test/unit/package.test.js pins that array, and npm's always-included README/LICENSE/package.json complete the allow-list"
metrics:
  duration: ~12 min
  completed: 2026-11-12T15:24:18+08:00
  tasks: 1 of 2 (task 2 is the human host gate)
  files_changed: 4
  commits: 2
plan_head_before: 0ab058de22bf978fb34531daedf96d822a654c46
plan_head_after: 13df99e
status: checkpoint
actuals:
  tokens: 2840
  tasks: 1
  commits: 2
---

# Phase 3 Plan 08: Release candidate cut and host smoke checklist Summary

Cut `0.2.0-rc.1` into `package.json` and `package-lock.json`, filled the `0.2.0`
changelog section (breaking rename, Vitest/protocol/CI/host-config additions, SDK 1.x
`registerTool` migration), and wrote `docs/host-smoke-test.md` — the milestone-gated
three-host checklist. Task 1 of 2 is complete; task 2 is the `blocking-human` host gate.

## Status: checkpoint, not released

- The RC version is written, but **no tag was created** (`v0.2.0-rc.1` does not exist) and
  **nothing was pushed or published** — `latest` has not moved, and `next` does not exist
  yet either. Tagging is the publish step's job (`git push origin HEAD v0.2.0-rc.1`),
  which this dispatch explicitly excluded.
- Task 2 (`checkpoint:human-verify gate=blocking-human`) has **not** been satisfied: no
  human has installed the RC in Claude Desktop, Cursor, or VS Code.
- The `docs/host-smoke-test.md` sign-off table is blank on purpose — it is the form the
  human fills in, not a stub.

## Acceptance evidence

### 1. Build and test suites green with the RC version in place

```
$ npm ci
added 231 packages in 1s
$ npm run build
Built dist/server.js successfully
$ npm test
 Test Files  16 passed (16)
      Tests  142 passed (142)
$ npm run test:protocol
 Test Files  1 passed (1)
      Tests  5 passed (5)
$ node dist/server.js --help

Pioneer v0.2.0-rc.1

Usage:
  pioneer [options]

Options:
  --workspace <path>   Set workspace root (default: PIO_WORKSPACE_ROOT env or cwd)
  --port <port>        Start HTTP server for remote MCP (default: stdio mode)
  --help, -h           Show this help message
```

The banner reads `Pioneer v0.2.0-rc.1`. Version fields:

```
$ node -p "require('./package.json').version"
0.2.0-rc.1
$ node -p "require('./package-lock.json').version+' / packages[\"\"]='+require('./package-lock.json').packages[''].version"
0.2.0-rc.1 / packages[""]=0.2.0-rc.1
```

### 2. `npm pack --dry-run`

```
📦  @zandev32/pioneer@0.2.0-rc.1
Tarball Contents
11.4kB LICENSE
5.1kB README.md
862.6kB dist/server.js
1.6kB package.json
Tarball Details
name: @zandev32/pioneer
version: 0.2.0-rc.1
filename: zandev32-pioneer-0.2.0-rc.1.tgz
package size: 170.4 kB
unpacked size: 880.6 kB
shasum: 14c3d9802499f7e482420bc7563c1892eeea3541
total files: 4
```

Only `dist/`, package metadata, `README`, and `LICENSE` — the allow-listed set. `CHANGELOG.md`
is **not** in the tarball: `files` is `["dist/"]` and `test/unit/package.test.js` asserts that
array, so shipping the changelog would be a test-breaking change outside this plan's files.

### 3. CHANGELOG.md head

```
# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - unreleased

### Breaking

- Published as the scoped package `@zandev32/pioneer`; the unscoped `pioneer` name is
  not published and the binary stays `pioneer`.

### Added

- `LICENSE` (Apache-2.0) ships in the package tarball, matching the `license` metadata.
- `prepublishOnly` build hook, so `dist/` is always present in the published artifact.
- Vitest suite: unit tests for the parsers, errors, metadata, and `TaskManager`, plus an
  integration layer over real `pio` invocations.
- Protocol lane (`npm run test:protocol`) that drives the built bundle through the MCP
  Inspector CLI, so the shipped artifact — not just the source — is exercised.
- CI matrix (`.github/workflows/ci.yml`): build and tests on Linux, macOS, and Windows
  across Node 22 and 24, a protocol job, and an opt-in end-to-end job.
- Host config fixtures for Claude Desktop, Cursor, and VS Code, and a host smoke-test
  checklist for milestone releases.
```

Link refs at the bottom:

```
[Unreleased]: https://github.com/ZanDev32/pioneer/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ZanDev32/pioneer/releases/tag/v0.2.0
```

Both point at the live repository (`https://github.com/ZanDev32/pioneer` → HTTP 200). Both
`.../releases/tag/v0.2.0` and `.../compare/v0.2.0...HEAD` return **404 today** because no
`v0.2.0` tag exists yet — the URLs are correct and resolve at tag time, not broken links.
No earlier release was ever tagged, so there is no `v0.1.0...v0.2.0` compare to link.

### 4. Working tree and tags

```
$ git status --porcelain --untracked-files=all | grep -v '^?? .planning/'
[end]
$ git tag --list | wc -l
0
```

Only the harness's untracked `.planning/*.json` state files remain; this plan's four files
plus the SUMMARY are the only changes. No tag was created.

## Checklist coverage (`docs/host-smoke-test.md`)

- Gate banner: milestone releases only (`v0.2.0`, `v1.0.0`), D-20 / D-06 / D-26 restated.
- Run section: the RC is `npx -y @zandev32/pioneer@next`, stated as the single sanctioned
  delta from the fixture blocks, with every other key copied byte for byte (T-3-07).
- Per host — Claude Desktop, Cursor, VS Code: exact config path for Linux/macOS/Windows, the
  paste-ready JSON with the `@next` pin, the reload instruction, and numbered checks for
  server presence, all 12 tools, `pio_list_devices`, `pio_build` structured JSON
  (`success`/`exit_code`/`diagnostics`/`summary`/`metadata`), and workspace resolution via
  `--workspace` or `PIO_WORKSPACE_ROOT`.
- Windows `npx` section: `npx.cmd` fallback, mandatory `-y`, escaped backslashes, and
  `pio_serial_start` → `PLATFORM_UNSUPPORTED` (-32010) as a required pass condition.
- VS Code no-MCP-roots section: `${workspaceFolder}` may arrive unsubstituted; replace with
  the literal absolute path and record which form was needed.
- Sign-off table: date, host, host version, OS, RC version, result, failing check, notes.

## Deviations from Plan

### 1. [Dispatch constraint] No `npm version`, no tag, no push, no publish

- **Found during:** Task 1, step 3
- **Issue:** The plan's step 3 runs `npm version 0.2.0-rc.1`, which writes the version and
  creates the `v0.2.0-rc.1` tag in one commit, and task 1's `<automated>` verify asserts
  `git tag --points-at HEAD` equals `v0.2.0-rc.1`.
- **Fix:** Wrote `0.2.0-rc.1` into `package.json` and both `package-lock.json` version
  fields by direct edit, committed as a normal commit, and created no tag. The dispatch
  forbids tag/push/publish/`gh` so that `latest` cannot move before the human gate.
- **Consequence:** that one assertion cannot pass yet, by design. `npm version` must still
  be the mechanism used when the RC tag is finally cut (D-05): tag the version commit, not
  this hand-edited one, so the tag and `npm pkg get version` cannot drift.
- **Files:** `package.json`, `package-lock.json`
- **Commit:** 13df99e

### 2. [Environment] npm 12 blocked esbuild's postinstall

- **Found during:** `npm ci`
- **Issue:** `npm warn install-scripts esbuild@0.28.2 (postinstall: node install.js)` — the
  install script was not run.
- **Impact:** none observed; `npm run build` produced `dist/server.js`. No action taken
  (approving install scripts is a local npm policy choice, not a repo change).
- **Commit:** n/a

### 3. [Scope] `CHANGELOG.md` is not in the published tarball

- **Found during:** `npm pack --dry-run`
- **Issue:** `files: ["dist/"]` means npm ships only `dist/`, `package.json`, `README.md`,
  and `LICENSE`; the changelog is never packed. `test/unit/package.test.js` asserts `files`
  deep-equals `["dist/"]`, and test edits were outside this dispatch's writes.
- **Disposition:** left as-is and recorded here. If the changelog should ship, add
  `"CHANGELOG.md"` to `files` **and** update that assertion in the same commit.

## Authentication Gates

None.

## Threat Flags

None — no new endpoints, auth paths, or file-access patterns; the checklist drives existing
tools only.

## Awaiting Human Validation (task 2)

1. Tag and push the RC: `git push origin HEAD v0.2.0-rc.1` from the release commit (the one
   `npm version 0.2.0-rc.1` writes — not this hand-edited commit), then confirm
   `npm view @zandev32/pioneer dist-tags --json` is exactly `{"next":"0.2.0-rc.1"}` and
   `npm view @zandev32/pioneer dist.attestations` is non-empty.
2. Install in Claude Desktop (config at `~/.config/Claude/claude_desktop_config.json`,
   `~/Library/Application Support/Claude/…`, `%APPDATA%\Claude\…`), Cursor
   (`~/.cursor/mcp.json`), and VS Code (`.vscode/mcp.json`), each with the fixture block
   and only the package spec changed to `@zandev32/pioneer@next`.
3. Complete every numbered check per host and record pass/fail in the sign-off table.
4. Only after all three pass: `npm version 0.2.0`, push commit + tag, and let the pipeline
   publish `0.2.0` as `latest`.

## Self-Check

- FOUND: package.json
- FOUND: package-lock.json
- FOUND: CHANGELOG.md
- FOUND: docs/host-smoke-test.md
- FOUND: fc43ef5
- FOUND: 13df99e
