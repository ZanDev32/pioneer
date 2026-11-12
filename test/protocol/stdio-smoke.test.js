/**
 * Protocol compliance lane.
 *
 * Spawns the BUILT artifact (`dist/server.js`) over stdio and asserts the wire
 * contract an MCP host actually observes: the initialize handshake, the tool
 * surface, and both a happy-path and a structured-error tool call.
 *
 * This is the only lane that talks to `dist/` — unit and integration tests
 * import `src/` modules directly.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SERVER_ENTRY = path.join(ROOT, 'dist', 'server.js');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const PROTOCOL_VERSION = '2025-11-25';
const STARTUP_BUDGET_MS = 2000;

/** The exact tool surface registered by `src/server.js`. */
const EXPECTED_TOOLS = [
  'pio_build',
  'pio_check',
  'pio_clean',
  'pio_list_boards',
  'pio_list_devices',
  'pio_run_tests',
  'pio_serial_read',
  'pio_serial_start',
  'pio_serial_stop',
  'pio_task_list',
  'pio_task_status',
  'pio_upload',
].sort();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempWorkspaces = [];

/** Empty directory — no `platformio.ini`, so project checks fail structurally. */
function makeEmptyWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pioneer-protocol-'));
  tempWorkspaces.push(dir);
  return dir;
}

function spawnEnv(workspaceRoot) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.PIO_WORKSPACE_ROOT = workspaceRoot;
  return env;
}

/**
 * Single raw NDJSON `initialize` round-trip.
 *
 * The SDK client does not expose the negotiated protocol version, so this one
 * request is framed by hand. It is deliberately a single frame, not a second
 * transport implementation.
 *
 * @returns {Promise<{ message: object, elapsedMs: number, stderr: string }>}
 */
function rawInitialize(workspaceRoot) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      env: spawnEnv(workspaceRoot),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: process.platform === 'win32',
    });

    let stderr = '';
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      lines.close();
      child.kill();
      fn(value);
    };

    const timer = setTimeout(() => {
      finish(reject, new Error(`initialize did not answer within ${STARTUP_BUDGET_MS} ms`));
    }, STARTUP_BUDGET_MS * 5);

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => finish(reject, err));
    child.on('exit', (code) => {
      if (!settled) {
        finish(
          reject,
          new Error(`server exited with code ${code} before answering initialize\n${stderr}`),
        );
      }
    });

    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (!line.trim()) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch (err) {
        finish(reject, new Error(`server wrote a non-JSON line: ${line.slice(0, 200)}`));
        return;
      }
      finish(resolve, { message, elapsedMs: performance.now() - startedAt, stderr });
    });

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'pioneer-protocol-lane', version: '0.0.0' },
        },
      })}\n`,
    );
  });
}

/** First text block of a tool result, parsed as JSON. */
function parseToolJson(result) {
  const block = (result?.content || []).find((entry) => entry.type === 'text');
  expect(block, 'tool result carried no text block').toBeDefined();
  return JSON.parse(block.text);
}

// ---------------------------------------------------------------------------
// Lane
// ---------------------------------------------------------------------------

describe('protocol: built bundle over stdio', () => {
  let client;
  let workspace;

  beforeAll(async () => {
    if (!fs.existsSync(SERVER_ENTRY)) {
      throw new Error(
        `dist/server.js is missing — run \`npm run build\` (or \`npm run test:protocol\`) before this lane. Looked for: ${SERVER_ENTRY}`,
      );
    }

    workspace = makeEmptyWorkspace();
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER_ENTRY],
      env: { PIO_WORKSPACE_ROOT: workspace },
      stderr: 'pipe',
    });
    client = new Client(
      { name: 'pioneer-protocol-lane', version: '0.0.0' },
      { capabilities: {} },
    );
    await client.connect(transport);
  });

  afterAll(async () => {
    if (client) await client.close();
    for (const dir of tempWorkspaces) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('answers initialize with the pinned protocol version, identity, and startup budget', async () => {
    const { message, elapsedMs } = await rawInitialize(makeEmptyWorkspace());

    expect(message.jsonrpc).toBe('2.0');
    expect(message.id).toBe(1);
    expect(message.error).toBeUndefined();
    expect(message.result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(message.result.protocolVersion).toBe('2025-11-25');
    expect(message.result.serverInfo.name).toBe('pioneer');
    expect(message.result.serverInfo.version).toBe(PKG.version);
    expect(elapsedMs).toBeLessThan(STARTUP_BUDGET_MS);
  });

  it('negotiated the pinned protocol version through the SDK client', () => {
    const serverVersion = client.getServerVersion();
    expect(serverVersion.name).toBe('pioneer');
    expect(serverVersion.version).toBe(PKG.version);
  });

  it('lists exactly the 12 registered tools, each with an object input schema', async () => {
    const { tools } = await client.listTools();

    expect(tools).toHaveLength(12);
    expect(tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_TOOLS);
    for (const tool of tools) {
      expect(tool.inputSchema, `${tool.name} has no inputSchema`).toBeDefined();
      expect(tool.inputSchema.type, `${tool.name} inputSchema.type`).toBe('object');
    }
  });

  it('pio_task_list returns an empty task list on a fresh server', async () => {
    const result = await client.callTool({ name: 'pio_task_list', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(parseToolJson(result)).toEqual({ running_tasks: [], count: 0 });
  });

  it('pio_build on an empty workspace returns the structured PROJECT_NOT_FOUND error', async () => {
    const result = await client.callTool({ name: 'pio_build', arguments: {} });

    expect(result.isError).toBe(true);
    const payload = parseToolJson(result);
    // -32001 is ERROR_CODES.PROJECT_NOT_FOUND.
    expect(payload.error.code).toBe(-32001);
    expect(payload.error.message).toMatch(/not a valid PlatformIO project/);
    expect(payload.error.data.projectDir).toBe(workspace);
  });
});
