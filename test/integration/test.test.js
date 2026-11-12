import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../src/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, runPioCommand: vi.fn() };
});

import { runPioCommand } from '../../src/utils.js';
import { registerTestTools } from '../../src/tools/test.js';
import { TaskManager } from '../../src/tasks.js';
import { ERROR_CODES } from '../../src/errors.js';

const INI = `[platformio]
default_envs = esp32dev

[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
`;

const TEST_OUTPUT = `Testing esp32dev
test/test_main.cpp:12:test_case_ok	PASSED
========================== 1 test cases: 1 succeeded in 00:00:03.120 ==========================`;

function makeServer() {
  const tools = new Map();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
    server: { sendLoggingMessage: vi.fn() },
  };
}

function parseBody(result) {
  return JSON.parse(result.content[0].text);
}

let projectDir;
let taskManager;
let tool;

function jsonResultsPath() {
  return path.join(projectDir, '.pio', 'test-results.json');
}

beforeEach(() => {
  runPioCommand.mockReset();
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pioneer-test-'));
  fs.writeFileSync(path.join(projectDir, 'platformio.ini'), INI);
  const server = makeServer();
  taskManager = new TaskManager();
  registerTestTools(server, {
    explicitRoot: projectDir,
    workspaceFixed: true,
    taskManager,
    server,
  });
  tool = server.tools.get('pio_run_tests');
});

