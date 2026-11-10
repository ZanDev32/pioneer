# Phase 3: Distribution & Testing - Pattern Map

**Mapped:** 2026-11-09
**Files analyzed:** 33 (9 modified, 24 new)
**Analogs found:** 28 / 33
**Tracked-source gate:** every analog path below was verified with `git ls-files -- <path>` (all non-empty). No `.gsd/` or `node_modules/` mirror is cited.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `package.json` | config | transform | `package.json` (self) | exact |
| `package-lock.json` | config | generated | `package-lock.json` (self) | exact |
| `build.mjs` | config (build script) | transform | `build.mjs` (self) | exact |
| `.github/workflows/ci.yml` | config (CI) | batch | none | none |
| `CHANGELOG.md` | docs | n/a (prose) | none | none |
| `README.md` | docs | n/a (prose) | `README.md` (self) | exact |
| `.agents/skills/pio-mcp-manager/SKILL.md` | docs (skill) | n/a (prose) | `README.md` | role-match |
| `src/server.js` | provider (entry point) | request-response | `src/server.js` (self) | exact |
| `src/tools/build.js` | controller (tool handler) | request-response | `src/tools/build.js` sync branch | exact |
| `src/tools/upload.js` | controller (tool handler) | request-response | `src/tools/upload.js` sync branch | exact |
| `src/tools/test.js` | controller (tool handler) | request-response | `src/tools/test.js` sync branch | exact |
| `vitest.config.js` | config (test) | batch | `build.mjs` (ESM config shape) | flow-match |
| `test/unit/parsers.test.js` | test | batch | `test/uat-sesaiotnode.mjs` | flow-match |
| `test/unit/errors.test.js` | test | batch | `test/uat-sesaiotnode.mjs` | flow-match |
| `test/unit/metadata.test.js` | test | batch | `test/uat-sesaiotnode.mjs` | flow-match |
| `test/unit/utils.test.js` | test | batch | `test/uat-sesaiotnode.mjs` | flow-match |
| `test/unit/tasks.test.js` | test | batch | `test/uat-sesaiotnode.mjs` (TaskManager block) | role-match |
| `test/unit/package.test.js` | test | batch | none | none |
| `test/unit/host-configs.test.js` | test | batch | none | none |
| `test/integration/build.test.js` | test | request-response | `src/tools/build.js` | role-match |
| `test/integration/upload.test.js` | test | request-response | `src/tools/upload.js` | role-match |
| `test/integration/clean.test.js` | test | request-response | `src/tools/clean.js` | role-match |
| `test/integration/discover.test.js` | test | request-response | `src/tools/discover.js` | role-match |
| `test/integration/monitor.test.js` | test | request-response | `src/tools/monitor.js` | role-match |
| `test/integration/check.test.js` | test | request-response | `src/tools/check.js` | role-match |
| `test/integration/test.test.js` | test | request-response | `src/tools/test.js` | role-match |
| `test/integration/tasks.test.js` | test | request-response | `src/tasks.js` `registerTaskTools` | role-match |
| `test/protocol/stdio-smoke.test.js` | test (protocol) | request-response | `test/uat-sesaiotnode.mjs` (`execAsync`) | flow-match |
| `test/e2e/sesaiotnode.e2e.mjs` | test (e2e) | batch | `test/uat-sesaiotnode.mjs` | exact | **Not created** — A7 keeps the script standalone (D-13); the opt-in e2e job in 03-06 invokes it directly |
| `test/fixtures/host-configs/claude-desktop.json` | fixture | file-I/O | `README.md` JSON blocks | flow-match |
| `test/fixtures/host-configs/cursor.json` | fixture | file-I/O | `README.md` JSON blocks | flow-match |
| `test/fixtures/host-configs/vscode.json` | fixture | file-I/O | `README.md` JSON blocks | flow-match |
| `test/fixtures/build-logs/` | fixture (directory) | file-I/O | none | none | **Not created** — D-10 mandates inline string fixtures for parsers |

## Pattern Assignments

### `package.json` (config, transform)

**Analog:** `package.json` (current file, lines 1-20)

