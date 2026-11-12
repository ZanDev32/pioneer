---
phase: 03-distribution-testing
plan: 01
subsystem: distribution
tags: [vitest, esbuild, npm-pack, version-stamp, tarball]

requires: []
provides:
  - "Vitest 5.1.0 runner (unit 2s / integration 30s projects) replacing Jest"
  - "Build-time __PIONEER_VERSION__ stamp read by the help banner and MCP initialize response"
  - "Scoped package identity @zandev32/pioneer with files: ['dist/'] and a 3-file tarball"
  - "test/unit/package.test.js asserting identity, tarball allowlist, 5 MB ceiling, version banner"
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07, 03-08]

actuals:
  tokens: 76240
  tasks: 2
  commits: 1

tech-stack:
  added:
    - "vitest@5.1.0 (exact pin)"
    - "@vitest/coverage-v8@5.1.0 (exact pin)"
    - "esbuild ^0.28.2 (was ^0.25.0 — vite 8 peer requirement)"
  patterns:
    - "Vitest inline test.projects with per-directory timeouts (no vitest.workspace.*)"
    - "esbuild define constant for build-time version, single source = package.json"

key-files:
  created:
    - vitest.config.js
    - test/unit/package.test.js
  modified:
    - package.json
    - package-lock.json
    - build.mjs
    - src/server.js

key-decisions:
  - "D-14 amended (human-approved): engines.node >=22.12.0 because vitest 5.1.0 declares ^22.12.0 || ^24.0.0 || >=26.0.0. CI matrix becomes Node 22 + 24 in plan 03-06."
  - "Toolchain installed at vitest 5.1.0, not the researched 3.2.7 pin — human explicitly approved latest."
  - "Built-bundle assertions in test/unit/package.test.js are skipped when dist/server.js is absent, so npm test stays green on a clean checkout; CI/test gate builds first."

patterns-established:
  - "Version stamp: build.mjs reads package.json and defines __PIONEER_VERSION__; source never reads env at runtime."
  - "Package allowlist enforced twice: package.json files field + a packed-path assertion in test/unit."

requirements-completed: [NFR-1]

coverage:
  - id: D1
    description: "Packed tarball ships only dist/ plus package metadata, and the single-file bundle is under 5 MB"
    requirement: NFR-1
    verification:
      - kind: unit
        ref: "test/unit/package.test.js#packed tarball ships only dist/ plus package metadata"
        status: pass
      - kind: unit
        ref: "test/unit/package.test.js#built bundle is a single file under the 5 MB ceiling"
        status: pass
  - id: D2
    description: "Built bundle reports package.json version in --help and MCP initialize"
    verification:
      - kind: unit
        ref: "test/unit/package.test.js#built bundle reports the package.json version in the help banner"
        status: pass
      - kind: other
        ref: "printf initialize JSON | node dist/server.js -> serverInfo.version 0.1.0"
        status: pass

duration: 4min
completed: 2026-11-12
status: complete
plan_head_before: 0e5174c5c59d43d3285904d6c4f703b6f34db65d
plan_head_after: 6c5bac7866bdfef08dba6361f3fe9d70d03f91e7
---

# Phase 3 Plan 01: Distribution Chain (tracer) Summary

Pinned Vitest 5.1.0 toolchain, stamped the bundle version at build time, and proved via `test/unit/package.test.js` that `npm pack` ships only `dist/` + metadata and the bundle stays under 5 MB.

## Performance

- **Duration:** 4min
- **Started:** 2026-11-12T05:56:54Z
- **Completed:** 2026-11-12T05:59:31Z
- **Tasks:** 2 (1 pre-approved checkpoint + 1 tracer)
- **Files modified:** 6

## Accomplishments

- Jest removed; `npm test` is `vitest run --project unit --project integration` with no `--experimental-vm-modules` anywhere.
- `vitest.config.js` declares inline projects `unit` (2000 ms) and `integration` (30000 ms) plus v8 coverage scoped to `src/**/*.js` excluding `src/server.js`.
- `package.json`: name `@zandev32/pioneer`, `files: ["dist/"]`, `engines.node >=22.12.0`, four Vitest scripts.
- `build.mjs` defines `__PIONEER_VERSION__` from package.json; `src/server.js` reads it in the `--help` banner and the `McpServer` version field (no `process.env.npm_package_version` left).
- `test/unit/package.test.js`: asserts scoped identity, bin target, files allowlist, no vm-modules flag, packed path allowlist, `dist/server.js` presence + < 5 MB, and help-banner version.
- Tarball shrank from 60 files to 3: `README.md`, `dist/server.js` (845.5 kB), `package.json`.

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | Confirm pinned test toolchain (checkpoint, pre-approved by human) | — (no code) |
| 2 | End-to-end: identity → stamped bundle → tarball assertion | `6c5bac7` |

