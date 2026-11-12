import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Single mock boundary (D-09): only the executor is replaced. Everything else
// in utils.js (hasErrors, etc.) stays real.
vi.mock('../../src/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, runPioCommand: vi.fn() };
});

import { runPioCommand } from '../../src/utils.js';
import { registerBuildTools } from '../../src/tools/build.js';
import { resolveWorkspace, pickRoot, invalidateWorkspaceCache } from '../../src/workspace.js';
import { TaskManager } from '../../src/tasks.js';
import { ERROR_CODES } from '../../src/errors.js';

const INI = `[platformio]
default_envs = esp32dev

[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino

[env:esp32-s3]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino
`;

const FAILED_OUTPUT = `Processing esp32dev (platform: espressif32; board: esp32dev; framework: arduino)
Compiling .pio/build/esp32dev/src/main.cpp.o
src/main.cpp:10:5: error: 'foo' was not declared in this scope
*** [.pio/build/esp32dev/src/main.cpp.o] Error 1
RAM:   [=         ]   9.8% (used 32000 bytes from 327680 bytes)
Flash: [==        ]  15.0% (used 629145 bytes from 4194304 bytes)
========================== [FAILED] Took 5.42 seconds ==========================`;

const SUCCESS_OUTPUT = `Processing esp32dev (platform: espressif32; board: esp32dev; framework: arduino)
Compiling .pio/build/esp32dev/src/main.cpp.o
RAM:   [=         ]   9.8% (used 32000 bytes from 327680 bytes)
Flash: [==        ]  15.0% (used 629145 bytes from 4194304 bytes)
========================== [SUCCESS] Took 5.42 seconds ==========================`;

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
let server;
let taskManager;
let tool;

beforeEach(() => {
  runPioCommand.mockReset();
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pioneer-build-'));
  fs.writeFileSync(path.join(projectDir, 'platformio.ini'), INI);
  server = makeServer();
  taskManager = new TaskManager();
  registerBuildTools(server, {
    explicitRoot: projectDir,
    workspaceFixed: true,
    taskManager,
    server,
  });
  tool = server.tools.get('pio_build');
});

