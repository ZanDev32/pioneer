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
import { registerCleanTools } from '../../src/tools/clean.js';
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
let tool;

beforeEach(() => {
  runPioCommand.mockReset();
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pioneer-clean-'));
  fs.writeFileSync(path.join(projectDir, 'platformio.ini'), INI);
  const server = makeServer();
  registerCleanTools(server, {
    explicitRoot: projectDir,
    workspaceFixed: true,
    taskManager: { destroy: () => {} },
    server,
  });
  tool = server.tools.get('pio_clean');
});

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe('pio_clean registration', () => {
  it('requires environment in the schema and accepts verbose', () => {
    expect(Object.keys(tool.config.inputSchema).sort()).toEqual(['environment', 'verbose']);

    const schema = z.object(tool.config.inputSchema);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ environment: 'esp32dev' }).success).toBe(true);
  });
});

describe('pio_clean handler', () => {
  it('cleans one environment at a time and reports bytes_freed', async () => {
    const buildDir = path.join(projectDir, '.pio', 'build', 'esp32dev');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'firmware.bin'), Buffer.alloc(2048, 1));
    // Symlinks are skipped by getDirSize — they must not inflate bytes_freed
    const outside = path.join(projectDir, 'outside.bin');
    fs.writeFileSync(outside, Buffer.alloc(4096, 1));
    fs.symlinkSync(outside, path.join(buildDir, 'linked.bin'));

    // Simulate the CLI's work — the test deletes what pio would delete.
    runPioCommand.mockImplementation(async (args) => {
      fs.rmSync(buildDir, { recursive: true, force: true });
      return {
        stdout: 'Removing .pio/build/esp32dev',
        stderr: '',
        combined: 'Removing .pio/build/esp32dev',
        exitCode: 0,
      };
    });

    const result = await tool.handler({ environment: 'esp32dev' });

    expect(runPioCommand).toHaveBeenCalledTimes(1);
    expect(runPioCommand).toHaveBeenCalledWith(
      ['run', '-t', 'clean', '-e', 'esp32dev'],
      { projectDir },
    );

    const body = parseBody(result);
    expect(body).toMatchObject({ success: true, environment: 'esp32dev' });
    expect(body.bytes_freed).toBe(2048);
    expect(body).not.toHaveProperty('raw_output');
  });

  it('includes raw_output only under verbose', async () => {
    runPioCommand.mockResolvedValue({
      stdout: 'clean output',
      stderr: '',
      combined: 'clean output',
      exitCode: 0,
    });

    const body = parseBody(await tool.handler({ environment: 'esp32dev', verbose: true }));

    expect(body.raw_output).toBe('clean output');
  });

  it('reports per-environment validation failures from the workspace', async () => {
    const result = await tool.handler({ environment: 'does-not-exist' });

    expect(runPioCommand).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(parseBody(result).error.code).toBe(ERROR_CODES.ENV_NOT_FOUND);
  });

  it('returns PROJECT_NOT_FOUND when the directory has no platformio.ini', async () => {
    fs.rmSync(path.join(projectDir, 'platformio.ini'));

    const result = await tool.handler({ environment: 'esp32dev' });

    expect(runPioCommand).not.toHaveBeenCalled();
    expect(parseBody(result).error.code).toBe(ERROR_CODES.PROJECT_NOT_FOUND);
  });

  it('returns success:false (not a thrown error) when the CLI exits non-zero', async () => {
    runPioCommand.mockRejectedValue({
      code: 1,
      stdout: '',
      stderr: 'Permission denied',
      combined: 'Permission denied',
      message: 'Command failed',
      timedOut: false,
    });

    const result = await tool.handler({ environment: 'esp32dev' });

    expect(result.isError).toBeUndefined();
    expect(parseBody(result)).toMatchObject({ success: false, environment: 'esp32dev' });
  });
});
