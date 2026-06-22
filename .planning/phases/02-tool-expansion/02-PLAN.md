# Phase 2 Plan B: Check & Test Tools + Skills Update

**Goal:** Add static analysis and test execution tools, then update SKILL.md with new tool reference.
**Depends on:** Phase 2 Plan A (task infrastructure for async test execution)
**Wave:** 2

---

## Task 1: Create `src/tools/check.js` — static analysis

**File:** `src/tools/check.js`

### `pio_check`

Wraps `pio check --json-output` and transforms the output into the existing MCP diagnostic shape.

**Parameters (Zod schema):**
```js
{
  project_dir: z.string().optional().describe('Path to the PIO project.'),
  environment: z.string().optional().describe('Environment to check. Checks all if omitted.'),
  tool: z.enum(['cppcheck', 'clangtidy', 'pvs-studio']).optional().describe('Analysis tool. Defaults to cppcheck. Use clangtidy for deep checks or pvs-studio for commercial analysis.'),
  severity: z.enum(['high', 'medium', 'low']).optional().describe('Minimum severity to report. Defaults to low (all).'),
  verbose: z.boolean().optional().default(false),
}
```

**Implementation approach:**

1. Build the `pio check` command:
   ```
   pio check --json-output [-e <env>] [--flags <tool-prefix>:--severity=<sev>] [-d <project_dir>]
   ```