**Current metadata/scripts block** — this is the exact base to edit (name/version/files/repository/scripts/devDependencies):
```json
  "name": "pioneer",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "pioneer": "./dist/server.js"
  },
  "main": "./dist/server.js",
  "scripts": {
    "build": "node build.mjs",
    "start": "node dist/server.js",
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "lint": "eslint src/"
  },
```

**Current devDependencies** (lines 40-44) — replace `jest` with `vitest@3.2.7` + `@vitest/coverage-v8@3.2.7`:
```json
  "devDependencies": {
    "esbuild": "^0.25.0",
    "eslint": "^8.57.0",
    "jest": "^29.7.0"
  }
```

**Current `repository`** (lines 34-37) — must be repointed before `--provenance` can work:
```json
  "repository": {
    "type": "git",
    "url": "https://github.com/pioarduino/pioarduino-vscode-ide"
  },
```

**Required deltas (D-01, D-02, D-03, D-04, D-07):** `name` → `@zandev32/pioneer`; `version` → `0.2.0-rc.1` then `0.2.0`; add `"files": ["dist/"]` (absent today), `"publishConfig": { "access": "public" }`, `"prepublishOnly": "npm run build"`; `test` → `vitest run`; `repository.url` → `https://github.com/ZanDev32/pioneer`.

---

### `package-lock.json` (config, generated)

**Analog:** current `package-lock.json`

No hand-editing. Regenerate with `npm install -D vitest@3.2.7 @vitest/coverage-v8@3.2.7` and `npm uninstall jest`; CI consumes it via `npm ci` (D-15/D-17 gates). The lockfile must carry `vitest@3.2.7` exactly, not `^5`, or the Node 18 matrix leg fails with `EBADENGINE` (RESEARCH Pitfall 1).

---

### `build.mjs` (config/build script, transform)

**Analog:** `build.mjs` (self, full file)

**Current esbuild call** — extend, do not replace:
```js
await esbuild.build({
  entryPoints: [path.join(__dirname, 'src', 'server.js')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: path.join(__dirname, 'dist', 'server.js'),
  format: 'esm',
  external: ['child_process', 'fs', 'path', 'os', 'crypto', 'net'],
}).catch(() => process.exit(1));
```

**Required delta (RESEARCH "Version stamp fix"):** read `package.json` in this script and add `define: { __PIONEER_VERSION__: JSON.stringify(pkg.version) }` so `dist/server.js` no longer advertises `0.1.0` (see `src/server.js` below). Keep `target: 'node18'`, ESM, and the `external` list untouched because `package.json.engines.node` is `>=18.0.0`.

---

### `.github/workflows/ci.yml` (config/CI, batch)

**Analog:** none — greenfield YAML. No `.github/` directory exists in this repo.

**Use instead:** `.planning/phases/03-distribution-testing/03-RESEARCH.md` § "Publish job skeleton (D-03 + D-17)" and the CI diagram immediately above it. Copy that skeleton verbatim, then split into the four jobs the research specifies: `test` (matrix `{ubuntu,macos,windows} × {18,20,22}`), `protocol` (ubuntu, Node 24, Inspector 2.14.0), `e2e` (manual dispatch, ubuntu + PlatformIO), `publish` (tag `v*`). The tag↔version guard step is already written there:
```yaml
      - name: Tag must match package.json version
        run: test "${GITHUB_REF_NAME#v}" = "$(npm pkg get version | tr -d '"')"
```

---

### `CHANGELOG.md` (docs, prose)

**Analog:** none — no changelog, release notes, or version history exists in the repo.

**Use instead:** Keep a Changelog structure required by D-05 (`.planning/phases/03-distribution-testing/03-RESEARCH.md` § Phase Requirements → D-05). Sections: `Unreleased`, `0.2.0` (Added/Changed/Breaking), with a link reference block. No repo pattern exists to copy; do not invent a second documentation convention — keep it plain Markdown like `README.md`.

---

### `src/server.js` (provider/entry point, request-response)

**Analog:** `src/server.js` (self, lines 87-91 and 186-189)

**Version stamp bug** — both the constructor and the `initialize` response read an env var that is unset under host spawns:
```js
  const server = new McpServer({
    name: 'pioneer',
    version: process.env.npm_package_version || '0.1.0',
    capabilities: { logging: {} },
  });
```

