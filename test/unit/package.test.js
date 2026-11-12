import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const bundlePath = path.join(repoRoot, 'dist', 'server.js');
const bundleBuilt = existsSync(bundlePath);
const PACKAGE_METADATA = ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md'];
const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;

async function packedFiles() {
  const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  const parsed = JSON.parse(stdout);
  const envelope = Array.isArray(parsed) ? parsed[0] : parsed[pkg.name] ?? Object.values(parsed)[0];
  return envelope.files.map((file) => file.path);
}

describe('package identity', () => {
  it('declares the scoped name, bin target, and dist-only allowlist', () => {
    expect(pkg.name).toBe('@zandev32/pioneer');
    expect(pkg.bin.pioneer).toBe('./dist/server.js');
    expect(pkg.files).toEqual(['dist/']);
  });

  it('no script uses the Jest vm-modules flag', () => {
    expect(Object.values(pkg.scripts).some((script) => script.includes('experimental-vm-modules'))).toBe(false);
  });
});

describe('packed tarball', () => {
  it('ships only dist/ plus package metadata', async () => {
    const files = await packedFiles();

    for (const file of files) {
      const allowed = file.startsWith('dist/') || PACKAGE_METADATA.includes(file);
      expect(allowed, `unexpected packed path: ${file}`).toBe(true);
    }

    if (bundleBuilt) {
      expect(files).toContain('dist/server.js');
    }
  });
});

describe.skipIf(!bundleBuilt)('built bundle', () => {
  it('is a single file under the 5 MB ceiling', () => {
    expect(statSync(bundlePath).size).toBeLessThan(MAX_BUNDLE_BYTES);
  });

  it('reports the package.json version in the help banner', async () => {
    const { stdout } = await execFileAsync('node', [bundlePath, '--help'], { cwd: repoRoot });
    expect(stdout).toContain(pkg.version);
  });
});