afterEach(() => {
  taskManager.destroy();
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe('pio_run_tests registration', () => {
  it('registers the documented input schema', () => {
    expect(tool).toBeDefined();
    expect(Object.keys(tool.config.inputSchema).sort()).toEqual([
      'async',
      'environment',
      'filter',
      'timeout_seconds',
      'verbose',
    ]);
  });
});

describe('pio_run_tests sync path', () => {
  it('builds the -e/-f argv with --json-output-path and reads structured results', async () => {
    fs.mkdirSync(path.join(projectDir, '.pio'), { recursive: true });
    fs.writeFileSync(
      jsonResultsPath(),
      JSON.stringify([{ env: 'esp32dev', test_cases: [{ name: 'ok', status: 'PASSED' }] }]),
    );

    runPioCommand.mockResolvedValue({
      stdout: TEST_OUTPUT,
      stderr: '',
      combined: TEST_OUTPUT,
      exitCode: 0,
    });

    const result = await tool.handler({ environment: 'esp32dev', filter: 'test_main' });

    expect(runPioCommand).toHaveBeenCalledTimes(1);
    expect(runPioCommand).toHaveBeenCalledWith(
      [
        'test',
        '-e',
        'esp32dev',
        '-f',
        'test_main',
        `--json-output-path=${jsonResultsPath()}`,
      ],
      { projectDir, timeout: 300 * 1000 },
    );

    const body = parseBody(result);
    expect(body).toMatchObject({ success: true, exit_code: 0 });
    expect(body.results).toEqual([
      { env: 'esp32dev', test_cases: [{ name: 'ok', status: 'PASSED' }] },
    ]);
    expect(typeof body.summary).toBe('string');
    // The result file is consumed and removed
    expect(fs.existsSync(jsonResultsPath())).toBe(false);
  });

  it('keeps raw_output only under verbose', async () => {
    runPioCommand.mockResolvedValue({
      stdout: TEST_OUTPUT,
      stderr: '',
      combined: TEST_OUTPUT,
      exitCode: 0,
    });

    const body = parseBody(await tool.handler({ verbose: true }));

    expect(body.raw_output).toContain('PASSED');
  });

  it('reports a non-zero exit without an error envelope', async () => {
    runPioCommand.mockRejectedValue({
      code: 1,
      stdout: TEST_OUTPUT,
      stderr: '',
      combined: TEST_OUTPUT,
      message: 'Command failed',
      timedOut: false,
    });

    const result = await tool.handler({ environment: 'esp32dev' });

    expect(result.isError).toBeUndefined();
    expect(parseBody(result)).toMatchObject({ success: false, exit_code: 1 });
  });

  it('maps a timed-out run to BUILD_FAILED', async () => {
    runPioCommand.mockRejectedValue({
      code: null,
      stdout: '',
      stderr: '',
      combined: '',
      message: 'Command timed out',
      timedOut: true,
    });

    const result = await tool.handler({ environment: 'esp32dev', timeout_seconds: 5 });

    expect(result.isError).toBe(true);
    expect(parseBody(result).error.code).toBe(ERROR_CODES.BUILD_FAILED);
  });

  it('reports a missing CLI as PIO_COMMAND_NOT_FOUND', async () => {
    runPioCommand.mockRejectedValue({
      code: 127,
      stdout: '',
      stderr: 'pio: command not found',
      combined: 'pio: command not found',
      message: 'spawn pio ENOENT',
      timedOut: false,
    });

    const result = await tool.handler({});

    expect(result.isError).toBe(true);
    expect(parseBody(result).error.code).toBe(ERROR_CODES.PIO_COMMAND_NOT_FOUND);
  });
});

describe('pio_run_tests async path', () => {
  it('routes the background run through the shared executor', async () => {
    runPioCommand.mockResolvedValue({
      stdout: TEST_OUTPUT,
      stderr: '',
      combined: TEST_OUTPUT,
      exitCode: 0,
    });

    const body = parseBody(
      await tool.handler({ environment: 'esp32dev', async: true, timeout_seconds: 60 }),
    );

    expect(body.status).toBe('running');
    expect(runPioCommand).toHaveBeenCalledWith(
      ['test', '-e', 'esp32dev', `--json-output-path=${jsonResultsPath()}`],
      { projectDir, timeout: 60 * 1000 },
    );

    await vi.waitFor(() => {
      expect(taskManager.getTask(body.task_id).status).toBe('completed');
    });
    expect(taskManager.getTask(body.task_id).result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// summarizeTestResults shape coverage (PlatformIO emits several JSON layouts)
// ---------------------------------------------------------------------------
describe('pio_run_tests summary formatting', () => {
  function writeResults(results) {
    fs.mkdirSync(path.join(projectDir, '.pio'), { recursive: true });
    fs.writeFileSync(jsonResultsPath(), JSON.stringify(results));
  }

  it('counts cases across key/status variants and suite-level aggregates', async () => {
    writeResults([
      {
        env: 'esp32dev',
        test_cases: [
          { status: 'PASSED' },
          { result: 'FAILED' },
          { state: 'SKIPPED' },
          { verdict: 'mystery' },
        ],
      },
      { env: 'esp32dev', passed: 2, failed: 1, skipped: 1 },
      { env: 'esp32dev', cases: {} },
    ]);
    runPioCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      combined: '',
      exitCode: 0,
    });

    const body = parseBody(await tool.handler({ environment: 'esp32dev' }));

    expect(body.summary).toBe('3 suites, 5 passed, 2 failed, 2 skipped');
  });

  it('parses the raw "All N tests passed" fallback', async () => {
    runPioCommand.mockResolvedValue({
      stdout: 'All 3 tests passed in 00:00:01',
      stderr: '',
      combined: 'All 3 tests passed in 00:00:01',
      exitCode: 0,
    });

    const body = parseBody(await tool.handler({ environment: 'esp32dev' }));

    expect(body.summary).toBe('All 3 tests passed');
  });

  it('parses raw pass/fail/skip counts and suite counts', async () => {
    const text = '2 tests in 2 test suites: 2 passed, 1 failed, 1 skipped';
    runPioCommand.mockResolvedValue({
      stdout: text,
      stderr: '',
      combined: text,
      exitCode: 0,
    });

    const body = parseBody(await tool.handler({ environment: 'esp32dev' }));

    expect(body.summary).toBe('2 passed, 1 failed, 1 skipped, 2 suites');
  });

  it('degrades to a plain message when no data is available', async () => {
    runPioCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      combined: '',
      exitCode: 0,
    });

    const body = parseBody(await tool.handler({ environment: 'esp32dev' }));

    expect(body.summary).toBe('test output captured (no structured data available)');
  });
});