**Stdio wiring** (the path the protocol test spawns):
```js
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Server ready');
```

**Required delta:** replace the `process.env.npm_package_version || '0.1.0'` literal with the build-time `__PIONEER_VERSION__` constant defined in `build.mjs`, keeping `name: 'pioneer'` and the `capabilities` object unchanged.

---

### `src/tools/build.js` (controller/tool handler, request-response)

**Analog:** its own sync branch, `src/tools/build.js:205`

**Sync branch (the seam `vi.mock('../utils.js')` intercepts):**
```js
        try {
          const result = await runPioCommand(args, { projectDir });
          rawOutput = result.combined;
        } catch (buildErr) {
          // Non-zero exit — capture whatever output was available
          buildSuccess = false;
          exitCode = buildErr.code;
          rawOutput = buildErr.combined;
```

**The bypass to remove (D-09 risk B-4)** — async branch at `src/tools/build.js:128` calls `execFile` inline, so a `vi.mock` of `../utils.js` never sees it:
```js
          const execPromise = new Promise((resolve) => {
            execFile('pio', args, {
              cwd: projectDir,
              maxBuffer: 50 * 1024 * 1024,
              env: { ...process.env },
            }, (error, stdout, stderr) => {
              const combined = (stdout || '') + '\n' + (stderr || '');
              const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
```

**Required delta:** route this branch through `runPioCommand(args, { projectDir })` and unwrap its `{ stdout, stderr, combined, exitCode }` / `{ code, stdout, stderr, combined, message, timedOut }` contract (`src/utils.js:23-57`). Same shape as the sync branch above. Also delete the now-unused `execFile` import.

---

### `src/tools/upload.js` (controller/tool handler, request-response)

**Analog:** its own sync branch, `src/tools/upload.js:171`

**Sync branch:**
```js
        try {
          const result = await runPioCommand(args, { projectDir });
          rawOutput = result.combined;
        } catch (uploadErr) {
          uploadSuccess = false;
          exitCode = uploadErr.code;
          rawOutput = uploadErr.combined;
```

**The bypass to remove** — async branch at `src/tools/upload.js:89`:
```js
          const execPromise = new Promise((resolve) => {
            execFile('pio', args, {
              cwd: projectDir,
              maxBuffer: 50 * 1024 * 1024,
              env: { ...process.env },
            }, (error, stdout, stderr) => {
              const combined = (stdout || '') + '\n' + (stderr || '');
              const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
              const success = !error;
```

**Required delta:** identical refactor to `build.js` — call `runPioCommand`, then run the existing `NO_DEVICE` regex (`/no serial ports? found|no device|serial port not found/i`) against `combined`.

---

### `src/tools/test.js` (controller/tool handler, request-response)

**Analog:** its own sync branch, `src/tools/test.js:277`

**Sync branch** (note the `timeout` option that the async branch must preserve):
```js
        try {
          const result = await runPioCommand(args, { projectDir, timeout });
          stdout = result.stdout;
          stderr = result.stderr;
        } catch (err) {
          stdout = err.stdout || '';
          stderr = err.stderr || '';
```

**The bypass to remove** — async branch at `src/tools/test.js:204`:
```js
            execFile('pio', args, {
              cwd: projectDir,
              maxBuffer: 50 * 1024 * 1024,
              env: { ...process.env },
              timeout,
            }, async (error, stdout, stderr) => {
              const combined = (stdout || '') + '\n' + (stderr || '');
              const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
```

**Required delta:** `runPioCommand(args, { projectDir, timeout })`; keep the subsequent `fs.existsSync(jsonOutputPath)` / `JSON.parse` result-reading block untouched.

---

### `vitest.config.js` (config/test, batch)

**Analog:** `build.mjs` for the ESM-config shape (`import … from '…'`, top-level config object, no CommonJS).

**No test config exists today** — `.planning/codebase/TESTING.md` confirms: "No `jest.config.*`, no `"jest"` key in `package.json`".

