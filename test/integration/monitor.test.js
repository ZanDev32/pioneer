import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

// One mocked boundary: the child-process module. No real `stty`, `cat`, or pio
// process is ever spawned; nothing opens a serial device.
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
}));

import { spawn, execFile } from 'child_process';
import { registerMonitorTools } from '../../src/tools/monitor.js';
import { TaskManager } from '../../src/tasks.js';
import { ERROR_CODES } from '../../src/errors.js';

const INI = `[platformio]
default_envs = esp32dev

[env:esp32dev]
platform = espressif32
board = esp32dev
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

function makeChild({ pid = 4242, exitCode = null } = {}) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = exitCode;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();
  child.unref = vi.fn();
  return child;
}

let projectDir;
let taskManager;
let server;
let child;

const call = (name, params) => server.tools.get(name).handler(params);

beforeEach(() => {
  execFile.mockReset();
  spawn.mockReset();
  execFile.mockImplementation((cmd, args, opts, cb) => cb(null, '', ''));
  child = makeChild();
  spawn.mockImplementation(() => child);

  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pioneer-monitor-'));
  fs.writeFileSync(path.join(projectDir, 'platformio.ini'), INI);
  taskManager = new TaskManager();
  server = makeServer();
  registerMonitorTools(server, {
    explicitRoot: projectDir,
    workspaceFixed: true,
    taskManager,
    server,
  });
});

afterEach(async () => {
  taskManager.destroy();
  // Let any open log write stream flush before the temp dir disappears
  await new Promise((resolve) => setTimeout(resolve, 20));
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe('pio_serial_start / read / stop', () => {
  it('sets the baud rate with stty, spawns cat, and tails then stops the log', async () => {
    const started = parseBody(await call('pio_serial_start', { port: '/dev/ttyUSB0', baud: 115200 }));

    expect(execFile).toHaveBeenCalledTimes(1);
    expect(execFile).toHaveBeenCalledWith(
      'stty',
      ['-F', '/dev/ttyUSB0', '115200', 'raw'],
      { cwd: projectDir },
      expect.any(Function),
    );
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith('cat', ['/dev/ttyUSB0'], {
      cwd: projectDir,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(child.unref).toHaveBeenCalled();

    expect(started).toMatchObject({
      success: true,
      pid: 4242,
      port: '/dev/ttyUSB0',
      baud: 115200,
    });
    expect(started.log_file.startsWith(path.join(projectDir, '.logs'))).toBe(true);

    // Device output is piped into the log
    child.stdout.write('boot ok\n');
    await new Promise((resolve) => setTimeout(resolve, 20));

    const read = parseBody(await call('pio_serial_read', { task_id: started.task_id, lines: 10 }));
    expect(read.success).toBe(true);
    expect(read.lines).toContain('boot ok');
    expect(read.log_file).toBe(started.log_file);

    const stopped = parseBody(await call('pio_serial_stop', { task_id: started.task_id }));
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(stopped).toMatchObject({ success: true, task_id: started.task_id });
    expect(stopped.lines_captured).toBeGreaterThanOrEqual(1);
    expect(taskManager.getTask(started.task_id).status).toBe('stopped');
  });

  it('reports PORT_BUSY when stty cannot acquire the port', async () => {
    execFile.mockImplementation((cmd, args, opts, cb) =>
      cb(new Error('stty: Device or resource busy'), '', 'stty: Device or resource busy'),
    );

    const result = await call('pio_serial_start', { port: '/dev/ttyUSB0', baud: 115200 });

    expect(result.isError).toBe(true);
    expect(parseBody(result).error.code).toBe(ERROR_CODES.PORT_BUSY);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('rejects a start without a port as NO_DEVICE', async () => {
    const result = await call('pio_serial_start', { baud: 115200 });

    expect(result.isError).toBe(true);
    expect(parseBody(result).error.code).toBe(ERROR_CODES.NO_DEVICE);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('returns empty lines with a message when the log file is gone', async () => {
    const body = parseBody(
      await call('pio_serial_read', { log_file: path.join(projectDir, 'nope.log') }),
    );

    expect(body).toMatchObject({ success: true, lines_read: 0, lines: [] });
  });

  it('errors on an unknown monitor task id for read and stop', async () => {
    const read = await call('pio_serial_read', { task_id: 'missing' });
    expect(read.isError).toBe(true);
    expect(parseBody(read)).toEqual({ error: 'Task not found', task_id: 'missing' });

    const stop = await call('pio_serial_stop', { task_id: 'missing' });
    expect(stop.isError).toBe(true);
    expect(parseBody(stop)).toEqual({ error: 'Task not found', task_id: 'missing' });
  });
});

describe('pio_serial_read / stop edge paths', () => {
  async function start(port = '/dev/ttyUSB0') {
    return parseBody(await call('pio_serial_start', { port, baud: 115200 }));
  }

  it('filters the tail with search_pattern', async () => {
    const started = await start();
    child.stdout.write('boot ok\nERROR: sensor timeout\n');
    await new Promise((resolve) => setTimeout(resolve, 20));

    const body = parseBody(
      await call('pio_serial_read', { task_id: started.task_id, search_pattern: 'ERROR' }),
    );

    expect(body.lines).toEqual(['ERROR: sensor timeout']);
    expect(body.search_pattern).toBe('ERROR');
  });

  it('deletes the log file when delete_log is true', async () => {
    const started = await start();

    const stopped = parseBody(
      await call('pio_serial_stop', { task_id: started.task_id, delete_log: true }),
    );

    expect(stopped.success).toBe(true);
    expect(fs.existsSync(started.log_file)).toBe(false);
  });

  it('marks the task completed when the child exits on its own', async () => {
    const started = await start();

    child.emit('exit', 0);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(taskManager.getTask(started.task_id)).toMatchObject({
      status: 'completed',
      exit_code: 0,
    });
  });

  it('rejects a log_file outside the project workspace', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pioneer-outside-'));
    const file = path.join(outside, 'serial.log');
    fs.writeFileSync(file, 'secret\n');

    try {
      const result = await call('pio_serial_read', { log_file: file });
      expect(parseBody(result).error.code).toBe(ERROR_CODES.PROJECT_OUTSIDE_WORKSPACE);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
