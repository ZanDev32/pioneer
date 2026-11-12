import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskManager } from '../../src/tasks.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MINUTE = 60 * 1000;

let tm;

beforeEach(() => {
  vi.useFakeTimers();
  tm = new TaskManager();
});

afterEach(() => {
  tm.destroy();
  vi.useRealTimers();
});

describe('createTask / getTask', () => {
  it('returns a UUID and stores a running task with the given type and message', () => {
    const id = tm.createTask({ type: 'build', message: 'Building esp32dev' });

    expect(id).toMatch(UUID_V4);
    expect(tm.getRaw(id)).toMatchObject({
      id,
      type: 'build',
      status: 'running',
      message: 'Building esp32dev',
      exitCode: null,
      result: null,
    });
    expect(tm.getTask(id)).toMatchObject({
      id,
      type: 'build',
      status: 'running',
      message: 'Building esp32dev',
    });
  });

  it('defaults the message and starts the task at the current time', () => {
    const id = tm.createTask({ type: 'upload' });

    expect(tm.getTask(id).message).toBe('Starting upload...');
    expect(tm.getTask(id).elapsed_seconds).toBe(0);

    vi.advanceTimersByTime(5000);

    expect(tm.getTask(id).elapsed_seconds).toBe(5);
  });

  it('returns a safe copy without the child process and null for an unknown id', () => {
    const child = { kill: vi.fn(), killed: false };
    const id = tm.createTask({ type: 'monitor', child, meta: { port: '/dev/ttyUSB0' } });

    expect(tm.getTask(id).child).toBeUndefined();
    expect(tm.getRaw(id).child).toBe(child);
    expect(tm.getTask(id).meta).toEqual({ port: '/dev/ttyUSB0' });
    expect(tm.getTask('missing-task')).toBeNull();
    expect(tm.getRaw('missing-task')).toBeNull();
  });
});

describe('updateTask', () => {
  it('transitions status and records output, exit code, and result', () => {
    const id = tm.createTask({ type: 'build' });

    tm.updateTask(id, {
      status: 'completed',
      exitCode: 0,
      result: { diagnostics: [] },
      message: 'Build succeeded',
    });

    expect(tm.getTask(id)).toMatchObject({
      status: 'completed',
      exit_code: 0,
      result: { diagnostics: [] },
      message: 'Build succeeded',
    });
  });

  it('ignores an unknown id', () => {
    expect(() => tm.updateTask('missing-task', { status: 'failed' })).not.toThrow();
    expect(tm.getRaw('missing-task')).toBeNull();
  });
});

describe('cancelTask', () => {
  it('marks a task with a child process cancelled and escalates SIGTERM to SIGKILL', () => {
    const child = { kill: vi.fn(), killed: false };
    const id = tm.createTask({ type: 'build', child });

    expect(tm.cancelTask(id)).toBe(true);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(tm.getTask(id)).toMatchObject({
      status: 'cancelled',
      message: 'Cancelled by user',
    });

    vi.advanceTimersByTime(2000);

    expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');
  });

  it('returns false and leaves the task running when no child is attached', () => {
    const id = tm.createTask({ type: 'build' });

    expect(tm.cancelTask(id)).toBe(false);
    expect(tm.getTask(id).status).toBe('running');
    expect(tm.cancelTask('missing-task')).toBe(false);
  });
});

describe('listActive', () => {
  it('returns only non-terminal tasks', () => {
    const running = tm.createTask({ type: 'build' });
    const done = tm.createTask({ type: 'upload' });
    const cancelled = tm.createTask({ type: 'monitor', child: { kill: vi.fn(), killed: false } });

    tm.updateTask(done, { status: 'completed' });
    tm.cancelTask(cancelled);

    expect(tm.listActive().map((task) => task.id)).toEqual([running]);
  });
});

describe('TTL cleanup', () => {
  it('evicts terminal tasks older than 30 minutes and keeps fresh or running ones', () => {
    const stale = tm.createTask({ type: 'build' });
    const running = tm.createTask({ type: 'monitor' });
    tm.updateTask(stale, { status: 'completed' });

    vi.advanceTimersByTime(5 * MINUTE); // one cleanup tick — 5 min old, under the TTL
    expect(tm.getRaw(stale)).not.toBeNull();

    const fresh = tm.createTask({ type: 'upload' });
    tm.updateTask(fresh, { status: 'failed' });

    vi.advanceTimersByTime(30 * MINUTE); // 35 min old — older than the TTL
    expect(tm.getRaw(stale)).toBeNull();
    expect(tm.getRaw(fresh)).not.toBeNull();
    expect(tm.getRaw(running)).not.toBeNull();

    vi.advanceTimersByTime(5 * MINUTE); // fresh task is now 35 min old too
    expect(tm.getRaw(fresh)).toBeNull();
    expect(tm.getRaw(running)).not.toBeNull();
  });

  it('returns the number of evicted tasks when called directly', () => {
    const a = tm.createTask({ type: 'build' });
    const b = tm.createTask({ type: 'test' });
    tm.updateTask(a, { status: 'completed' });
    tm.updateTask(b, { status: 'stopped' });

    vi.advanceTimersByTime(31 * MINUTE);
    const extra = tm.createTask({ type: 'upload' });
    tm.updateTask(extra, { status: 'completed' });

    expect(tm.cleanup()).toBe(2); // both original terminal tasks are now past the TTL
    expect(tm.getRaw(extra)).not.toBeNull();
  });

  it('stops the cleanup interval on destroy so no timer leaks', () => {
    tm.destroy();

    expect(tm._cleanupTimer).toBeNull();
    expect(() => vi.advanceTimersByTime(30 * MINUTE)).not.toThrow();
  });
});
