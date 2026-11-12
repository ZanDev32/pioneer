import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturesDir = path.join(repoRoot, 'test/fixtures/host-configs');
const SCOPED = '@zandev32/pioneer';

function readHostFixture(file) {
  return JSON.parse(readFileSync(path.join(fixturesDir, file), 'utf8'));
}

function serverEntry(host, config, topLevelKey) {
  expect(Object.keys(config), `${host}: top-level key must be "${topLevelKey}"`).toEqual([topLevelKey]);
  const entry = config[topLevelKey].pioneer;
  expect(entry, `${host}: missing ${topLevelKey}.pioneer entry`).toBeTypeOf('object');
  return entry;
}

function expectNpxLaunch(host, entry) {
  expect(entry.command, `${host}: command must be "npx"`).toBe('npx');
  expect(Array.isArray(entry.args), `${host}: args must be an array`).toBe(true);
  const pkgIndex = entry.args.indexOf(SCOPED);
  expect(pkgIndex, `${host}: args must contain ${SCOPED}`).toBeGreaterThan(-1);
  expect(entry.args[pkgIndex - 1], `${host}: -y must immediately precede ${SCOPED}`).toBe('-y');
}

describe('claude-desktop host config', () => {
  it('uses mcpServers, no type field, and a resolved project path', () => {
    const entry = serverEntry('claude-desktop', readHostFixture('claude-desktop.json'), 'mcpServers');

    expectNpxLaunch('claude-desktop', entry);
    expect(entry, 'claude-desktop: Claude Desktop has no "type" field').not.toHaveProperty('type');

    const workspaceIndex = entry.args.indexOf('--workspace');
    expect(workspaceIndex, 'claude-desktop: args must pass --workspace').toBeGreaterThan(-1);
    const workspace = entry.args[workspaceIndex + 1];
    expect(path.isAbsolute(workspace), `claude-desktop: workspace must be absolute, got "${workspace}"`).toBe(true);

    expect(entry.env, 'claude-desktop: env block carrying PIO_WORKSPACE_ROOT').toMatchObject({
      PIO_WORKSPACE_ROOT: workspace,
    });
  });
});

describe('cursor host config', () => {
  it('uses mcpServers with type stdio and the workspaceFolder variable', () => {
    const entry = serverEntry('cursor', readHostFixture('cursor.json'), 'mcpServers');

    expectNpxLaunch('cursor', entry);
    expect(entry.type, 'cursor: type must be "stdio"').toBe('stdio');
    expect(entry.args, 'cursor: args must pass --workspace ${workspaceFolder}').toEqual(
      expect.arrayContaining(['--workspace', '${workspaceFolder}']),
    );
  });
});

describe('vscode host config', () => {
  it('uses servers with type stdio, cwd, and PIO_WORKSPACE_ROOT', () => {
    const entry = serverEntry('vscode', readHostFixture('vscode.json'), 'servers');

    expectNpxLaunch('vscode', entry);
    expect(entry.type, 'vscode: type must be "stdio"').toBe('stdio');
    expect(entry.cwd, 'vscode: cwd must be ${workspaceFolder}').toBe('${workspaceFolder}');
    expect(entry.env, 'vscode: env must carry PIO_WORKSPACE_ROOT').toMatchObject({
      PIO_WORKSPACE_ROOT: '${workspaceFolder}',
    });
  });
});

describe('README install paths', () => {
  const readme = readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

  it('documents zero-install, global install, and clone-and-build', () => {
    expect(readme, 'README: zero-install path via npx').toContain('npx @zandev32/pioneer');
    expect(readme, 'README: global install path').toContain('npm i -g @zandev32/pioneer');
    expect(readme, 'README: clone-and-build path').toContain('npm ci');
  });

  it('names every supported host', () => {
    for (const host of ['Claude Desktop', 'Cursor', 'VS Code']) {
      expect(readme, `README: missing ${host} configuration`).toContain(host);
    }
  });

  it('uses the same npx -y scoped-package launch shape as the fixtures', () => {
    expect(readme, 'README: scoped package with -y').toContain('npx -y @zandev32/pioneer');
    const blocks = readme.match(/"command": "npx"/g) ?? [];
    expect(blocks.length, 'README: one npx block per host').toBeGreaterThanOrEqual(3);
  });
});

describe('fixture hygiene', () => {
  it('leaves no placeholder tokens behind', () => {
    for (const file of ['claude-desktop.json', 'cursor.json', 'vscode.json']) {
      const raw = readFileSync(path.join(fixturesDir, file), 'utf8');
      expect(raw, `${file}: placeholder token left in fixture`).not.toMatch(/<|TODO|CHANGEME|xxxx/);
    }
  });
});
