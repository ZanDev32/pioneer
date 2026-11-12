import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../src/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, runPioCommand: vi.fn() };
});

import { runPioCommand } from '../../src/utils.js';
import { registerUploadTools } from '../../src/tools/upload.js';
import { TaskManager } from '../../src/tasks.js';
import { ERROR_CODES } from '../../src/errors.js';

const INI = `[platformio]
default_envs = esp32dev

[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
`;

const UPLOAD_OUTPUT = `Processing esp32dev (platform: espressif32; board: esp32dev; framework: arduino)
Checking size .pio/build/esp32dev/firmware.bin
RAM:   [=         ]   9.8% (used 32000 bytes from 327680 bytes)
Flash: [==        ]  15.0% (used 629145 bytes from 4194304 bytes)
Configuring upload protocol...
Looking for upload port...
Auto-detected: /dev/ttyUSB0
Uploading .pio/build/esp32dev/firmware.bin
========================== [SUCCESS] Took 8.20 seconds ==========================`;

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

beforeEach(() => {
  runPioCommand.mockReset();
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pioneer-upload-'));
  fs.writeFileSync(path.join(projectDir, 'platformio.ini'), INI);
  const server = makeServer();
  taskManager = new TaskManager();
  registerUploadTools(server, {
    explicitRoot: projectDir,
    workspaceFixed: true,
    taskManager,
    server,
  });
  tool = server.tools.get('pio_upload');
});

afterEach(() => {
  taskManager.destroy();
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe('pio_upload registration', () => {
  it('registers the tool with the documented input schema', () => {
    expect(tool).toBeDefined();
    expect(Object.keys(tool.config.inputSchema).sort()).toEqual([
      'async',
      'environment',
      'port',
      'verbose',
    ]);
  });
});

describe('pio_upload sync path', () => {
  it('builds the -t upload argv with -e and -p and returns the FR-2 shape', async () => {
    runPioCommand.mockResolvedValue({
      stdout: UPLOAD_OUTPUT,
      stderr: '',
      combined: UPLOAD_OUTPUT,
      exitCode: 0,
    });

    const result = await tool.handler({ environment: 'esp32dev', port: '/dev/ttyUSB0' });

    expect(runPioCommand).toHaveBeenCalledTimes(1);
    expect(runPioCommand).toHaveBeenCalledWith(
      ['run', '-t', 'upload', '-e', 'esp32dev', '-p', '/dev/ttyUSB0'],
      { projectDir },
    );

    const body = parseBody(result);
    expect(body).toMatchObject({
      success: true,
      exit_code: 0,
      port: '/dev/ttyUSB0',
    });
    expect(Array.isArray(body.diagnostics)).toBe(true);
    expect(typeof body.summary).toBe('string');
    expect(body.metadata).toMatchObject({ duration_seconds: 8.2 });
  });

  it('omits -p when no port is supplied', async () => {
    runPioCommand.mockResolvedValue({
      stdout: UPLOAD_OUTPUT,
      stderr: '',
      combined: UPLOAD_OUTPUT,
      exitCode: 0,
    });

    const body = parseBody(await tool.handler({ environment: 'esp32dev' }));

    expect(runPioCommand).toHaveBeenCalledWith(
      ['run', '-t', 'upload', '-e', 'esp32dev'],
      { projectDir },
    );
    expect(body.port).toBeNull();
  });

  it('reports a missing device as NO_DEVICE', async () => {
    const noDevice = 'Looking for upload port...\nError: Please specify `upload_port` — no serial ports found.';
    runPioCommand.mockRejectedValue({
      code: 1,
      stdout: noDevice,
      stderr: '',
      combined: noDevice,
      message: 'Command failed',
      timedOut: false,
    });

    const result = await tool.handler({ environment: 'esp32dev' });

    expect(result.isError).toBe(true);
    expect(parseBody(result).error.code).toBe(ERROR_CODES.NO_DEVICE);
  });

  it('detects a missing CLI as PIO_COMMAND_NOT_FOUND', async () => {
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

describe('pio_upload async path', () => {
  it('routes the background upload through the shared executor', async () => {
    runPioCommand.mockResolvedValue({
      stdout: UPLOAD_OUTPUT,
      stderr: '',
      combined: UPLOAD_OUTPUT,
      exitCode: 0,
    });

    const body = parseBody(
      await tool.handler({ environment: 'esp32dev', port: '/dev/ttyUSB0', async: true }),
    );

    expect(body.status).toBe('running');
    expect(runPioCommand).toHaveBeenCalledWith(
      ['run', '-t', 'upload', '-e', 'esp32dev', '-p', '/dev/ttyUSB0'],
      { projectDir },
    );

    await vi.waitFor(() => {
      expect(taskManager.getTask(body.task_id).status).toBe('completed');
    });
    expect(taskManager.getTask(body.task_id).result.success).toBe(true);
  });

  it('records a rejected background upload as a failed task', async () => {
    runPioCommand.mockRejectedValue({
      code: 3,
      stdout: UPLOAD_OUTPUT,
      stderr: '',
      combined: UPLOAD_OUTPUT,
      message: 'Command failed',
      timedOut: false,
    });

    const body = parseBody(await tool.handler({ environment: 'esp32dev', async: true }));

    await vi.waitFor(() => {
      expect(taskManager.getTask(body.task_id).status).toBe('failed');
    });
    expect(taskManager.getTask(body.task_id).exit_code).toBe(3);
  });
});
