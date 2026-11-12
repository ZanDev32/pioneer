---
phase: 03-distribution-testing
plan: 06
subsystem: testing
tags: [vitest, mcp, stdio, protocol, github-actions, ci, matrix, platformio, e2e]

requires:
  - phase: 03-distribution-testing
    provides: "03-03 unit lane, 03-04 async executor seam and integration lane, 03-05 host config fixtures"
provides:
  - "test/protocol/stdio-smoke.test.js — the only lane that spawns dist/server.js over stdio"
  - "`protocol` vitest project and `npm run test:protocol` (build + lane)"
  - ".github/workflows/ci.yml with test / protocol / e2e jobs"
  - "`npm run test:e2e` opt-in gate over test/uat-sesaiotnode.mjs"
affects: [03-07 publish workflow, 03-08 release flow]

actuals:
  tokens: 6345
  tasks: 3
  commits: 5
  plan_head_before: 92649d9643624e26dd813b9ec76c7cbc3ba7084e
  plan_head_after: ddf5b2a41160b1a3dd160d19038460fbf3dba1f3

tech-stack:
  added: ["@modelcontextprotocol/inspector@2.14.0 (CI-only, via npx --yes)", "actions/checkout@v7", "actions/setup-node@v7", "actions/setup-python@v6", "actions/cache@v4"]
  patterns:
    - "Protocol assertions run against the built artifact, never src/"
    - "One raw NDJSON frame for initialize; SDK client for everything else"
    - "OS-dependent lane depth via `if: runner.os` instead of per-OS jobs"

key-files:
  created:
    - test/protocol/stdio-smoke.test.js
    - .github/workflows/ci.yml
  modified:
    - vitest.config.js
    - package.json
    - test/uat-sesaiotnode.mjs
    - .planning/phases/03-distribution-testing/03-06-PLAN.md

key-decisions:
  - "CI matrix is 3 OS × Node 22/24, not the plan's stale 18/20/22 — vitest 5.1.0 needs ^22.12.0 and engines.node is >=22.12.0 (human's D-14 amendment)."
  - "The protocol lane FAILS when dist/server.js is absent instead of skipping, so a bare `vitest run --project protocol` can never pass vacuously."
  - "Error assertions use the numeric code -32001 (ERROR_CODES.PROJECT_NOT_FOUND); the wire payload never carries the symbolic name."
  - "The UAT script's declared tool coverage was narrowed to what it actually exercises (serial stop/read live in the integration lane)."

patterns-established:
  - "Artifact lane: build → spawn dist/server.js with process.execPath + args array (Windows-safe), assert the wire contract, always kill in teardown."
  - "Opt-in jobs: gate on `github.event_name == 'workflow_dispatch'` AND a repo variable, never the variable alone."

requirements-completed: [TS-1, NFR-1, NFR-2, NFR-3]

coverage:
  - id: D1
    description: "Protocol lane spawns the built bundle over stdio and asserts initialize (protocolVersion + serverInfo + <2000 ms), the 12-tool surface with object input schemas, pio_task_list empty result, and pio_build PROJECT_NOT_FOUND."
    requirement: TS-1
    verification:
      - kind: integration
        ref: "npm run test:protocol → 1 file / 5 tests passed, exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "CI workflow runs the 3-OS × Node 22/24 matrix with the D-21 depth split, PlatformIO install and runner.os-keyed caches on the Linux lane."
    requirement: NFR-2
    verification:
      - kind: other
        ref: "python3 yaml load + matrix assertion → Node: [22, 24], 6 legs; grep '(18|20)' → 0 matches"
        status: pass
    human_judgment: false
  - id: D3
    description: "Protocol job pins Inspector 2.14.0 for tools/list and tools/call; e2e job is manual-dispatch-gated; UAT script exits 0 when PIO_E2E != 1."
    requirement: NFR-3
    verification:
      - kind: other
        ref: "grep -c '@modelcontextprotocol/inspector@2.14.0' → 2; `npm run test:e2e` → exit 0 with skip line"
        status: pass
    human_judgment: false
---

# Phase 3 Plan 6: Protocol Lane and CI Pipeline Summary

