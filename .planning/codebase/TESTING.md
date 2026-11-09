---
last_mapped_commit: db5db691cd9960e04ae8fe13e2d6a6f62eebeb56
last_mapped_at: 2026-11-09
---
# Testing Patterns

**Analysis Date:** 2026-11-09

## Test Framework

**Runner:**
- Jest 29 (`"jest": "^29.7.0"` in `package.json` devDependencies).
- Config: none. No `jest.config.*`, no `"jest"` key in `package.json`, and no `*.test.js` / `*.spec.js` files exist anywhere outside `node_modules/`.
- Invocation: `node --experimental-vm-modules node_modules/jest/bin/jest.js` (`package.json` `scripts.test`). The VM-modules flag is required for ESM imports.
- Consequence: `npm test` currently discovers zero tests. Jest exits non-zero on an empty test set, so the configured verification gate in `.gsd/PREFERENCES.md` cannot pass as written.

**Assertion Library:**
- None in the Jest path. The only executable test is a hand-rolled UAT harness in `test/uat-sesaiotnode.mjs` that counts passes and failures itself.

**Run Commands:**
```bash
npm test          # jest with --experimental-vm-modules (no tests registered)
npm run build     # node build.mjs → dist/server.js via esbuild
npm run lint      # eslint src/ (no eslint config committed)
node test/uat-sesaiotnode.mjs   # manual UAT against a real PlatformIO project
```

The project verification set is declared in `.gsd/PREFERENCES.md`: `npm test`, `npm run build`, `npm run lint`.

## Test File Organization

**Location:**
- All tests live in `test/` at the repository root. Nothing is co-located under `src/`.
- The single test artifact is `test/uat-sesaiotnode.mjs` — a top-level-await Node script, run directly with `node`, not through Jest.

**Naming:**
- UAT scripts: `uat-<target-project-slug>.mjs` (e.g. `test/uat-sesaiotnode.mjs` for the SesaIoTNode firmware project).
- If Jest unit tests are added, use `test/<module>.test.js` (ESM, so import `../src/parsers.js` with the extension) and keep the existing Jest script as the runner.

**Structure:**
```text
test/
└── uat-sesaiotnode.mjs   # 271-line end-to-end UAT against a real PIO project
src/
└── (no co-located tests)
.agents/skills/pio-mcp-manager/assets/
├── build.sh              # Tier-3 shell fallbacks, not server tests
├── clean.sh
├── discover.sh
├── monitor.sh
├── test.sh               # drives `pio test` in the target project
└── upload.sh
```

## Test Structure

**Suite Organization:**
The UAT script defines a minimal harness, then runs phases sequentially with top-level `await`:

```js
let passed = 0;
let failed = 0;
const results = [];

async function runTest(name, fn) {
  try {
    const start = Date.now();
    const result = await fn();
    const elapsed = Date.now() - start;
    passed++;
    results.push({ name, status: 'PASS', elapsed, detail: result });
    console.log(`✅ ${name} (${elapsed}ms)`);
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', elapsed: 0, error: err.message });
    console.log(`❌ ${name}`);
  }
}
```

Phases are delimited by banner comments and console headers:

```js
// ---------------------------------------------------------------------------
// Phase 1: Core Build Tools (pio_build, pio_upload, pio_clean)
// ---------------------------------------------------------------------------

console.log('\n=== Phase 1: Core Build Tools ===\n');

await runTest('pio_build (KitchenGuard-V1)', async () => { /* ... */ });
```

**Patterns:**
- Setup: constants at module scope — `ROOT` (absolute path to the external project) and `ENV` (environment name) in `test/uat-sesaiotnode.mjs:16-17`.
- Teardown: per-test cleanup inline — `TaskManager` instances call `tm.destroy()` before the test returns.
- Assertion: a test fails only by throwing. Any returned string is printed as detail and counted as PASS. Tests therefore encode expectations as `throw new Error(...)` or by asserting inside the callback and returning a description.
- Reporting: a Markdown report is assembled from `results` and written to a hard-coded path, `.planning/phases/02-tool-expansion/UAT-REPORT.md` (`test/uat-sesaiotnode.mjs:267-269`). The checked-in report shows the expected format: pass-rate summary, per-tool coverage table, and per-test durations.

## Mocking

**Framework:** None installed; Jest is present but no mocks exist.

**Patterns:**
The suite deliberately avoids mocking. Real work is executed through `child_process`:

```js
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

await runTest('pio_build (KitchenGuard-V1)', async () => {
  const { stdout } = await execAsync(
    `pio run -e ${ENV} --silent 2>&1 | head -20`,
    { cwd: ROOT, timeout: 120000 }
  );
  return stdout.trim().split('\n').slice(-3).join(' | ');
});
```

`TaskManager` behaviour is tested by direct instantiation instead of a mock (`test/uat-sesaiotnode.mjs`, Task Manager phase):

