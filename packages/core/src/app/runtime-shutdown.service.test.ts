import { describe, expect, it, vi } from 'vitest';
import { LifecycleManager, ZeltLifecycleStateError } from '../kernel';
import { createApp } from './create-app.lib';
import { RuntimeShutdownService } from './runtime-shutdown.service';

describe('runtime shutdown', () => {
  it('shares completion and exposes shutdown state from the moment shutdown is requested', async () => {
    const runtime = await createApp([]).createRuntime();
    const service = await runtime.get(RuntimeShutdownService);
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    runtime.registerShutdown(async () => {
      started.resolve();
      await gate.promise;
    });
    expect(service.state).toBe('ready');
    expect(runtime.shutdown).toBe(service.shutdown);
    const first = runtime.shutdown();
    try {
      expect(service.state).toBe('shuttingDown');
      expect(runtime.shutdown()).toBe(first);
      expect(() => runtime.registerShutdown(() => {})).toThrow(ZeltLifecycleStateError);
      await started.promise;
    } finally {
      gate.resolve();
      await first;
    }
    expect(service.state).toBe('disposed');
    expect(runtime.shutdown()).toBe(first);
  });

  it('runs after callbacks after lifecycle cleanup and waits for them before resolving', async () => {
    const runtime = await createApp([]).createRuntime();
    const lifecycle = await runtime.get(LifecycleManager);
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const events: string[] = [];
    lifecycle.register({
      startup: () => {},
      shutdown: () => {
        events.push('lifecycle');
      },
    });
    await lifecycle.startupPending();
    runtime.registerShutdown(() => {
      events.push('before');
    });
    runtime.registerShutdown(
      async () => {
        events.push('after');
        started.resolve();
        await gate.promise;
        events.push('finished');
      },
      { phase: 'after' },
    );
    let finished = false;
    const stopping = runtime.shutdown().then(() => {
      finished = true;
    });
    try {
      await started.promise;
      expect(events).toEqual(['before', 'lifecycle', 'after']);
      expect(finished).toBe(false);
    } finally {
      gate.resolve();
      await stopping;
    }
    await runtime.shutdown();
    expect(events).toEqual(['before', 'lifecycle', 'after', 'finished']);
  });

  it('shares failures and still runs every phase when resource cleanup fails', async () => {
    const runtime = await createApp([]).createRuntime();
    const lifecycle = await runtime.get(LifecycleManager);
    const before = vi.fn(() => {
      throw new Error('before failed');
    });
    const stop = vi.fn(() => {
      throw new Error('lifecycle failed');
    });
    const after = vi.fn(() => {
      throw new Error('after failed');
    });
    lifecycle.register({ startup: () => {}, shutdown: stop });
    await lifecycle.startupPending();
    runtime.registerShutdown(before);
    runtime.registerShutdown(after, { phase: 'after' });
    const first = runtime.shutdown();
    expect(runtime.shutdown()).toBe(first);
    await expect(first).rejects.toMatchObject({
      errors: [expect.any(Error), expect.any(Error), expect.any(Error)],
    });
    expect(before).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledOnce();
    expect(runtime.shutdown()).toBe(first);
    expect(() => runtime.registerShutdown(() => {}, { phase: 'after' })).toThrow(
      ZeltLifecycleStateError,
    );
  });

  it('preserves after callbacks when shutdown is refused before or during cleanup', async () => {
    const runtime = await createApp([]).createRuntime();
    const service = await runtime.get(RuntimeShutdownService);
    const lifecycle = await runtime.get(LifecycleManager);
    const cause = new Error('shutdown refused');
    let blocked = true;
    lifecycle.register({
      startup: () => {},
      assertCanShutdown: () => {
        if (blocked) throw cause;
      },
      shutdown: () => {},
    });
    await lifecycle.startupPending();
    const before = vi.fn(() => {
      blocked = true;
    });
    const after = vi.fn();
    runtime.registerShutdown(before);
    runtime.registerShutdown(after, { phase: 'after' });
    await expect(runtime.shutdown()).rejects.toBe(cause);
    expect(service.state).toBe('ready');
    expect(before).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    blocked = false;
    await expect(runtime.shutdown()).rejects.toMatchObject({ errors: [cause] });
    expect(service.state).toBe('ready');
    expect(before).toHaveBeenCalledOnce();
    expect(after).not.toHaveBeenCalled();
    blocked = false;
    await runtime.shutdown();
    expect(service.state).toBe('disposed');
    expect(before).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledOnce();
  });
});
