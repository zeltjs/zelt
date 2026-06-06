import { Container } from '@needle-di/core';
import { describe, expect, it, vi } from 'vitest';
import { LifecycleManager, ZeltLifecycleStateError } from '../kernel';
import { AppRuntime } from './app-runtime.lib';

describe('AppRuntime', () => {
  it('should call lifecycle startup on ready', async () => {
    const container = new Container();
    const runtime = container.get(AppRuntime);

    const result = await runtime.ready();

    expect(result).toBeDefined();
    expect(result.get).toBeTypeOf('function');
  });

  it('should return cached result on second ready call', async () => {
    const container = new Container();
    const runtime = container.get(AppRuntime);

    const result1 = await runtime.ready();
    const result2 = await runtime.ready();

    expect(result1).toBe(result2);
  });

  it('should throw on ready after disposed', async () => {
    const container = new Container();
    const runtime = container.get(AppRuntime);

    await runtime.shutdown();

    await expect(runtime.ready()).rejects.toThrow(ZeltLifecycleStateError);
  });

  it('should be idempotent on shutdown', async () => {
    const container = new Container();
    const runtime = container.get(AppRuntime);

    await runtime.ready();
    await runtime.shutdown();
    await runtime.shutdown();
  });

  it('should call lifecycle shutdown', async () => {
    const container = new Container();
    const lifecycle = container.get(LifecycleManager);
    const shutdownSpy = vi.spyOn(lifecycle, 'shutdown');
    const runtime = container.get(AppRuntime);

    await runtime.ready();
    await runtime.shutdown();

    expect(shutdownSpy).toHaveBeenCalled();
  });
});
