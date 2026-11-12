import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseBuildMetadata,
  parseIncrementalDiagnostics,
  getDirSize,
} from '../../src/metadata.js';

const BUILD_OUTPUT = [
  'Compiling .pio/build/esp32dev/src/main.cpp.o',
  'Took 4.21 seconds',
  'RAM:   [=         ]   9.8% (used 32000 bytes from 327680 bytes)',
  'Flash: [==        ]   5.9% (used 245760 bytes from 4194304 bytes)',
  '',
].join('\n');

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pio-metadata-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('parseBuildMetadata', () => {
  it('extracts duration, RAM/Flash usage, and nothing else from a plain log', () => {
    expect(parseBuildMetadata(BUILD_OUTPUT)).toEqual({
      duration_seconds: 4.21,
      binary_size_bytes: null,
      memory: {
        ram_percent: 9.8,
        ram_used_bytes: 32000,
        ram_total_bytes: 327680,
        flash_percent: 5.9,
        flash_used_bytes: 245760,
        flash_total_bytes: 4194304,
      },
    });
  });

  it('returns null fields instead of throwing when sections are missing', () => {
    expect(parseBuildMetadata('Compiling...\nSUCCESS\n')).toEqual({
      duration_seconds: null,
      binary_size_bytes: null,
      memory: null,
    });
  });

  it('reports the firmware.bin size for the given env', () => {
    const projectDir = makeTempDir();
    const binPath = path.join(projectDir, '.pio', 'build', 'esp32dev', 'firmware.bin');
    fs.mkdirSync(path.dirname(binPath), { recursive: true });
    fs.writeFileSync(binPath, Buffer.alloc(7));

    expect(parseBuildMetadata(BUILD_OUTPUT, projectDir, 'esp32dev').binary_size_bytes)
      .toBe(7);
  });

  it('falls back to firmware.elf when no firmware.bin exists', () => {
    const projectDir = makeTempDir();
    const elfPath = path.join(projectDir, '.pio', 'build', 'esp32dev', 'firmware.elf');
    fs.mkdirSync(path.dirname(elfPath), { recursive: true });
    fs.writeFileSync(elfPath, Buffer.alloc(11));

    expect(parseBuildMetadata('', projectDir, 'esp32dev').binary_size_bytes).toBe(11);
  });

  it('leaves the binary size null when no artifact exists', () => {
    const projectDir = makeTempDir();

    expect(parseBuildMetadata('', projectDir, 'esp32dev').binary_size_bytes).toBeNull();
  });
});

describe('parseIncrementalDiagnostics', () => {
  const diagnostics = [
    { file: 'src/old.cpp', line: 3, message: 'stale error' },
    { file: 'src/new.cpp', line: 4, message: 'fresh error' },
    { file: '', line: 0, message: 'linker error' },
  ];

  function makeBuiltProject() {
    const projectDir = makeTempDir();
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    const cacheDir = path.join(projectDir, '.pio', 'build', 'esp32dev');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'src', 'old.cpp'), 'x');
    fs.writeFileSync(path.join(projectDir, 'src', 'new.cpp'), 'x');

    const seconds = Date.now() / 1000;
    fs.utimesSync(cacheDir, seconds - 60, seconds - 60);
    fs.utimesSync(path.join(projectDir, 'src', 'old.cpp'), seconds - 120, seconds - 120);
    fs.utimesSync(path.join(projectDir, 'src', 'new.cpp'), seconds + 60, seconds + 60);

    return projectDir;
  }

  it('keeps only diagnostics from files newer than the build cache', () => {
    const projectDir = makeBuiltProject();

    expect(parseIncrementalDiagnostics(projectDir, 'esp32dev', diagnostics)).toEqual([
      { file: 'src/new.cpp', line: 4, message: 'fresh error' },
      { file: '', line: 0, message: 'linker error' },
    ]);
  });

  it('returns every diagnostic on the first build (no cache dir)', () => {
    const projectDir = makeBuiltProject();

    expect(parseIncrementalDiagnostics(projectDir, 'other-env', diagnostics))
      .toEqual(diagnostics);
  });
});

describe('getDirSize', () => {
  it('returns 0 for a missing directory', () => {
    expect(getDirSize(path.join(makeTempDir(), 'does-not-exist'))).toBe(0);
  });

  it('sums nested file sizes', () => {
    const root = makeTempDir();
    fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a', 'one.bin'), Buffer.alloc(10));
    fs.writeFileSync(path.join(root, 'a', 'b', 'two.bin'), Buffer.alloc(25));

    expect(getDirSize(root)).toBe(35);
  });
});
