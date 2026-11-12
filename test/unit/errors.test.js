import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ERROR_CODES,
  PioMcpError,
  wrapToolError,
  assertWithinWorkspace,
  assertPioProject,
  assertEnvExists,
} from '../../src/errors.js';

const tempDirs = [];

function makeProject(iniContent = '[env:esp32dev]\n[env:esp32-s3]\n') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pio-errors-'));
  tempDirs.push(dir);
  if (iniContent !== null) {
    fs.writeFileSync(path.join(dir, 'platformio.ini'), iniContent);
  }
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('ERROR_CODES taxonomy', () => {
  it('pins every documented code to its JSON-RPC value', () => {
    expect(ERROR_CODES).toEqual({
      INVALID_PARAMS: -32602,
      INTERNAL_ERROR: -32603,
      PROJECT_NOT_FOUND: -32001,
      ENV_NOT_FOUND: -32002,
      BUILD_FAILED: -32003,
      UPLOAD_FAILED: -32004,
      PIO_NOT_INSTALLED: -32005,
      PORT_BUSY: -32006,
      PROJECT_OUTSIDE_WORKSPACE: -32007,
      NO_DEVICE: -32008,
      PIO_COMMAND_NOT_FOUND: -32009,
    });
  });
});

describe('PioMcpError', () => {
  it('carries the code, message, name, and data', () => {
    const err = new PioMcpError(ERROR_CODES.ENV_NOT_FOUND, 'nope', { envName: 'x' });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PioMcpError');
    expect(err.code).toBe(-32002);
    expect(err.message).toBe('nope');
    expect(err.data).toEqual({ envName: 'x' });
  });

  it('defaults data to an empty object', () => {
    expect(new PioMcpError(ERROR_CODES.INTERNAL_ERROR, 'boom').data).toEqual({});
  });
});

describe('wrapToolError', () => {
  it('returns a PioMcpError unchanged', () => {
    const err = new PioMcpError(ERROR_CODES.PORT_BUSY, 'busy');

    expect(wrapToolError(err)).toBe(err);
  });

  it('wraps an unknown Error as INTERNAL_ERROR with its stack', () => {
    const wrapped = wrapToolError(new Error('boom'));

    expect(wrapped).toBeInstanceOf(PioMcpError);
    expect(wrapped.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(wrapped.message).toBe('boom');
    expect(wrapped.data.stack).toContain('Error: boom');
  });

  it('falls back to a default message when the error has none', () => {
    const wrapped = wrapToolError({});

    expect(wrapped.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(wrapped.message).toBe('Unknown error');
  });
});

describe('assertPioProject', () => {
  it('throws PROJECT_NOT_FOUND for a temp dir without platformio.ini', () => {
    const dir = makeProject(null);

    try {
      assertPioProject(dir);
      expect.unreachable('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PioMcpError);
      expect(err.code).toBe(ERROR_CODES.PROJECT_NOT_FOUND);
      expect(err.message).toContain('platformio.ini');
      expect(err.data.projectDir).toBe(dir);
    }
  });

  it('returns silently when platformio.ini exists', () => {
    expect(() => assertPioProject(makeProject())).not.toThrow();
  });
});

describe('assertEnvExists', () => {
  it('throws ENV_NOT_FOUND listing the available environments', () => {
    const dir = makeProject();

    try {
      assertEnvExists(dir, 'nonexistent');
      expect.unreachable('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PioMcpError);
      expect(err.code).toBe(ERROR_CODES.ENV_NOT_FOUND);
      expect(err.data.available).toEqual(['esp32dev', 'esp32-s3']);
      expect(err.message).toContain('Available environments: esp32dev, esp32-s3');
    }
  });

  it('accepts an environment declared in platformio.ini, including hyphens', () => {
    const dir = makeProject('[env:esp32-s3]\n[env:my-board]\n');

    expect(() => assertEnvExists(dir, 'esp32-s3')).not.toThrow();
    expect(() => assertEnvExists(dir, 'my-board')).not.toThrow();
  });
});

describe('assertWithinWorkspace', () => {
  it('throws PROJECT_OUTSIDE_WORKSPACE for a path outside the root', () => {
    const root = makeProject();
    const outside = makeProject();

    try {
      assertWithinWorkspace(outside, root);
      expect.unreachable('expected a throw');
    } catch (err) {
      expect(err.code).toBe(ERROR_CODES.PROJECT_OUTSIDE_WORKSPACE);
      expect(err.data).toEqual({ projectDir: outside, workspaceRoot: root });
    }
  });

  it('allows a path inside the root and the root itself', () => {
    const root = makeProject();
    const inside = path.join(root, 'firmware', 'app');
    fs.mkdirSync(inside, { recursive: true });

    expect(() => assertWithinWorkspace(inside, root)).not.toThrow();
    expect(() => assertWithinWorkspace(root, root)).not.toThrow();
  });

  it('validates only project shape when the workspace is not fixed', () => {
    const root = makeProject();
    const noProject = makeProject(null);

    let thrown;
    try {
      assertWithinWorkspace(noProject, root, { workspaceFixed: false });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(PioMcpError);
    expect(thrown.code).toBe(ERROR_CODES.INVALID_PARAMS);
    expect(() => assertWithinWorkspace(makeProject(), root, { workspaceFixed: false }))
      .not.toThrow();
  });
});
