import { createApp, LifecycleManager, RuntimeShutdownService, TaskService } from '@zeltjs/core';
import { describe, expect, it, vi } from 'vitest';
import { onNode } from './on-node';

describe('onNode shutdown', () => {
  it('preserves the common shutdown operation and waits for concurrent callers', async () => {
    const app = await onNode(createApp([]));
    const service = await app.get(RuntimeShutdownService);
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    app.registerShutdown(async () => {
      started.resolve();
      await gate.promise;
    });
    const first = app.shutdown();
    try {
      expect(app.shutdown).toBe(service.shutdown);
      expect(app.shutdown()).toBe(first);
      await started.promise;
    } finally {
      gate.resolve();
      await first;
    }
  });

  it('reports failed cleanup to every concurrent caller', async () => {
    const app = await onNode(createApp([]));
    const cleanup = vi.fn(() => {
      throw new Error('cleanup failed');
    });
    app.registerShutdown(cleanup);
    const results = await Promise.allSettled([app.shutdown(), app.shutdown()]);
    expect(results).toMatchObject([{ status: 'rejected' }, { status: 'rejected' }]);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('keeps signal handlers after a refused shutdown and cleans up on retry', async () => {
    const app = await onNode(createApp([]), { contextMode: 'sync' });
    const handlers = process.listeners('SIGINT');
    const tasks = await app.get(TaskService);
    const gate = Promise.withResolvers<void>();
    const task = tasks.runAndWait(() => gate.promise);
    const cleanup = vi.fn();
    app.registerShutdown(cleanup);
    await Promise.resolve();
    try {
      await expect(app.shutdown()).rejects.toThrow('Cannot wait for active tasks');
      expect(process.listeners('SIGINT')).toEqual(handlers);
      expect(cleanup).not.toHaveBeenCalled();
    } finally {
      gate.resolve();
      await task;
      await app.shutdown();
    }
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it.each([
    'SIGINT',
    'SIGTERM',
  ] as const)('shares %s with manual shutdown and detaches signals after resource cleanup', async (signal) => {
    const existing = new Set(process.listeners(signal));
    const app = await onNode(createApp([]));
    const handler = process.listeners(signal).find((candidate) => !existing.has(candidate));
    if (!handler) throw new Error('adapter did not attach a signal handler');
    const lifecycle = await app.get(LifecycleManager);
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const cleanup = vi.fn(async () => {
      started.resolve();
      await gate.promise;
    });
    lifecycle.register({ startup: () => {}, shutdown: cleanup });
    await lifecycle.startupPending();
    handler(signal);
    handler(signal);
    const stopping = app.shutdown();
    try {
      await started.promise;
      expect(process.listeners(signal)).toContain(handler);
    } finally {
      gate.resolve();
      await stopping;
    }
    expect(cleanup).toHaveBeenCalledOnce();
    expect(process.listeners(signal)).not.toContain(handler);
  });
});
