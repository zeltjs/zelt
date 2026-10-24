import { inspect } from 'node:util';
import { createApp, LifecycleManager, RuntimeShutdownService, TaskService } from '@zeltjs/core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { onBun } from './on-bun';

beforeAll(() => {
  vi.stubGlobal('Bun', {
    argv: ['bun', 'entry'],
    env: {},
    inspect: (value: unknown, options?: { depth?: number }) => inspect(value, options),
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => vi.restoreAllMocks());

describe('onBun shutdown', () => {
  it('leaves host signal handlers unchanged when signals are disabled and still supports manual cleanup', async () => {
    const sigint = process.listeners('SIGINT');
    const sigterm = process.listeners('SIGTERM');
    const app = await onBun(createApp([]), { signals: false });
    const events: string[] = [];
    app.registerShutdown(() => {
      events.push('cleanup');
    });
    try {
      expect(process.listeners('SIGINT')).toEqual(sigint);
      expect(process.listeners('SIGTERM')).toEqual(sigterm);
      await app.shutdown();
      expect(events).toEqual(['cleanup']);
    } finally {
      await app.shutdown();
    }
    expect(process.listeners('SIGINT')).toEqual(sigint);
    expect(process.listeners('SIGTERM')).toEqual(sigterm);
  });

  it('preserves the common shutdown operation and waits for concurrent callers', async () => {
    const app = await onBun(createApp([]));
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
    const app = await onBun(createApp([]));
    const cleanup = vi.fn(() => {
      throw new Error('cleanup failed');
    });
    app.registerShutdown(cleanup);
    const results = await Promise.allSettled([app.shutdown(), app.shutdown()]);
    expect(results).toMatchObject([{ status: 'rejected' }, { status: 'rejected' }]);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it.each([
    'SIGINT',
    'SIGTERM',
  ] as const)('logs the cause when %s cleanup fails', async (signal) => {
    const existing = new Set(process.listeners(signal));
    const app = await onBun(createApp([]));
    const handler = process.listeners(signal).find((candidate) => !existing.has(candidate));
    if (!handler) throw new Error('adapter did not attach a signal handler');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const failure = new Error('resource cleanup failed');
    app.registerShutdown(() => {
      throw failure;
    });
    handler(signal);
    await expect(app.shutdown()).rejects.toBeInstanceOf(AggregateError);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Bun application shutdown failed'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining(failure.message));
    expect(process.listeners(signal)).not.toContain(handler);
  });

  it('keeps signal handlers after a refused shutdown and cleans up on retry', async () => {
    const existing = new Set(process.listeners('SIGINT'));
    const app = await onBun(createApp([]), { contextMode: 'sync' });
    const handlers = process.listeners('SIGINT');
    const handler = handlers.find((candidate) => !existing.has(candidate));
    if (!handler) throw new Error('adapter did not attach a signal handler');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const tasks = await app.get(TaskService);
    const gate = Promise.withResolvers<void>();
    const task = tasks.runAndWait(() => gate.promise);
    const cleanup = vi.fn();
    app.registerShutdown(cleanup);
    await Promise.resolve();
    try {
      handler('SIGINT');
      await expect(app.shutdown()).rejects.toThrow('Cannot wait for active tasks');
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Cannot wait for active tasks'));
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
    const app = await onBun(createApp([]));
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