2. **Stdout parsing:** `pio check --json-output` may include tool-install progress text before the JSON array (PlatformIO issue #4029). Mitigation:
   ```js
   // Extract JSON from stdout — strip non-JSON prefix
   const jsonStart = stdout.indexOf('[');
   const jsonStr = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;
   const results = JSON.parse(jsonStr);
   ```

3. **Transform defects to MCP diagnostic shape:**
   ```js
   // PlatformIO shape: { severity, category, message, file, line, column, callstack, id, cwe }
   // MCP diagnostic shape: { file, line, column, type, message, category, severity }
   const diagnostics = results.flatMap(envResult =>
     envResult.defects.map(d => ({
       file: path.relative(projectDir, d.file),
       line: d.line,
       column: d.column,
       type: d.category,        // 'warning', 'style', 'performance', etc.
       message: d.message,
       category: d.category,
       severity: d.severity,    // 'high', 'medium', 'low'
       id: d.id,
       cwe: d.cwe || null,
     }))
   );
   ```

4. **Filter by severity** if `severity` parameter is set:
   ```js
   const severityOrder = { high: 3, medium: 2, low: 1 };
   const minSev = severityOrder[params.severity || 'low'];
   diagnostics = diagnostics.filter(d => (severityOrder[d.severity] || 0) >= minSev);
   ```

5. **Return shape:**
   ```js
   return { content: [{ type: 'text', text: JSON.stringify({
     success: results.every(r => r.succeeded),
     tools_run: results.map(r => r.tool),
     total_defects: diagnostics.length,
     diagnostics,
     summary: summarizeCheckResults(results),
   }) }] };
   ```

**`summarizeCheckResults` helper:**
```js
function summarizeCheckResults(results) {
  const bySeverity = { high: 0, medium: 0, low: 0 };
  results.forEach(r => r.defects.forEach(d => { bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1; }));
  const parts = Object.entries(bySeverity).filter(([,v]) => v > 0).map(([k,v]) => `${v} ${k}`);
  return parts.length > 0 ? parts.join(', ') : 'no defects found';
}
```

---

## Task 2: Create `src/tools/test.js` — test runner

**File:** `src/tools/test.js`

### `pio_run_tests`

Wraps `pio test` with `--json-output-path` for structured results.

**Parameters (Zod schema):**
```js
{
  project_dir: z.string().optional().describe('Path to the PIO project.'),
  environment: z.string().optional().describe('Environment to test. Tests all if omitted.'),
  filter: z.string().optional().describe('Test name filter pattern.'),
  verbose: z.boolean().optional().default(false),
}
```

**Implementation:**

1. Create temp output path inside `.pio/`:
   ```js
   const jsonOutputPath = path.join(projectDir, '.pio', 'test-results.json');
   ```

2. Build command:
   ```
   pio test --json-output-path=<jsonOutputPath> [-e <env>] [--filter <pattern>]
   ```
   Note: `--json-output-path` writes JSON to a file, not to stdout. This is different from `--json-output`.

3. Run via `runPioCommand` (sync).

4. Read and parse the output file:
   ```js
   let testResults = null;
   if (fs.existsSync(jsonOutputPath)) {
     testResults = JSON.parse(fs.readFileSync(jsonOutputPath, 'utf8'));
     fs.unlinkSync(jsonOutputPath);  // cleanup
   }
   ```

5. **Return shape:**
   ```js
   return { content: [{ type: 'text', text: JSON.stringify({
     success: exitCode === 0,
     exit_code: exitCode,
     results: testResults,   // null if JSON file not generated (fallback)
     output: verbose ? undefined : summarizedOutput,
     summary: summarizeTestResults(testResults || rawOutput),
   }) }] };
   ```

**Graceful degradation:** If `--json-output-path` is not supported (older PIO versions), the tool falls back to returning raw stdout/stderr text in the `output` field with a note that structured results are unavailable.

**`summarizeTestResults` helper:**
```js
function summarizeTestResults(results) {
  if (!results) return 'test output captured (no structured data)';
  // Adapt based on actual JSON shape from pio test
  const passed = results.filter?.(r => r.status === 'passed')?.length ?? 0;
  const failed = results.filter?.(r => r.status === 'failed')?.length ?? 0;
  return `${passed} passed, ${failed} failed`;
}
```

---

## Task 3: Update `src/server.js` — register check and test tools

**File:** `src/server.js`

Add registration calls (these imports are already included from Plan A's Task 7):

```js
// Already in server.js from Plan A:
registerCheckTools(server, ctx);
registerTestTools(server, ctx);
```

If Plan A deferred these imports, add them now.

---

## Task 4: Update SKILL.md with new tool reference

**File:** `.agents/skills/pio-mcp-manager/SKILL.md`

Add a Tier 1 MCP Tools section for all 6 new tools. Follow the existing 3-tier hierarchy format.

**New entries to add under Tier 1:**

```markdown
### pio_list_devices
- Discovers connected serial/UART devices
- Parameters: `project_dir` (optional), `filter` (serial/logical/mdns)
- Returns array of devices with port, hwid, description
- Use when: Need to find which port a board is connected to before upload

### pio_list_boards
- Lists project environments from platformio.ini
- Parameters: `project_dir` (optional)
- Returns array of env/board/platform/framework assignments
- Use when: Need to know which build environments exist in the project

### pio_task_status
- Polls status of background (async) operations
- Parameters: `task_id`
- Returns {status, exit_code, elapsed_seconds, result}
- Use when: Previously started an async build/upload and need to check progress

### pio_serial_start
- Launches serial monitor as background daemon
- Parameters: `project_dir`, `environment`, `port`, `baud` (default: 115200)
- Returns {task_id, log_file, pid}
- Use when: Need to monitor device serial output during/after firmware upload

### pio_serial_stop
- Stops a running serial monitor daemon
- Parameters: `task_id`
- Returns {duration_seconds, lines_captured}
- Use when: Done monitoring, want to stop the daemon

### pio_serial_read
- Reads tail of serial monitor log file with optional regex filter
- Parameters: `task_id` or `log_file`, `lines` (default: 100), `search_pattern`
- Returns filtered log lines
- Use when: Need to inspect recent serial output for debugging

### pio_check
- Runs static code analysis (cppcheck/clangtidy/pvs-studio)
- Parameters: `project_dir`, `environment`, `tool`, `severity`, `verbose`
- Returns structured defects {severity, message, file, line, column, id}
- Use when: Want to lint/check code quality before committing

### pio_run_tests
- Executes PlatformIO unit tests with structured results
- Parameters: `project_dir`, `environment`, `filter`, `verbose`
- Returns {success, results, summary}
- Use when: Running unit tests on host or target device
```

---

## Task 5: Update Tier 3 shell wrappers alignment

**Files:** `scripts/discover.sh`, `scripts/test.sh`, `scripts/monitor.sh`

Verify that the shell wrappers already in place (Phase 1) align with the new MCP tool interfaces:

- `scripts/discover.sh` — should match `pio_list_devices` parameters (port, filter)
- `scripts/test.sh` — should match `pio_run_tests` parameters (env, filter)
- `scripts/monitor.sh` — should match `pio_serial_start` parameters (baud, port, env)

If discrepancies found, update shell wrappers to match. These are Tier 3 fallbacks — agents use MCP tools (Tier 1) first.

---

## Acceptance Criteria

1. `pio_check` runs cppcheck, clangtidy, or pvs-studio and returns structured defects
2. `pio_check --json-output` stdout is parsed correctly even with tool-install progress text prefix (robust JSON extraction)
3. `pio_run_tests` executes tests and returns structured pass/fail results
4. `pio_run_tests` degrades gracefully when `--json-output-path` is unavailable (older PIO)
5. SKILL.md Tier 1 section documents all 9 MCP tools (3 existing + 6 new)
6. Shell wrappers (Tier 3) align with MCP tool parameters
7. All new tools use `PioMcpError` + `wrapToolError` for error handling
8. All new tools validate project paths with `assertWithinWorkspace`

---

## Files Changed

| File | Action |
|------|--------|
| `src/tools/check.js` | CREATE — `pio_check` |
| `src/tools/test.js` | CREATE — `pio_run_tests` |
| `src/server.js` | EDIT — add check + test tool registrations (Plan A already added imports) |
| `.agents/skills/pio-mcp-manager/SKILL.md` | EDIT — add Tier 1 reference for 6 new tools |
| `scripts/discover.sh` | MAYBE EDIT — align with `pio_list_devices` |
| `scripts/test.sh` | MAYBE EDIT — align with `pio_run_tests` |
| `scripts/monitor.sh` | MAYBE EDIT — align with `pio_serial_start/stop/read` |

---

## Integration with Phase 3

Phase 3 (Distribution & Testing) will port 233 tests from the extension repo. The new tools introduced here need corresponding tests:
- Unit tests for `TaskManager` lifecycle
- Integration test for `pio_check` with mock JSON output
- Integration test for `pio_run_tests` with mock test results
- Integration test for serial monitor daemon (spawn + log file + read)
