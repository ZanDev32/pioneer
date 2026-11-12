import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerMonitorTools } from '../../src/tools/monitor.js';
import { ERROR_CODES } from '../../src/errors.js';
import { TaskManager } from '../../src/tasks.js';

/**
 * Minimal MCP server stub: records tools registered via the v1 API so the
 * test can invoke a handler directly. No transport, no real server.
 */
function makeStubServer() {
  const tools = new Map();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
    server: { sendLoggingMessage: vi.fn() },
  };
}

function parseResult(result) {
  return JSON.parse(result.content[0].text);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pio_serial_start platform guard (D-22)', () => {
  it('returns PLATFORM_UNSUPPORTED naming the constraint and the WSL alternative on win32', async () => {
    const server = makeStubServer();
    const taskManager = new TaskManager();
    const ctx = {
      explicitRoot: process.cwd(),
      workspaceFixed: true,
      taskManager,
      server,
    };

    registerMonitorTools(server, ctx);

    const start = server.tools.get('pio_serial_start');
    expect(start).toBeDefined();

    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    const result = await start.handler({ port: 'COM3', baud: 115200 });

    expect(result.isError).toBe(true);
    const body = parseResult(result);
    expect(body.error.code).toBe(ERROR_CODES.PLATFORM_UNSUPPORTED);
    expect(body.error.message).toContain('POSIX-only');
    expect(body.error.message).toContain('WSL');
    expect(body.error.data).toMatchObject({ platform: 'win32', port: 'COM3' });

    taskManager.destroy();
  });
});