Spawns the shipped `dist/server.js` over stdio to prove the MCP wire contract, then wires a 3-OS × Node 22/24 GitHub Actions matrix around it — full suite + coverage on Linux, unit-only elsewhere — with a pinned Inspector job and a dispatch-only e2e gate.

## Performance

- **Duration:** ~6 min
- **Started:** 2026-11-12T06:27:00Z
- **Completed:** 2026-11-12T06:33:00Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- The only lane that exercises the artifact consumers run: `test/protocol/stdio-smoke.test.js` spawns `dist/server.js` via `process.execPath` + an args array (Windows-safe, `shell: false`), asserts `protocolVersion: '2025-11-25'`, `serverInfo { name: 'pioneer', version: '0.1.0' }`, the 12-tool surface with `inputSchema.type === 'object'`, `pio_task_list → { running_tasks: [], count: 0 }`, and `pio_build` against an empty workspace → the structured `PROJECT_NOT_FOUND` (`-32001`) payload.
- NFR-1's startup bullet is measured on the artifact: the same spawn that performs the `initialize` round-trip asserts `elapsedMs < 2000`.
- `.github/workflows/ci.yml` exists with explicit `on:` triggers, a 6-leg matrix (3 OS × Node 22/24), the D-21 depth split, and D-15/D-16 PlatformIO install + caches.
- The protocol job pins `@modelcontextprotocol/inspector@2.14.0` on both invocations (T-3-02), and the e2e job is gated on `github.event_name == 'workflow_dispatch'` **and** `vars.PIO_E2E_PROJECT != ''`.
- `test/uat-sesaiotnode.mjs` became a real opt-in gate: `PIO_E2E_PROJECT` override, `PIO_E2E !== '1'` → explanatory exit 0, `npm run test:e2e` script.

## Task Commits

Each task was committed atomically:

1. **Task 1: Protocol lane against the built bundle** — `e20b0c7` (feat)
2. **Task 2: CI test matrix with PlatformIO install and caches** — `2e4b40b` (ci)
3. **Task 3: Protocol and opt-in e2e jobs** — `66beb11` (ci)
4. **Plan assertion reconciliation (deviation follow-up)** — `44245d1` (docs)
5. **UAT coverage-claim reconciliation (deviation follow-up)** — `ddf5b2a` (docs)

## Files Created/Modified

- `test/protocol/stdio-smoke.test.js` — protocol lane (5 tests)
- `vitest.config.js` — `protocol` project (`test/protocol/**/*.test.js`, 30000 ms); `unit`/`integration` untouched, coverage still excludes protocol (D-25)
- `package.json` — `test:protocol` (`npm run build && vitest run --project protocol`), `test:e2e`
- `.github/workflows/ci.yml` — `test` / `protocol` / `e2e` jobs
- `test/uat-sesaiotnode.mjs` — env-driven root, opt-in gate, truthful coverage claim
- `.planning/phases/03-distribution-testing/03-06-PLAN.md` — matrix assertion reconciled to Node 22/24 (see Deviations)

## Decisions Made

- **Node 22/24, not 18/20/22.** The human amended D-14 this run: vitest 5.1.0 requires `^22.12.0 || ^24.0.0 || >=26.0.0` and `engines.node` is `>=22.12.0`. The matrix carries unquoted `[22, 24]`; `18` and `20` appear nowhere in the workflow.
- **Loud failure instead of skip when `dist/` is missing.** `<behavior>` said "skips with a clear message", but the task's own `<fails_when>` rejects "a skip message because `dist/server.js` is missing", and the ticket requires the failure. `beforeAll` throws with the build command; verified once by removing `dist/` (evidence 4).
- **Numeric error code.** Handlers emit `{ error: { code: -32001, message, data } }`; the test asserts `-32001`, the message regex, and `data.projectDir === workspace`.
- **UAT coverage claim narrowed.** The script referenced 10 of the 12 tool names; `pio_serial_read`/`pio_serial_stop` need a live device and are covered by `test/integration/monitor.test.js`. Header and report row now say so rather than claiming "all 12".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Stale plan assertion] Matrix check expected Node 18/20/22**
- **Found during:** Task 2
- **Issue:** The plan's `<automated>` yaml check asserted `sorted(node) == [18,20,22]`, which contradicts the amended D-14 and would fail against the shipped workflow.
- **Fix:** Updated the plan's own check to `[22, 24]` and reconciled the surrounding stale text (`must_haves` truth, `requirements_addressed` NFR-2, task 2 `done`, task 3's "18/20/22 matrix" aside).
- **Files modified:** `.planning/phases/03-distribution-testing/03-06-PLAN.md`
- **Commit:** `44245d1`

