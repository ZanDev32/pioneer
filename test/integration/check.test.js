import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../src/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, runPioCommand: vi.fn() };
});

import { runPioCommand } from '../../src/utils.js';
import { registerCheckTools } from '../../src/tools/check.js';
import { ERROR_CODES } from '../../src/errors.js';

const INI = `[platformio]
default_envs = esp32dev

[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
`;

function checkJson(projectDir) {
  return JSON.stringify([
  {
    env: 'esp32dev',
    tool: 'cppcheck',
    defects: [
      {
        file: `${projectDir}/src/main.cpp`,
        line: 12,
        column: 3,
        severity: 'high',
        category: 'error',
        message: 'Null pointer dereference',
        id: 'nullPointer',
        cwe: 476,
      },
      {
        file: `${projectDir}/src/main.cpp`,
        line: 20,
        column: 1,
        severity: 'low',
        category: 'style',
        message: 'Unused variable',
        id: 'unusedVariable',
      },
    ],
  },
  ]);
}

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
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pioneer-check-'));
  fs.writeFileSync(path.join(projectDir, 'platformio.ini'), INI);
  const server = makeServer();
  registerCheckTools(server, {
    explicitRoot: projectDir,
    workspaceFixed: true,
    taskManager: { destroy: () => {} },
    server,
  });
  tool = server.tools.get('pio_check');
});

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe('pio_check', () => {
  it('registers the documented input schema', () => {
    expect(Object.keys(tool.config.inputSchema).sort()).toEqual([
      'environment',
      'severity',
      'tool',
      'verbose',
    ]);
  });

  it('tolerates tool-install noise before the JSON array (PlatformIO #4029)', async () => {
    runPioCommand.mockResolvedValue({
      stdout: `Downloading cppcheck package...\n${checkJson(projectDir)}`,
      stderr: '',
      combined: '',
      exitCode: 0,
    });

    const result = await tool.handler({ environment: 'esp32dev' });

    expect(runPioCommand).toHaveBeenCalledTimes(1);
    expect(runPioCommand).toHaveBeenCalledWith(
      ['check', '--json-output', '-e', 'esp32dev'],
      { projectDir },
    );

    const body = parseBody(result);
    expect(body).toMatchObject({
      success: true,
      exit_code: 0,
      tools_run: ['cppcheck'],
      environments: ['esp32dev'],
      total_defects: 2,
    });
    expect(body.diagnostics[0]).toMatchObject({
      file: 'src/main.cpp',
      line: 12,
      severity: 'high',
      tool: 'cppcheck',
      env: 'esp32dev',
    });
    expect(typeof body.summary).toBe('string');
  });

  it('passes the tool selector and severity as CLI flags', async () => {
    runPioCommand.mockResolvedValue({
      stdout: checkJson(projectDir),
      stderr: '',
      combined: '',
      exitCode: 0,
    });

    await tool.handler({ environment: 'esp32dev', tool: 'cppcheck', severity: 'high' });

    expect(runPioCommand).toHaveBeenCalledWith(
      ['check', '--json-output', '-e', 'esp32dev', '--flags', 'cppcheck:', '--severity', 'high'],
      { projectDir },
    );
  });

  it('keeps parsing defects when pio exits non-zero (defects are not failures)', async () => {
    runPioCommand.mockRejectedValue({
      code: 2,
      stdout: checkJson(projectDir),
      stderr: '',
      combined: checkJson(projectDir),
      message: 'Command failed',
      timedOut: false,
    });

    const body = parseBody(await tool.handler({ environment: 'esp32dev' }));

    expect(body).toMatchObject({ success: true, exit_code: 2, total_defects: 2 });
  });

  it('filters defects below the requested severity', async () => {
    runPioCommand.mockResolvedValue({
      stdout: checkJson(projectDir),
      stderr: '',
      combined: '',
      exitCode: 0,
    });

    const body = parseBody(
      await tool.handler({ environment: 'esp32dev', severity: 'high' }),
    );

    expect(body.diagnostics.map((d) => d.severity)).toEqual(['high']);
  });

  it('includes raw_results only under verbose', async () => {
    runPioCommand.mockResolvedValue({
      stdout: checkJson(projectDir),
      stderr: '',
      combined: '',
      exitCode: 0,
    });

    const body = parseBody(await tool.handler({ environment: 'esp32dev', verbose: true }));

    expect(body.raw_results).toEqual(JSON.parse(checkJson(projectDir)));
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

    const result = await tool.handler({ environment: 'esp32dev' });

    expect(result.isError).toBe(true);
    expect(parseBody(result).error.code).toBe(ERROR_CODES.PIO_COMMAND_NOT_FOUND);
  });
});