**Use RESEARCH Pattern 1 verbatim** (`.planning/phases/03-distribution-testing/03-RESEARCH.md:270-294`) — `test.projects` with four inline projects, not the deprecated `vitest.workspace.*`:
```js
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['test/unit/**/*.test.js'], testTimeout: 2000 } },
      { test: { name: 'integration', include: ['test/integration/**/*.test.js'], testTimeout: 30000 } },
      { test: { name: 'protocol', include: ['test/protocol/**/*.test.js'], testTimeout: 30000 } },
      { test: { name: 'e2e', include: ['test/e2e/**/*.e2e.mjs'], testTimeout: 120000 } },
    ],
  },
})
```
Add the `e2e` project because D-13 requires `PIO_E2E=1 vitest run --project e2e` to be opt-in and never part of plain `npm test`; exclude it from the default run with `--project unit --project integration --project protocol` in `scripts.test`, or gate it with `enabled: !!process.env.PIO_E2E`.

---

### `test/unit/parsers.test.js` (test, batch)

**Analog:** `test/uat-sesaiotnode.mjs:22-34` (the only executable test harness in the repo)

**Harness shape to mirror in `describe`/`it`** (the UAT script is deliberately hand-rolled — the Vitest suite replaces the counter with assertions):
```js
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
```

**Target under test** — pure functions with string in / array out, ideal for inline fixtures (D-10):
```js
export function parseLinkerErrors(output, projectDir = '') {
  const regex = /^(?:\/usr\/bin\/ld|\/.*?\/ld|collect2):\s+(.+)$/gm;
  const results = [];
  let match;

  regex.lastIndex = 0;
  while ((match = regex.exec(output)) !== null) {
    results.push({
      file: '',
      line: 0,
      column: 0,
      type: 'error',
      message: match[1].trim(),
      category: 'linker',
    });
  }

  return results;
}
```
Also cover `parseAllDiagnostics` (`src/parsers.js:260`) dedup-by-`${file}:${line}:${message}` behaviour and its four-parser merge order.

---

### `test/unit/errors.test.js` (test, batch)

**Analog:** `test/uat-sesaiotnode.mjs` harness (same shape as above); target is `src/errors.js`.

**Target under test** — assert both branches by creating/removing a temp dir (no `pio` needed):
```js
export function assertPioProject(projectDir) {
  const iniPath = path.join(projectDir, 'platformio.ini');
  if (!fs.existsSync(iniPath)) {
    throw new PioMcpError(
      ERROR_CODES.PROJECT_NOT_FOUND,
      `No platformio.ini found in ${projectDir}. This is not a valid PlatformIO project.`,
      { projectDir },
    );
  }
}
```
Also assert `wrapToolError` passes a `PioMcpError` through unchanged and wraps a plain `Error` as `INTERNAL_ERROR` (`src/errors.js:63-70`), plus `assertEnvExists` → `ENV_NOT_FOUND` with `data.available`.

---

### `test/unit/metadata.test.js` (test, batch)

**Analog:** `test/uat-sesaiotnode.mjs` harness; target `src/metadata.js`.

**Target signature and contract:**
```js
export function parseBuildMetadata(output, projectDir = '', envName = '') {
```
Inline fixtures per D-10: a RAM/Flash `SUCCESS` tail, a duration line, and a binary-size line, asserting `duration_seconds`, `binary_size_bytes`, and the conditional memory fields. `getDirSize` (`src/metadata.js:192`) needs a real temp directory, not a fixture string.

---

### `test/unit/utils.test.js` (test, batch)

**Analog:** `test/uat-sesaiotnode.mjs:17-18` — the only place the repo executes a child process from a test:
```js
const execAsync = promisify(exec);
const ROOT = '/home/zandev32/Documents/klaklik/SesaIoTNode';
```

**Target under test** — the seam the whole integration layer mocks, so its resolve/reject shapes are the contract to lock down:
```js
export function runPioCommand(args, options) {
  return new Promise((resolve, reject) => {
    const maxBuffer = options.maxBuffer ?? 50 * 1024 * 1024; // default 50MB
    const execOptions = {
      cwd: options.projectDir,
      maxBuffer,
      env: { ...process.env },
    };
```
Assert: resolve `{ stdout, stderr, combined, exitCode: 0 }`; reject `{ code, stdout, stderr, combined, message, timedOut }`; `timeout` only forwarded when truthy. Mock `node:child_process` with `vi.mock('child_process')` here — this is the one unit file that must not shell out. Also cover `hasErrors` (`src/utils.js:65`) with `[{type:'error'}]` / `[{type:'warning'}]`.

