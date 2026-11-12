import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerTaskTools, TaskManager } from '../../src/tasks.js';

function makeServer() {
  const tools = new Map();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
    server: { sendLoggingMessage: () => {} },
  };
}

function parseBody(result) {
  return JSON.parse(result.content[0].text);
}

let taskManager;
let server;

beforeEach(() => {
  taskManager = new TaskManager();
  server = makeServer();
  registerTaskTools(server, {
    explicitRoot: process.cwd(),
    workspaceFixed: true,
    taskManager,
    server,
  });
});

afterEach(() => {
  taskManager.destroy();
});

describe('task tool registration', () => {
  it('registers pio_task_status and pio_task_list with their schemas', () => {
    expect(Object.keys(server.tools.get('pio_task_status').config.inputSchema)).toEqual([
      'task_id',
    ]);
    expect(Object.keys(server.tools.get('pio_task_list').config.inputSchema)).toEqual([]);
  });
});

describe('pio_task_status', () => {
  const status = (params) => server.tools.get('pio_task_status').handler(params);

  it('returns the serialized state for a known task id', async () => {
    const taskId = taskManager.createTask({
      type: 'build',
      message: 'Building esp32dev in background...',
      meta: { projectDir: '/tmp/project', environment: 'esp32dev' },
    });

    const result = await status({ task_id: taskId });

    expect(result.isError).toBeUndefined();
    expect(parseBody(result)).toMatchObject({
      id: taskId,
      type: 'build',
      status: 'running',
      message: 'Building esp32dev in background...',
      exit_code: null,
      result: null,
      meta: { projectDir: '/tmp/project', environment: 'esp32dev' },
    });
  });

  it('returns an error envelope for an unknown task id', async () => {
    const result = await status({ task_id: 'not-a-task' });

    expect(result.isError).toBe(true);
    expect(parseBody(result)).toEqual({ error: 'Task not found', task_id: 'not-a-task' });
  });
});

describe('pio_task_list', () => {
  const list = () => server.tools.get('pio_task_list').handler();

  it('returns an empty list on a fresh manager', async () => {
    expect(parseBody(await list())).toEqual({ running_tasks: [], count: 0 });
  });

  it('lists running tasks only', async () => {
    const running = taskManager.createTask({ type: 'upload', message: 'Uploading...' });
    const finished = taskManager.createTask({ type: 'build', message: 'Building...' });
    taskManager.updateTask(finished, { status: 'completed', exitCode: 0 });

    const body = parseBody(await list());

    expect(body.count).toBe(1);
    expect(body.running_tasks.map((t) => t.id)).toEqual([running]);
  });
});
