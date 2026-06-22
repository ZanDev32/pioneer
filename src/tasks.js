/**
 * Task lifecycle manager for pioarduino MCP server.
 *
 * Provides an in-memory Map<taskId, TaskState> for tracking long-running
 * background operations (build, upload, test, serial monitor).
 *
 * Also registers the `pio_task_status` MCP tool for polling.
 */

import { z } from 'zod';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// TaskManager
// ---------------------------------------------------------------------------

export class TaskManager {
  constructor() {
    /** @type {Map<string, object>} */
    this.tasks = new Map();
  }

  /**
   * Register a new background task.
   *
   * @param {object} opts
   * @param {string} opts.type - 'build' | 'upload' | 'test' | 'check' | 'monitor'
   * @param {string} [opts.message] - Initial status message
   * @param {import('child_process').ChildProcess} [opts.child] - Detached child process
   * @param {object} [opts.meta] - Arbitrary metadata (e.g., logPath, port)
   * @returns {string} taskId (UUID v4)
   */
  createTask({ type, message, child, meta }) {
    const taskId = crypto.randomUUID();
    this.tasks.set(taskId, {
      id: taskId,
      type,
      status: 'running',
      message: message || `Starting ${type}...`,
      startTime: Date.now(),
      startTimeISO: new Date().toISOString(),
      exitCode: null,
      result: null,
      child: child || null,
      meta: meta || {},
    });
    return taskId;
  }

  /**
   * Retrieve a task's current state (safe copy, omits internal `child` ref).
   *
   * @param {string} taskId
   * @returns {object|null}
   */
  getTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    return {
      id: task.id,
      type: task.type,
      status: task.status,
      message: task.message,
      exit_code: task.exitCode,
      start_time: task.startTimeISO,
      elapsed_seconds: Math.floor((Date.now() - task.startTime) / 1000),
      result: task.result,
      meta: task.meta,
    };
  }

  /**
   * Retrieve the raw internal task object (includes child process ref).
   * Used by serial monitor stop/read to access logPath and child.
   *
   * @param {string} taskId
   * @returns {object|null}
   */
  getRaw(taskId) {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Update a task's state fields.
   *
   * @param {string} taskId
   * @param {object} updates — partial TaskState fields
   */
  updateTask(taskId, updates) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    Object.assign(task, updates);
  }

  /**
   * Cancel a running task by sending SIGTERM then SIGKILL.
   *
   * @param {string} taskId
   * @returns {boolean} true if task was killed
   */
  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task || !task.child) return false;

    try {
      task.child.kill('SIGTERM');
      // Follow up with SIGKILL after 2s if still alive
      setTimeout(() => {
        try { task.child.kill('SIGKILL'); } catch {}
      }, 2000);
    } catch {
      // process already exited
    }

    this.updateTask(taskId, {
      status: 'cancelled',
      message: 'Cancelled by user',
    });
    return true;
  }

  /**
   * List all active (running) tasks.
   * @returns {Array<object>}
   */
  listActive() {
    const result = [];
    for (const [id, task] of this.tasks) {
      if (task.status === 'running') {
        result.push(this.getTask(id));
      }
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// pio_task_status tool registration
// ---------------------------------------------------------------------------

/**
 * Register the `pio_task_status` and `pio_task_list` tools on the MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {{ workspaceRoot: string, taskManager: TaskManager }} ctx
 */
export function registerTaskTools(server, ctx) {
  server.tool(
    'pio_task_status',
    'Check the status of a background task started with async: true. Returns task progress, exit code, and result when complete.',
    {
      task_id: z
        .string()
        .describe('Task ID returned from an async operation (build, upload, monitor start, etc.)'),
    },
    async ({ task_id }) => {
      const state = ctx.taskManager.getTask(task_id);
      if (!state) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Task not found', task_id }),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(state, null, 2) }],
      };
    },
  );

  server.tool(
    'pio_task_list',
    'List all currently running background tasks (builds, uploads, serial monitors).',
    {},
    async () => {
      const active = ctx.taskManager.listActive();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ running_tasks: active, count: active.length }, null, 2),
          },
        ],
      };
    },
  );
}