---

### `test/unit/tasks.test.js` (test, batch)

**Analog:** `test/uat-sesaiotnode.mjs:125-130` — the one existing usage pattern, including mandatory teardown:
```js
  const tm = new TaskManager();
  const taskId = tm.createTask({ type: 'build', message: 'Testing task tracking' });
  const count = tm.tasks.size;
  const task = tm.tasks.get(taskId);
  tm.tasks.delete(taskId);
  tm.destroy();
  return count === 1 && task.status === 'running'
    ? '1 task tracked (running)'
    : `unexpected: count=${count}`;
```

**Deltas for the Vitest version:** use fake timers (`vi.useFakeTimers()`) to drive `cleanup()` (`src/tasks.js:37`) past `_ttlMs` (30 min) without waiting; always `tm.destroy()` in `afterEach` so the 5-minute `setInterval` does not leak between tests. Cover `createTask`/`getTask`/`updateTask`/`cancelTask`/`listActive` (`src/tasks.js:74-175`).

---

### `test/unit/package.test.js` (test, batch)

**Analog:** none — no test currently inspects `package.json` or the tarball.

**Use instead:** RESEARCH Phase Requirements → D-01/D-04 rows. The test must shell out to `npm pack --dry-run --json` (real subprocess, marked slow) and assert: `name === '@zandev32/pioneer'`, `bin.pioneer === './dist/server.js'`, and every packed path starts with `dist/`. Keep the pure-JSON assertions (name/bin/version/files) as ordinary reads of `package.json`; only the tarball check needs the subprocess. Cite RESEARCH's quick command:
```bash
node -e "const p=require('./package.json');if(!p.name.startsWith('@')||!p.bin.pioneer)process.exit(1)"
```

---

### `test/unit/host-configs.test.js` (test, batch)

**Analog:** none — no JSON fixture tests exist.

**Use instead:** D-19 plus the three JSON shapes in `README.md:62-76` (VS Code `servers`) and RESEARCH § "Code Examples" for Claude Desktop (`mcpServers`, no `type`) and Cursor (`mcpServers` + `type: "stdio"`). Assertions: top-level key is `servers` for VS Code and `mcpServers` for the other two; `type` present only where required; `args` contains `-y` and `@zandev32/pioneer` (`Pitfall 8`).

---

### `test/integration/build.test.js` (test, request-response)

**Analog:** `src/tools/build.js` (lines 128-141 async, 205 sync)

**Mock seam and handler registration** — the factory must be hoisted above the import of the module under test (RESEARCH Pattern 2):
```js
vi.mock('../../src/utils.js', () => ({
  runPioCommand: vi.fn(),
  hasErrors: vi.fn(() => false),
}))

import { runPioCommand } from '../../src/utils.js'
import { registerBuildTools } from '../../src/tools/build.js'
```
Create a minimal `McpServer` (or a stub with a `tool()` spy) and assert the registered name/schema; then call the handler with `{ environment: 'esp32dev' }` and assert response shaping from the real return block:
```js
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
```
Assert the `runPioCommand` mock was called before asserting output (RESEARCH Pitfall 6), and that a rejected promise becomes `isError: true` with `error.code` from `wrapToolError`.

---

### `test/integration/upload.test.js` (test, request-response)

**Analog:** `src/tools/upload.js` (lines 89-96 async, 171 sync)

Same `vi.mock('../../src/utils.js')` seam. Drive the upload success branch, the `NO_DEVICE` regex branch (`/no serial ports? found|no device|serial port not found/i` against `combined`), and the `PIO_COMMAND_NOT_FOUND` branch. Register via `registerUploadTools`.

---

### `test/integration/clean.test.js` (test, request-response)

**Analog:** `src/tools/clean.js` (registration at lines 29-44; sync call at 63)