```js
const tm = new TaskManager();
const taskId = tm.createTask({ type: 'build', message: 'Testing task tracking' });
const task = tm.tasks.get(taskId);
tm.tasks.delete(taskId);
tm.destroy();
return task.status === 'running' ? '1 task tracked (running)' : `unexpected: ${task.status}`;
```

**What to Mock:**
- If unit tests are added for `src/parsers.js` and `src/metadata.js`, feed captured `pio run` output strings directly — those functions are pure string parsers and need no mocks.
- Mock `child_process.exec` only for handler-level tests of `src/tools/*.js`; otherwise use fixture output strings.

**What NOT to Mock:**
- Do not mock `pio` in UAT scripts — the suite exists to prove the real toolchain and hardware path (`test/uat-sesaiotnode.mjs` requires `/home/zandev32/Documents/klaklik/SesaIoTNode` and env `KitchenGuard-V1`).
- Do not mock `TaskManager` in tests; its state map is small and synchronous.

## Fixtures and Factories

**Test Data:**
- No fixture files or factories. Inputs are inline shell commands with a 10s–120s timeout each.
- Environment-specific expectations are hard-coded per test (e.g. `stdout.includes('Compiling') || stdout.includes('Building')` in the diagnostics-parsing check).

**Location:**
- N/A. Parsed-output fixtures, if added, belong in `test/fixtures/` and should be raw `pio run` captures.

## Coverage

**Requirements:** None enforced. No `collectCoverage` config, no thresholds, and no coverage reporting step.

**View Coverage:**
```bash
# No coverage tooling is configured. If Jest tests are added:
node --experimental-vm-modules node_modules/jest/bin/jest.js --coverage
```
`coverage/` and `.nyc_output/` are already gitignored (`.gitignore`).

## Test Types

**Unit Tests:**
- None under Jest. The only unit-style checks are the two inline `TaskManager` assertions inside `test/uat-sesaiotnode.mjs`.
- Highest-value untested units: the regex parsers `src/parsers.js` (`parseLinkerErrors`, `parsePythonErrors`, `parseCMakeErrors`, `parseSingleLineGCC`, `parseAllDiagnostics`) and `src/metadata.js` (`parseBuildMetadata`, incremental filtering). Both are pure functions over strings and are trivially testable.

**Integration Tests:**
- `test/uat-sesaiotnode.mjs` is an integration/UAT script against a real PlatformIO project. Important limitation: it invokes the `pio` CLI directly through `execAsync` rather than calling the MCP tool handlers in `src/tools/*.js`, so it validates the toolchain and project layout, not the server's request/response behaviour.
- Shell fallbacks in `.agents/skills/pio-mcp-manager/assets/*.sh` (`build.sh`, `test.sh`, …) validate the Tier-3 path described in `.agents/skills/pio-mcp-manager/SKILL.md`; they are manual aids, not part of any test command.

**E2E Tests:**
- Not used. No test starts `dist/server.js` and speaks JSON-RPC / Streamable HTTP to it.

## Common Patterns

**Async Testing:**
```js
await runTest('pio_clean (KitchenGuard-V1)', async () => {
  const { stdout } = await execAsync(
    `pio run -e ${ENV} --target clean 2>&1 | tail -5`,
    { cwd: ROOT, timeout: 15000 }
  );
  return stdout.trim().substring(0, 100);
});
```

**Error Testing:**
Expected failures are caught and the message is inspected:

```js
await runTest('pio_build (invalid env → error handling)', async () => {
  try {
    await execAsync(`pio run -e non-existent-env 2>&1 | head -5`, { cwd: ROOT, timeout: 10000 });
    return 'no error (unexpected)';
  } catch (e) {
    const msg = (e.stdout || e.stderr || '').toString();
    return msg.includes('Unknown') ? 'error caught correctly' : 'unexpected error format';
  }
});
```

Caveat for new tests: because `runTest` counts any non-throwing callback as PASS, a test like the one above returns `'no error (unexpected)'` on success rather than failing. Throw explicitly for negative assertions:

```js
if (!msg.includes('Unknown')) throw new Error(`unexpected error format: ${msg}`);
```

**Optional-failure pattern:**
When a failure is informative but should not fail the suite, capture it with `.catch` and return the output:

```js
const { stdout, stderr } = await execAsync(
  `pio run -e ${ENV} --target upload 2>&1 | head -10`,
  { cwd: ROOT, timeout: 30000 }
).catch((e) => ({ stdout: e.stdout || '', stderr: e.stderr || '' }));
```

**Where to add tests:**
- Unit: `test/parsers.test.js`, `test/metadata.test.js`, `test/workspace.test.js` — Jest ESM, import from `../src/*.js`.
- Handler-level: `test/tools/build.test.js` with `child_process.exec` mocked and `resolveWorkspace` stubbed through `ctx`.
- Keep hardware/project UAT in `test/uat-*.mjs` and document the required `ROOT`/`ENV` values at the top of each script.
- Update `package.json` `testMatch` (via a new `jest.config.js`) only when real unit tests exist, so `npm test` stops failing on an empty suite.

---

*Testing analysis: 2026-11-09*