afterEach(() => {
  taskManager.destroy();
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe('pio_build registration', () => {
  it('registers the tool with the documented input schema', () => {
    expect(tool).toBeDefined();
    expect(Object.keys(tool.config.inputSchema).sort()).toEqual([
      'async',
      'build_only',
      'environment',
      'include_memory',
      'incremental',
      'verbose',
    ]);
  });
});

describe('pio_build sync path', () => {
  it('drives the shared executor and returns the FR-1 response shape', async () => {
    runPioCommand.mockResolvedValue({
      stdout: SUCCESS_OUTPUT,
      stderr: '',
      combined: SUCCESS_OUTPUT,
      exitCode: 0,
    });

    const result = await tool.handler({ environment: 'esp32dev' });

    expect(runPioCommand).toHaveBeenCalledTimes(1);
    expect(runPioCommand).toHaveBeenCalledWith(['run', '-e', 'esp32dev'], { projectDir });

    expect(result.isError).toBeUndefined();
    const body = parseBody(result);
    expect(body).toMatchObject({
      success: true,
      exit_code: 0,
      incremental: false,
    });
    expect(Array.isArray(body.diagnostics)).toBe(true);
    expect(typeof body.summary).toBe('string');
    expect(body.metadata).toMatchObject({ duration_seconds: 5.42 });
  });

  it('adds no -e override so PlatformIO resolves default_envs itself', async () => {
    runPioCommand.mockResolvedValue({
      stdout: SUCCESS_OUTPUT,
      stderr: '',
      combined: SUCCESS_OUTPUT,
      exitCode: 0,
    });

    await tool.handler({});

    expect(runPioCommand).toHaveBeenCalledWith(['run'], { projectDir });
  });

  it('uses the compiledb target when build_only is set', async () => {
    runPioCommand.mockResolvedValue({
      stdout: SUCCESS_OUTPUT,
      stderr: '',
      combined: SUCCESS_OUTPUT,
      exitCode: 0,
    });

    await tool.handler({ environment: 'esp32dev', build_only: true });

    expect(runPioCommand).toHaveBeenCalledWith(
      ['run', '-e', 'esp32dev', '-t', 'compiledb'],
      { projectDir },
    );
  });

  it('reports a non-zero exit as BUILD_FAILED, keeping diagnostics in data', async () => {
    runPioCommand.mockRejectedValue({
      code: 1,
      stdout: FAILED_OUTPUT,
      stderr: '',
      combined: FAILED_OUTPUT,
      message: 'Command failed',
      timedOut: false,
    });

    const result = await tool.handler({ environment: 'esp32dev' });

    expect(result.isError).toBe(true);
    const { error } = parseBody(result);
    expect(error.code).toBe(ERROR_CODES.BUILD_FAILED);
    expect(error.data.exit_code).toBe(1);
    expect(error.data.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ file: 'src/main.cpp', line: 10 })]),
    );
  });

  it('detects a missing CLI as PIO_COMMAND_NOT_FOUND', async () => {
    runPioCommand.mockRejectedValue({
      code: 127,
      stdout: '',
      stderr: "sh: 1: pio: not found",
      combined: 'pio: command not found',
      message: 'spawn pio ENOENT',
      timedOut: false,
    });

    const result = await tool.handler({ environment: 'esp32dev' });

    expect(result.isError).toBe(true);
    expect(parseBody(result).error.code).toBe(ERROR_CODES.PIO_COMMAND_NOT_FOUND);
  });

  it('filters diagnostics by mtime only when incremental + environment are set', async () => {
    // Build cache newer than the stale source, so the stale file is dropped.
    fs.mkdirSync(path.join(projectDir, '.pio', 'build', 'esp32dev'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    const stale = path.join(projectDir, 'src', 'main.cpp');
    fs.writeFileSync(stale, 'void setup() {}\n');
    fs.utimesSync(stale, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'));
    fs.writeFileSync(path.join(projectDir, 'src', 'fresh.cpp'), 'void loop() {}\n');
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    fs.utimesSync(
      path.join(projectDir, '.pio', 'build', 'esp32dev'),
      oneHourAgo,
      oneHourAgo,
    );

    const output = `src/main.cpp:10:5: error: stale error
src/fresh.cpp:3:1: warning: fresh warning
src/gone.cpp:1:1: warning: file no longer exists
========================== [FAILED] Took 1.00 seconds ==========================`;
    runPioCommand.mockRejectedValue({
      code: 1,
      stdout: output,
      stderr: '',
      combined: output,
      message: 'Command failed',
      timedOut: false,
    });

    const result = await tool.handler({ environment: 'esp32dev', incremental: true });

    const { error } = parseBody(result);
    expect(error.code).toBe(ERROR_CODES.BUILD_FAILED);
    expect(error.data.diagnostics.map((d) => d.file)).toEqual(['src/fresh.cpp']);
  });
});

describe('pio_build async path', () => {
  it('routes the background build through the same executor and completes the task', async () => {
    runPioCommand.mockResolvedValue({
      stdout: SUCCESS_OUTPUT,
      stderr: '',
      combined: SUCCESS_OUTPUT,
      exitCode: 0,
    });

    const result = await tool.handler({ environment: 'esp32dev', async: true });

    const body = parseBody(result);
    expect(body.status).toBe('running');
    expect(runPioCommand).toHaveBeenCalledWith(['run', '-e', 'esp32dev'], { projectDir });

    await vi.waitFor(() => {
      expect(taskManager.getTask(body.task_id).status).toBe('completed');
    });
    expect(taskManager.getTask(body.task_id).result.success).toBe(true);
  });

  it('records a rejected background build as a failed task instead of throwing', async () => {
    runPioCommand.mockRejectedValue({
      code: 2,
      stdout: FAILED_OUTPUT,
      stderr: '',
      combined: FAILED_OUTPUT,
      message: 'Command failed',
      timedOut: false,
    });

    const result = await tool.handler({ environment: 'esp32dev', async: true });
    const body = parseBody(result);

    await vi.waitFor(() => {
      expect(taskManager.getTask(body.task_id).status).toBe('failed');
    });
    expect(taskManager.getTask(body.task_id)).toMatchObject({
      exit_code: 2,
      result: { success: false, exit_code: 2 },
    });
  });
});

// ---------------------------------------------------------------------------
// Workspace resolution (D-25 left src/workspace.js inside the covered set, so
// its roots/fallback/cache paths are exercised through the same handler seam)
// ---------------------------------------------------------------------------
describe('workspace resolution via handler context', () => {
  const rootsServer = (listRoots, capabilities = { roots: {} }) => ({
    getClientCapabilities: () => capabilities,
    listRoots,
    sendLoggingMessage: vi.fn(),
  });

  beforeEach(() => {
    invalidateWorkspaceCache();
  });

  afterEach(() => {
    invalidateWorkspaceCache();
  });

  it('uses the client roots capability and picks the PIO project', async () => {
    runPioCommand.mockResolvedValue({
      stdout: SUCCESS_OUTPUT,
      stderr: '',
      combined: SUCCESS_OUTPUT,
      exitCode: 0,
    });

    const scoped = makeServer();
    const lowLevel = rootsServer(async () => ({
      roots: [{ uri: `file://${projectDir}` }, { uri: 42 }, null, {}],
    }));
    registerBuildTools(scoped, {
      workspaceFixed: false,
      explicitRoot: null,
      taskManager,
      server: { ...scoped, server: lowLevel },
    });

    await scoped.tools.get('pio_build').handler({});

    expect(runPioCommand).toHaveBeenCalledWith(['run'], { projectDir });
  });

  it('finds a single PIO project one level below the workspace root', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pioneer-root-'));
    const child = path.join(parent, 'firmware');
    fs.mkdirSync(child);
    fs.writeFileSync(path.join(child, 'platformio.ini'), INI);

    try {
      const resolved = await resolveWorkspace({
        workspaceFixed: false,
        explicitRoot: null,
        server: { server: rootsServer(async () => ({ roots: [{ uri: `file://${parent}` }] })) },
      });
      expect(resolved).toEqual({ value: child, source: 'roots' });
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  it('falls back to cwd with an error log when roots/list rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const resolved = await resolveWorkspace({
      workspaceFixed: false,
      explicitRoot: null,
      server: {
        server: rootsServer(async () => {
          throw new Error('client gone');
        }),
      },
    });

    expect(resolved).toEqual({ value: process.cwd(), source: 'cwd' });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('client gone'));
    errorSpy.mockRestore();
  });

  it('falls back to cwd when the client advertises no roots', async () => {
    const listRoots = vi.fn();

    const resolved = await resolveWorkspace({
      workspaceFixed: false,
      explicitRoot: null,
      server: { server: rootsServer(listRoots, {}) },
    });

    expect(resolved.source).toBe('cwd');
    expect(listRoots).not.toHaveBeenCalled();
  });

  it('caches the roots result until invalidated', async () => {
    const listRoots = vi.fn(async () => ({ roots: [{ uri: `file://${projectDir}` }] }));
    const ctx = { workspaceFixed: false, explicitRoot: null, server: { server: rootsServer(listRoots) } };

    const first = await resolveWorkspace(ctx);
    const second = await resolveWorkspace(ctx);

    expect(first).toEqual(second);
    expect(listRoots).toHaveBeenCalledTimes(1);

    invalidateWorkspaceCache();
    await resolveWorkspace(ctx);
    expect(listRoots).toHaveBeenCalledTimes(2);
  });

  it('never asks the client for roots when an explicit root is fixed', async () => {
    const listRoots = vi.fn();

    const resolved = await resolveWorkspace({
      workspaceFixed: true,
      explicitRoot: projectDir,
      server: { server: rootsServer(listRoots) },
    });

    expect(resolved).toEqual({ value: projectDir, source: 'explicit' });
    expect(listRoots).not.toHaveBeenCalled();
  });

  it('pickRoot decodes file URIs, keeps Windows drive paths, and returns null for garbage', () => {
    expect(pickRoot([{ uri: 'file:///tmp/pioneer%20root' }])).toBe('/tmp/pioneer root');
    expect(pickRoot([{ uri: 'file:///C:/Users/x/proj' }])).toBe('C:/Users/x/proj');
    expect(pickRoot([{ uri: 'not-a-uri' }])).toBe('not-a-uri');
    expect(pickRoot([])).toBeNull();
    expect(pickRoot(null)).toBeNull();

    const missing = path.join(os.tmpdir(), 'pioneer-missing-root');
    expect(pickRoot([{ uri: `file://${missing}` }])).toBe(missing);
  });
});