This is the cleanest handler to copy for *any* tool test — full registration + validation + response + error shape in one file:
```js
  server.tool(
    'pio_clean',
    'Clean build artifacts for a specific PlatformIO environment. Per-environment only (safe for multi-env projects).',
    {
      environment: z
        .string()
        .describe('Build environment to clean (e.g., "esp32dev"). Required.'),
      verbose: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include full output if true.'),
    },
    async (params) => {
```
```js
          const result = await runPioCommand(['run', '-t', 'clean', '-e', params.environment], { projectDir });
          rawOutput = result.combined;
```
Assert computed `bytes_freed >= 0`, `environment` echoed, `raw_output` present only when `verbose`, and the error block:
```js
      } catch (err) {
        const mcpErr = wrapToolError(err);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: { code: mcpErr.code, message: mcpErr.message, data: mcpErr.data },
              }),
            },
          ],
          isError: true,
        };
```

---

### `test/integration/discover.test.js` (test, request-response)

**Analog:** `src/tools/discover.js:309-335`

```js
        const args = ['device', 'list', `--${params.filter}`, '--json-output'];

        let devices;
        try {
          const result = await runPioCommand(args, { projectDir });
          devices = JSON.parse(result.stdout || '[]');
        } catch (err) {
          // pio not found
          if (/command not found|ENOENT|'pio' is not recognized/i.test(err.combined || '')) {
            throw new PioMcpError(
              ERROR_CODES.PIO_COMMAND_NOT_FOUND,
              'PlatformIO CLI (pio) not found in PATH.',
              { hint: 'Run: pip install platformio' },
```
Mock `runPioCommand` to resolve real `pio device list --json-output` JSON (one board + one unknown device) and assert the shaping; then reject with `{ combined: 'pio: command not found' }` and assert `PIO_COMMAND_NOT_FOUND`.

---

### `test/integration/monitor.test.js` (test, request-response)

**Analog:** `src/tools/monitor.js:138-142` (registration) and `:209` (`spawn('cat', …)`)

This is the one tool module that does **not** call `runPioCommand`; it spawns `cat` on the serial device:
```js
          child = spawn('cat', [serialPort], {
```
So `vi.mock('../../src/utils.js')` alone is insufficient. Mock `node:child_process`'s `spawn` to return a fake `ChildProcess` (`stdout`/`stderr` streams, `kill`, `killed`), and pair it with a `TaskManager` instance. Always call `tm.destroy()` in `afterEach` (same teardown rule as `test/unit/tasks.test.js`). Cover start → read tail → stop, plus `PORT_BUSY`.

---

### `test/integration/check.test.js` (test, request-response)

**Analog:** `src/tools/check.js:146`

```js
          const result = await runPioCommand(args, { projectDir });
```
Same seam. Mock a cppcheck-style stdout, assert diagnostic extraction and `summarizeDiagnostics`; then mock a rejection with `{ code: 1, combined: 'cppcheck: not found' }` and assert the structured error path.

---

### `test/integration/test.test.js` (test, request-response)

**Analog:** `src/tools/test.js:277` (sync) and `:204` (async bypass — fix first, then test both paths through the same mock)

```js
          const result = await runPioCommand(args, { projectDir, timeout });
          stdout = result.stdout;
          stderr = result.stderr;
```
Assert the `timeout` argument is forwarded, and that missing JSON results (`fs.existsSync(jsonOutputPath)` false) degrade gracefully instead of throwing.

---

### `test/integration/tasks.test.js` (test, request-response)

**Analog:** `src/tasks.js:189-232` (`registerTaskTools`)

```js
export function registerTaskTools(server, ctx) {
  server.tool(
    'pio_task_status',
```
```js
    async () => {
      const active = ctx.taskManager.listActive();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ running_tasks: active, count: active.length }, null, 2),
          },
        ],
      };
```
No `runPioCommand` mock needed. Build a real `TaskManager`, register on a stub server, then assert: unknown `task_id` → `isError: true` with `{ error: 'Task not found', task_id }`; empty manager → `{ running_tasks: [], count: 0 }`; `destroy()` in `afterEach`.

---

### `test/protocol/stdio-smoke.test.js` (test/protocol, request-response)

**Analog:** `test/uat-sesaiotnode.mjs:17` and its `execAsync` usage — the only existing process-spawning test pattern:
```js
const execAsync = promisify(exec);
```

