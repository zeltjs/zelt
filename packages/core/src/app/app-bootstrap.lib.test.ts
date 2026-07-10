import { Container } from '@needle-di/core';
import { describe, expect, it, vi } from 'vitest';
import type { Lifecycle } from '../kernel';
import { LifecycleManager, ZeltLifecycleStateError, ZeltReadyFailedError } from '../kernel';
import { AppBootstrap } from './app-bootstrap.lib';

describe('AppBootstrap', () => {
  it('should call lifecycle startup on ready', async () => {
    const container = new Container();
    const runtime = container.get(AppBootstrap);

    const result = await runtime.ready();

    expect(result).toBeDefined();
    expect(result.get).toBeTypeOf('function');
  });

  it('should return cached result on second ready call', async () => {
    const container = new Container();
    const runtime = container.get(AppBootstrap);

    const result1 = await runtime.ready();
    const result2 = await runtime.ready();

    expect(result1).toBe(result2);
  });

  it('should throw on ready after disposed', async () => {
    const container = new Container();
    const runtime = container.get(AppBootstrap);

    await runtime.shutdown();

    await expect(runtime.ready()).rejects.toThrow(ZeltLifecycleStateError);
  });

  it('should be idempotent on shutdown', async () => {
    const container = new Container();
    const runtime = container.get(AppBootstrap);

    await runtime.ready();
    await runtime.shutdown();
    await runtime.shutdown();
  });

  it('should call lifecycle shutdown', async () => {
    const container = new Container();
    const lifecycle = container.get(LifecycleManager);
    const shutdownSpy = vi.spyOn(lifecycle, 'shutdown');
    const runtime = container.get(AppBootstrap);

    await runtime.ready();
    await runtime.shutdown();

    expect(shutdownSpy).toHaveBeenCalled();
  });

  it('should preserve startup failure and roll back started lifecycles', async () => {
    const container = new Container();
    const lifecycle = container.get(LifecycleManager);
    const runtime = container.get(AppBootstrap);
    const events: string[] = [];
    const startupCause = new Error('startup failed');

    lifecycle.register({
      startup: async () => {
        events.push('first:start');
      },
      shutdown: async () => {
        events.push('first:stop');
      },
    });
    lifecycle.register({
      startup: async () => {
        events.push('second:start');
        throw startupCause;
      },
      shutdown: async () => {
        events.push('second:stop');
      },
    });

    const failure = await runtime.ready().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ZeltReadyFailedError);
    expect(failure).toMatchObject({ cause: startupCause });
    expect(events).toEqual(['first:start', 'second:start', 'first:stop']);
    await expect(runtime.ready()).rejects.toBe(failure);

    await runtime.shutdown();
    expect(events).toEqual(['first:start', 'second:start', 'first:stop']);
  });

  it('should enter disposed state after lifecycle failures registered after ready', async () => {
    const container = new Container();
    const lifecycle = container.get(LifecycleManager);
    const runtime = container.get(AppBootstrap);
    const ready = await runtime.ready();
    const startupCause = new Error('late startup failed');
    const failingLifecycle: Lifecycle = {
      startup: async () => {
        throw startupCause;
      },
      shutdown: async () => {},
    };
    lifecycle.register(failingLifecycle);

    const failure = await ready.get(AppBootstrap).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ZeltReadyFailedError);
    expect(failure).toMatchObject({ cause: startupCause });
    await expect(ready.get(AppBootstrap)).rejects.toBeInstanceOf(ZeltLifecycleStateError);
    await runtime.shutdown();
  });
});