**2. [Rule 1 - Stale claim] UAT script claimed all 12 tools**
- **Found during:** Task 3
- **Issue:** Header said "Tests all 12 MCP tools"; the body exercises serial start only, and never read/stop.
- **Fix:** Header and report row now describe the actual surface, pointing serial stop/read at the integration lane.
- **Files modified:** `test/uat-sesaiotnode.mjs`
- **Commit:** `ddf5b2a`

### Plan-level amendment (human-directed)

**3. CI matrix is Node 22/24, not 18/20/22**
- **Source:** human's D-14 amendment in this run's dispatch context (vitest 5.1.0 engine range, `engines.node: ">=22.12.0"`).
- **Effect:** 6 legs instead of 9; coverage still on the Node 22 leg only; `18`/`20` absent from the workflow (grep-proven below).
- **Already recorded** in `.planning/WINDOWS.md` by the human; not re-appended.

### Intentional behavioral choice

**4. Missing-artifact behavior is fail, not skip**
- Plan `<behavior>` says skip; task `<fails_when>` and the ticket demand failure. Failure wins. Documented above.

## Acceptance Evidence

### 1. `npm ci` → `npm run build` → `npm run test:protocol`

```
added 231 packages in 1s
Built dist/server.js successfully

 RUN  v5.1.0 /home/zandev32/.omp/wt/t2a86630bf/m

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  14:31:09
   Duration  406ms (tests 69%, import 24%, transform 6%, worker 1%)

PROTOCOL_EXIT=0
```

The 12 tool names asserted by the lane (`EXPECTED_TOOLS`, sorted, compared against `tools/list`):

```
pio_build, pio_check, pio_clean, pio_list_boards, pio_list_devices, pio_run_tests,
pio_serial_read, pio_serial_start, pio_serial_stop, pio_task_list, pio_task_status, pio_upload
```

### 2. `npm test` unchanged

```
 RUN  v5.1.0 /home/zandev32/.omp/wt/t2a86630bf/m

 Test Files  16 passed (16)
      Tests  142 passed (142)
   Start at  14:30:57
   Duration  704ms (transform 47%, tests 34%, import 17%, worker 2%)
```

The protocol project is not reachable from `npm test` or `npm run test:coverage` (both still select `--project unit --project integration`).

### 3. Workflow in full

```yaml
name: CI

on:
  push:
    branches: [master]
    tags: ['v*']
  pull_request:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    name: test (${{ matrix.os }}, node ${{ matrix.node }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [22, 24]
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Set up Node.js
        uses: actions/setup-node@v7
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'

      - name: Set up Python
        if: runner.os == 'Linux'
        uses: actions/setup-python@v6
        with:
          python-version: '3.12'

      - name: Install PlatformIO
        if: runner.os == 'Linux'
        run: pip install platformio

      - name: Cache pip and PlatformIO
        if: runner.os == 'Linux'
        uses: actions/cache@v4
        with:
          path: |
            ~/.cache/pip
            ~/.platformio/.cache
          key: ${{ runner.os }}-pip-pio-${{ hashFiles('package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-pip-pio-

      - name: Install dependencies
        run: npm ci

      - name: Build bundle
        run: npm run build

      - name: Full suite
        if: runner.os == 'Linux'
        run: npm test

      - name: Coverage floors
        if: runner.os == 'Linux' && matrix.node == 22
        run: npm run test:coverage

      - name: Unit suite
        if: runner.os != 'Linux'
        run: npm run test:unit

  protocol:
    name: protocol (inspector)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Set up Node.js
        uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build bundle
        run: npm run build

      - name: Inspector tools/list
        run: npx --yes @modelcontextprotocol/inspector@2.14.0 --cli node dist/server.js --method tools/list

      - name: Inspector tools/call
        run: npx --yes @modelcontextprotocol/inspector@2.14.0 --cli node dist/server.js --method tools/call --tool-name pio_task_list

  e2e:
    name: e2e (manual)
    if: github.event_name == 'workflow_dispatch' && vars.PIO_E2E_PROJECT != ''
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Set up Node.js
        uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: 'npm'

      - name: Set up Python
        uses: actions/setup-python@v6
        with:
          python-version: '3.12'

      - name: Install PlatformIO
        run: pip install platformio

      - name: Install dependencies
        run: npm ci

      - name: Run e2e UAT
        run: PIO_E2E=1 npm run test:e2e
        env:
          PIO_E2E_PROJECT: ${{ vars.PIO_E2E_PROJECT }}
```