## Files Created/Modified

- **Created:** `vitest.config.js` — two inline projects with per-directory timeouts; v8 coverage config.
- **Created:** `test/unit/package.test.js` — identity, packed-path, bundle-size, and version assertions.
- **Modified:** `package.json` — scoped name, `files`, engines floor, Vitest scripts, toolchain pins.
- **Modified:** `package-lock.json` — jest tree removed, vitest/vite/esbuild tree added.
- **Modified:** `build.mjs` — reads package.json, passes `define.__PIONEER_VERSION__`.
- **Modified:** `src/server.js` — two version reads now use the build-time constant.

## Decisions Made

- **D-14 amended (approved):** `engines.node` raised `>=18.0.0` → `>=22.12.0` for vitest 5.1.0. CI matrix becomes Node 22 + 24 in plan 03-06.
- Toolchain pinned to `vitest@5.1.0` / `@vitest/coverage-v8@5.1.0` (human override of the 3.2.7 research pin), both exact.
- Built-bundle assertions (`skipIf(!existsSync(dist/server.js))`) keep `npm test` green before a build; the plan's `<automated>` gate builds first so they always run in CI-order.

## Deviations from Plan

### Pre-approved checkpoint

**Task 1 — `checkpoint:human-verify gate="blocking-human"`: approved by the human before execution.**
- ⚡ checkpoint pre-approved by human (vitest 5.1.0 + Node floor 22.12).
- Plan said install `vitest@3.2.7`; human amended to `5.1.0` for both packages.
- Plan said keep engines as-is (Node 18 lane per D-14); amended to `>=22.12.0`.
- Plan 03-06 owns `.github/workflows/ci.yml`; not touched here.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] esbuild devDependency bumped `^0.25.0` → `^0.28.2`**
- **Found during:** Task 2 install.
- **Issue:** `npm i -D vitest@5.1.0 @vitest/coverage-v8@5.1.0` failed with ERESOLVE: vitest 5.1.0 → vite 8 → `peerOptional esbuild@^0.27.0 || ^0.28.0`, conflicting with the pinned `esbuild@0.25.12`.
- **Fix:** `npm i -D esbuild@^0.28.0` first (0.28.2 resolved), then installed the Vitest pair. `npm run build` verified working.
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** `6c5bac7`

## Verification (observed)

1. **Install:** `npm install` → `up to date in 550ms`, exit 0. `npm ls` →
   ```
   @zandev32/pioneer@0.1.0
   ├── @vitest/coverage-v8@5.1.0
   └── vitest@5.1.0
   ```
   npm warns esbuild's postinstall is blocked by `allowScripts`, but the binary resolves and builds fine.
2. **Build:** `npm run build` → `Built dist/server.js successfully`, exit 0.
3. **Help banner:** `node dist/server.js --help | grep Pioneer` → `2:Pioneer v0.1.0`.
   **MCP initialize:** `printf '{"jsonrpc":"2.0","id":1,"method":"initialize",...}' | node dist/server.js` →
   `"serverInfo":{"name":"pioneer","version":"0.1.0","capabilities":{"logging":{}...`
4. **Tests:** `npm test` → `Test Files 1 passed (1) | Tests 5 passed (5)`, exit 0. Targeted gate
   `npm run build && npx vitest run test/unit/package.test.js` → `Tests 5 passed (5)`, exit 0.
5. **Tarball:** `npm pack --dry-run` →
   ```
   Tarball Contents
   3.5kB README.md
   845.5kB dist/server.js
   1.3kB package.json
   total files: 3
   ```

## Issues Encountered

- npm ERESOLVE between vitest 5.1.0's vite 8 and esbuild ^0.25 — resolved by the esbuild bump above.
- npm 12 blocks esbuild's postinstall (`allowScripts`); non-blocking — esbuild 0.28.2 binary works, build and tests pass.

## User Setup Required

None.

## Known Stubs

None. `test/integration` is intentionally empty until wave-2 plans add integration tests; Vitest exits 0 with the unit project populated.

## Next Phase Readiness

- Tracer chain proven: identity → stamp → bundle → tarball. Later plans can expand unit/integration coverage without re-litigating packaging.
- Plan 03-06 must use Node 22 + 24 (D-14 amended) and may need to allow esbuild's install script in CI (`npm install-scripts approve esbuild` equivalent) if the runner enforces `allowScripts`.
- Coverage thresholds deliberately absent — plan 03-04 sets the floors.

## Self-Check: PASSED

- `vitest.config.js` FOUND
- `test/unit/package.test.js` FOUND
- commit `6c5bac7` FOUND on HEAD
- working tree has only orchestrator state files untracked (`.planning/.omp-*.json`, `.planning/state.json`)