**Target:** the **built** artifact, not source — `dist/server.js` (RESEARCH: "it is the only check that exercises the shipped artifact"). Spawn `node dist/server.js`, speak JSON-RPC over stdin/stdout (or shell out to the pinned Inspector CLI), assert `initialize` → `tools/list` returns exactly the 12 tool names, and that `tools/call` on `pio_task_list` returns `running_tasks` + `count`. Guard with `fs.existsSync('dist/server.js')` and skip with a clear message if the build step has not run.

---

### `test/e2e/sesaiotnode.e2e.mjs` (test/e2e, batch)

**Analog:** `test/uat-sesaiotnode.mjs` (whole file, 271 lines) — keep this exact structure, renamed and gated.

**Constants + phase banners to copy:**
```js
const ROOT = '/home/zandev32/Documents/klaklik/SesaIoTNode';
const ENV = 'KitchenGuard-V1';
```
```js
// ---------------------------------------------------------------------------
// Phase 1: Core Build Tools (pio_build, pio_upload, pio_clean)
// ---------------------------------------------------------------------------

console.log('\n=== Phase 1: Core Build Tools ===\n');

await runTest('pio_build (KitchenGuard-V1)', async () => {
```
**Delta (D-13 / RESEARCH A7):** either move this file to `test/e2e/sesaiotnode.e2e.mjs` and register it under the `e2e` Vitest project, or leave `test/uat-sesaiotnode.mjs` untouched and point the `e2e` project at it. Do not do both. Never reference the hard-coded report path — `test/uat-sesaiotnode.mjs:267-269` writes to `.planning/phases/02-tool-expansion/UAT-REPORT.md`, which is stale for Phase 3.

---

### `test/fixtures/host-configs/claude-desktop.json` (fixture, file-I/O)

**Analog:** `README.md` JSON blocks (host config is the only checked-in JSON shape in the repo).

**Base shape** — Claude Desktop is the only one with no `type` field:
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
Verify against `src/server.js:34` — `PIO_WORKSPACE_ROOT` is the env var the server actually reads.

---

### `test/fixtures/host-configs/cursor.json` (fixture, file-I/O)

**Analog:** `README.md:62-76` (VS Code stdio block) for the `command`/`args` convention.

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
`type` is required by Cursor's field table even though its own examples omit it — include it (RESEARCH § Code Examples).

---

### `test/fixtures/host-configs/vscode.json` (fixture, file-I/O)

**Analog:** `README.md:62-76` — the repo's existing `.vscode/mcp.json` example, which uses `servers` (not `mcpServers`):
```json
  "servers": {
    "pioneer": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/pioneer/dist/server.js",
        "--workspace",
        "${workspaceFolder}"
      ]
    }
  }
```
**Delta:** switch `command` to `"npx"`, `args` to `["-y", "@zandev32/pioneer"]`, and add `cwd: "${workspaceFolder}"` + `env: { "PIO_WORKSPACE_ROOT": "${workspaceFolder}" }`. These templates must live under `test/fixtures/host-configs/` because `.gitignore:34` ignores `.vscode/`, so a checked-in `.vscode/mcp.json` would never be committed.

---

### `test/fixtures/build-logs/` (fixture directory, file-I/O)

**Analog:** none — the repo has no fixture directory. The UAT script keeps all expected output inline.

**Use instead:** D-10. Only full PIO build logs consumed by integration tests belong here (e.g. `build-failure.log` with GCC + linker + CMake errors in one capture). Unit tests must keep inline 50-200 char strings — do not move them into this directory.

---

### `README.md` (docs, prose)

**Analog:** `README.md` (self)

**Current Installation/Usage block to rewrite for the scoped package** (lines 5-20):
````markdown
## Installation

```bash
npm install
```

## Usage
````
**Current VS Code config block** (lines 62-76) is the shape the host templates and README section must stay consistent with (see `test/fixtures/host-configs/vscode.json`). Add the `npx -y @zandev32/pioneer` invocation for Claude Desktop, Cursor, and VS Code, plus a link to `CHANGELOG.md`. Keep the existing section ordering; do not introduce a new doc style.

---

### `.agents/skills/pio-mcp-manager/SKILL.md` (docs/skill, prose)

**Analog:** `README.md` (the only other user-facing install doc)