YAML load proof and matrix assertion:

```
$ python3 -c "import yaml;d=yaml.safe_load(open('.github/workflows/ci.yml'));m=[j['strategy']['matrix'] for j in d['jobs'].values() if 'strategy' in j];assert any(sorted(x.get('os',[]))==['macos-latest','ubuntu-latest','windows-latest'] and sorted(x.get('node',[]))==[22,24] for x in m),'matrix mismatch'"

OS  : ['ubuntu-latest', 'macos-latest', 'windows-latest']
Node: [22, 24] (types: ['int', 'int'] )
legs: 6
```

Trigger block as parsed (PyYAML maps `on` to `True`):

```
{'push': {'branches': ['master'], 'tags': ['v*']}, 'pull_request': {'branches': ['master']}, 'workflow_dispatch': None}
```

Node 18/20 absence proof:

```
$ grep -cE '(^|[^0-9])(18|20)([^0-9]|$)' .github/workflows/ci.yml
0
```

### 4. Failure when `dist/` is absent (no vacuous pass)

```
$ rm -rf dist && npx vitest run --project protocol
 ❯ |protocol| test/protocol/stdio-smoke.test.js (5 tests | 5 skipped) 5ms

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |protocol| test/protocol/stdio-smoke.test.js > protocol: built bundle over stdio
Error: dist/server.js is missing — run `npm run build` (or `npm run test:protocol`) before this lane. Looked for: /home/zandev32/.omp/wt/t2a86630bf/m/dist/server.js
 ...
 Test Files  1 failed (1)
      Tests  5 skipped (5)

vitest exit=1
```

`npm run build` was re-run afterwards and the lane passed again.

### 5. No absolute local paths, `$HOME`, or `sudo` in ci.yml

```
$ grep -nE 'sudo|\$HOME|/home/|/Users/' .github/workflows/ci.yml
grep_exit=1 (1 = none found)
```

Only `~/.cache/pip` and `~/.platformio/.cache` are used as cache paths, as D-16 specifies.

### Plan verifies (all five `<automated>` checks)

```
V1 matrix ok
V2 install/lane/cache ok
V3 jobs ok
V4 inspector pin ok
V5 triggers ok
```

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: supply-chain | .github/workflows/ci.yml | `npx --yes @modelcontextprotocol/inspector@2.14.0` fetches and executes a registry package inside CI (T-3-02). Mitigated by the exact version pin on both invocations and exit-code enforcement; no devDependency, so `npm ci` runs no Inspector `postinstall`. |

## Known Stubs

None. `dist/server.js` is a build artifact, not a stub; the protocol lane builds it before running.

## Issues Encountered

- `npm ci` reports `esbuild@0.28.2` postinstall blocked by the local `allowScripts` policy; `node build.mjs` still succeeds because the platform binary package is installed. CI runs `npm ci` unblocked, so this is local tooling only.

## Next Phase Readiness

- Green basis for 03-07: the workflow already triggers on `v*` tags, so the publish job only needs its own `if:` and `id-token` scoping. `permissions: contents: read` is the current default and 03-07 must widen only for its own job.
- 03-08 (release flow) inherits the `test` / `protocol` jobs unchanged.
- Open risk carried forward: the `e2e` job points `PIO_E2E_PROJECT` at a path that must exist on `ubuntu-latest`; it stays inert until a human dispatches it.

---
*Phase: 03-distribution-testing*
*Completed: 2026-11-12*

## Self-Check: PASSED

- All 3 artifacts present on disk.
- All 5 commits are ancestors of HEAD.
