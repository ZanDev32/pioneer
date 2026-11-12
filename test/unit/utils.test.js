import { describe, it, expect, vi, beforeEach } from 'vitest';

// Intercept the module boundary: no unit test may spawn a real `pio` process.
vi.mock('child_process', () => ({ execFile: vi.fn() }));

import { execFile } from 'child_process';
import { runPioCommand, hasErrors } from '../../src/utils.js';

const MAX_BUFFER_DEFAULT = 50 * 1024 * 1024;

let lastCall;

function mockExecFile({ error = null, stdout = '', stderr = '' } = {}) {
  execFile.mockImplementation((command, args, options, callback) => {
    lastCall = { command, args, options, callback };
    callback(error, stdout, stderr);
  });
}

beforeEach(() => {
  execFile.mockReset();
  lastCall = undefined;
});

describe('runPioCommand', () => {
  it('invokes execFile with pio, the argv array, and workspace-aware defaults', async () => {
    mockExecFile({ stdout: 'ok', stderr: '' });

    await runPioCommand(['run', '-e', 'esp32dev'], { projectDir: '/tmp/project' });

    expect(execFile).toHaveBeenCalledTimes(1);
    expect(lastCall.command).toBe('pio');
    expect(lastCall.args).toEqual(['run', '-e', 'esp32dev']);
    expect(lastCall.options).toMatchObject({
      cwd: '/tmp/project',
      maxBuffer: MAX_BUFFER_DEFAULT,
    });
    expect(lastCall.options.env).not.toBe(process.env);
    expect(lastCall.options.env).toEqual(expect.objectContaining({ PATH: process.env.PATH }));
  });

  it('omits timeout when the option is falsy and forwards it when truthy', async () => {
    mockExecFile();

    await runPioCommand(['run'], { projectDir: '/tmp/project' });
    expect(lastCall.options).not.toHaveProperty('timeout');

    await runPioCommand(['run'], { projectDir: '/tmp/project', timeout: 0 });
    expect(lastCall.options).not.toHaveProperty('timeout');

    await runPioCommand(['run'], { projectDir: '/tmp/project', timeout: 20000 });
    expect(lastCall.options.timeout).toBe(20000);
  });

  it('honours a caller-supplied maxBuffer', async () => {
    mockExecFile();

    await runPioCommand(['run'], { projectDir: '/tmp/project', maxBuffer: 1024 });
    expect(lastCall.options.maxBuffer).toBe(1024);
  });

  it('resolves { stdout, stderr, combined, exitCode: 0 } on success', async () => {
    mockExecFile({ stdout: 'built', stderr: 'warning' });

    await expect(runPioCommand(['run'], { projectDir: '/tmp/project' })).resolves.toEqual({
      stdout: 'built',
      stderr: 'warning',
      combined: 'built\nwarning',
      exitCode: 0,
    });
  });

  it('rejects with the error shape on non-zero exit', async () => {
    const error = Object.assign(new Error('Command failed: pio run'), {
      code: 2,
      killed: false,
    });
    mockExecFile({ error, stdout: 'out', stderr: 'err' });

    await expect(runPioCommand(['run'], { projectDir: '/tmp/project' })).rejects.toEqual({
      code: 2,
      stdout: 'out',
      stderr: 'err',
      combined: 'out\nerr',
      message: 'Command failed: pio run',
      timedOut: false,
    });
  });

  it('coerces non-numeric error codes to 1 and flags a killed child as timedOut', async () => {
    const error = Object.assign(new Error('spawn pio ENOENT'), {
      code: 'ENOENT',
      killed: true,
    });
    mockExecFile({ error, stdout: '', stderr: '' });

    await expect(runPioCommand(['run'], { projectDir: '/tmp/project' })).rejects.toEqual({
      code: 1,
      stdout: '',
      stderr: '',
      combined: '\n',
      message: 'spawn pio ENOENT',
      timedOut: true,
    });
  });
});

describe('hasErrors', () => {
  it('is true for any error or fatal error diagnostic', () => {
    expect(hasErrors([{ type: 'warning' }, { type: 'error' }])).toBe(true);
    expect(hasErrors([{ type: 'fatal error' }])).toBe(true);
  });

  it('is false for warnings-only and empty input', () => {
    expect(hasErrors([{ type: 'warning' }, { type: 'note' }])).toBe(false);
    expect(hasErrors([])).toBe(false);
  });
});
