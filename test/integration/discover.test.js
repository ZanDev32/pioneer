import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

vi.mock('../../src/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, runPioCommand: vi.fn() };
});

import { runPioCommand } from '../../src/utils.js';
import { registerDiscoverTools } from '../../src/tools/discover.js';
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

function call(toolName, params) {
  const tool = server.tools.get(toolName);
  return tool.handler(z.object(tool.config.inputSchema).parse(params));
}

beforeEach(() => {
  runPioCommand.mockReset();
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pioneer-discover-'));
  fs.writeFileSync(path.join(projectDir, 'platformio.ini'), INI);
  server = makeServer();
  registerDiscoverTools(server, {
    explicitRoot: projectDir,
    workspaceFixed: true,
    taskManager: { destroy: () => {} },
    server,
  });
});

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe('pio_list_devices', () => {
  it('registers the documented filter schema', () => {
    const tool = server.tools.get('pio_list_devices');
    expect(tool).toBeDefined();
    expect(Object.keys(tool.config.inputSchema)).toEqual(['filter']);
    expect(z.object(tool.config.inputSchema).parse({}).filter).toBe('serial');
  });

  it('runs device list with --json-output and normalizes the payload', async () => {
    runPioCommand.mockResolvedValue({
      stdout: JSON.stringify([
        {
          port: '/dev/ttyUSB0',
          hwid: 'USB VID:PID=10C4:EA60',
          description: 'CP2102 USB to UART Bridge',
        },
      ]),
      stderr: '',
      combined: '',
      exitCode: 0,
    });

    const body = parseBody(await call('pio_list_devices', {}));

    expect(runPioCommand).toHaveBeenCalledTimes(1);
    expect(runPioCommand).toHaveBeenCalledWith(
      ['device', 'list', '--serial', '--json-output'],
      { projectDir },
    );
    expect(body).toMatchObject({ success: true, filter: 'serial', count: 1 });
    expect(body.devices[0]).toMatchObject({
      port: '/dev/ttyUSB0',
      hwid: 'USB VID:PID=10C4:EA60',
      type: 'serial',
    });
  });

  it('drops kernel virtual ports and entries without a hardware id', async () => {
    runPioCommand.mockResolvedValue({
      stdout: JSON.stringify([
        { port: '/dev/ttyS0', hwid: 'n/a', description: 'virtual' },
        { port: '/dev/ttyUSB1', hwid: '', description: 'no hwid' },
        { port: '/dev/ttyUSB2', hwid: 'USB VID:PID=1A86:7523', description: 'CH340' },
      ]),
      stderr: '',
      combined: '',
      exitCode: 0,
    });

    const body = parseBody(await call('pio_list_devices', {}));

    expect(body.devices.map((d) => d.port)).toEqual(['/dev/ttyUSB2']);
    expect(body.count).toBe(1);
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

    const result = await call('pio_list_devices', {});

    expect(result.isError).toBe(true);
    expect(parseBody(result).error.code).toBe(ERROR_CODES.PIO_COMMAND_NOT_FOUND);
  });
});

describe('pio_list_boards', () => {
  it('parses environments from the temp-dir platformio.ini fixture', async () => {
    const result = await call('pio_list_boards', {});

    expect(runPioCommand).not.toHaveBeenCalled();
    const body = parseBody(result);
    expect(body).toMatchObject({
      success: true,
      default_envs: ['esp32dev'],
      count: 2,
    });
    expect(body.environments).toEqual([
      { env: 'esp32dev', board: 'esp32dev', platform: 'espressif32', framework: 'arduino' },
      {
        env: 'esp32-s3',
        board: 'esp32-s3-devkitc-1',
        platform: 'espressif32',
        framework: 'arduino',
      },
    ]);
  });

  it('returns PROJECT_NOT_FOUND without a platformio.ini', async () => {
    fs.rmSync(path.join(projectDir, 'platformio.ini'));

    const result = await call('pio_list_boards', {});

    expect(result.isError).toBe(true);
    expect(parseBody(result).error.code).toBe(ERROR_CODES.PROJECT_NOT_FOUND);
  });
});

// ---------------------------------------------------------------------------
// Extra platformio.ini shapes (extra_configs, [env] defaults, broken lines)
// ---------------------------------------------------------------------------
describe('pio_list_boards platformio.ini variants', () => {
  const MAIN_INI = `[platformio]
default_envs = esp32dev
extra_configs = extra/*.ini

[env]
platform = atmelavr
framework = arduino

[env:nano]
board = nanoatmega328

[env:esp32dev]
board = esp32dev
platform = espressif32
`;

  it('merges extra_configs globs and applies [env] defaults', async () => {
    fs.writeFileSync(path.join(projectDir, 'platformio.ini'), MAIN_INI);
    fs.mkdirSync(path.join(projectDir, 'extra'));
    fs.writeFileSync(
      path.join(projectDir, 'extra', 'esp32.ini'),
      `[env:nano]
framework = arduino
this line has no equals sign
`,
    );

    const body = parseBody(await call('pio_list_boards', {}));

    expect(body.default_envs).toEqual(['esp32dev']);
    expect(body.environments).toEqual([
      { env: 'nano', board: 'nanoatmega328', platform: 'atmelavr', framework: 'arduino' },
      { env: 'esp32dev', board: 'esp32dev', platform: 'espressif32', framework: 'arduino' },
    ]);
  });

  it('accepts a direct extra_configs path', async () => {
    fs.writeFileSync(
      path.join(projectDir, 'platformio.ini'),
      `[platformio]
default_envs = esp32dev
extra_configs = extra_direct.ini

[env:esp32dev]
board = esp32dev
platform = espressif32
framework = arduino
`,
    );
    fs.writeFileSync(
      path.join(projectDir, 'extra_direct.ini'),
      '[env:esp32c3]\nboard = esp32-c3-devkitm-1\nplatform = espressif32\nframework = arduino\n',
    );

    const body = parseBody(await call('pio_list_boards', {}));

    expect(body.count).toBe(2);
    expect(body.environments.map((e) => e.env)).toEqual(['esp32dev', 'esp32c3']);
  });
});

describe('pio_list_devices variants', () => {
  it('returns an empty list when the CLI emits unparseable output', async () => {
    runPioCommand.mockResolvedValue({
      stdout: 'not json at all',
      stderr: '',
      combined: 'not json at all',
      exitCode: 0,
    });

    const body = parseBody(await call('pio_list_devices', {}));

    expect(body).toMatchObject({ success: true, devices: [], count: 0 });
  });

  it('skips the USB-only filtering for logical devices', async () => {
    runPioCommand.mockResolvedValue({
      stdout: JSON.stringify([{ port: 'logical-1', hwid: '', description: 'loopback' }]),
      stderr: '',
      combined: '',
      exitCode: 0,
    });

    const body = parseBody(await call('pio_list_devices', { filter: 'logical' }));

    expect(runPioCommand).toHaveBeenCalledWith(
      ['device', 'list', '--logical', '--json-output'],
      { projectDir },
    );
    expect(body).toMatchObject({ filter: 'logical', count: 1 });
  });
});