**Line to change** — currently teaches the unscoped package, which is taken on npm (0.11.7):
```markdown
3. **Install (if user agrees):** Run `npx pioneer` or `npm install -g pioneer`
```
**Required delta:** both commands become `npx @zandev32/pioneer` / `npm install -g @zandev32/pioneer`. Sweep the whole file for other `npx pioneer` occurrences (`grep -n "npx pioneer\|npm install -g pioneer"`); the Tier‑1 tool table and Tier‑3 scripts are unaffected.

## Shared Patterns

### Mock seam (D-09) — applies to all `test/integration/*.test.js`
**Source:** `src/utils.js:23-57` (contract) + `.planning/phases/03-distribution-testing/03-RESEARCH.md` Pattern 2 (boilerplate)
```js
vi.mock('../../src/utils.js', () => ({
  runPioCommand: vi.fn(),
  hasErrors: vi.fn(() => false),
}))
```
Rules: the specifier is `'../../src/utils.js'` from both `test/unit/` and `test/integration/`; `vi.mock` is hoisted, so use `vi.hoisted` for any shared factory variable; assert `runPioCommand` was called before asserting output; **do not apply this seam to `monitor.js`** (spawns `cat`, not `pio`) or to the async branches until `build.js`/`upload.js`/`test.js` are refactored per B-4.

### Handler shape — applies to every new integration test
**Source:** `src/tools/clean.js:29-104`
Every tool file follows `server.tool(name, description, zodShape, handler)`; the handler is `try { resolveWorkspace → assert* → runPioCommand → shape } catch { wrapToolError → isError: true }`. Test the Zod layer, the executor call, the response `content[0].text` JSON, and the catch block — four assertions per handler minimum.

### Error wrapping — applies to all handlers and their tests
**Source:** `src/errors.js:12-70`, `src/tools/build.js:276-294`
Errors are returned as `{ error: { code, message, data } }` with `isError: true`, never thrown. Codes live in `ERROR_CODES` (`-32602`, `-32603`, `-32001…-32009`). Assert code presence and shape, not message substrings.

### Task teardown — applies to `test/unit/tasks.test.js`, `test/integration/tasks.test.js`, `test/integration/monitor.test.js`
**Source:** `test/uat-sesaiotnode.mjs:118-130`, `src/tasks.js:17-62`
`new TaskManager()` starts a `setInterval` (unref'd); `destroy()` clears it. Every test that constructs a manager must call `tm.destroy()` in `afterEach`, or Vitest leaks handles across files.

### ESM import convention — applies to all new `.js` files
**Source:** `src/tools/clean.js:7-19`
ESM only (`"type": "module"`); relative imports include the `.js` extension (`'../utils.js'`, `'../errors.js'`); Node builtins use bare specifiers (`'path'`, `'fs'`) in source and `node:`-prefixed in newer files (`src/server.js:22-23`). Tests import the same way (`'../../src/parsers.js'`).

## No Analog Found

Files with no close match — planner must use RESEARCH.md patterns instead:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.github/workflows/ci.yml` | config (CI) | batch | No `.github/` directory; use RESEARCH "Publish job skeleton" + CI diagram |
| `CHANGELOG.md` | docs | n/a (prose) | No changelog exists; use Keep a Changelog per D-05 |
| `test/unit/package.test.js` | test | batch | No test inspects `package.json` or `npm pack` output today |
| `test/unit/host-configs.test.js` | test | batch | No JSON-fixture tests exist; use D-19 + RESEARCH host shapes |
| `test/fixtures/build-logs/` | fixture (directory) | file-I/O | No fixture directory; D-10 defines its scope |

## Metadata

**Analog search scope:** repository root; `src/`, `src/tools/`, `test/`, `README.md`, `build.mjs`, `package.json`, `.gitignore`, `.agents/skills/`; cross-checked against `.planning/codebase/TESTING.md`
**Files scanned:** 20 tracked source/doc files (4,376 lines total in `src/`, `test/`, docs) + `package.json`, `build.mjs`, `.gitignore`
**Tracked-source verification:** `git ls-files --` run on all 17 cited analog paths — all tracked; `dist/` and `.vscode/` confirmed gitignored, so neither is cited as an analog
**Pattern extraction date:** 2026-11-09
