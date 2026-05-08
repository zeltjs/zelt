import { describe, expect, it } from 'vitest';

import { LifecycleManager, type Lifecycle } from './lifecycle';

describe('LifecycleManager', () => {
  it('calls startup in registration order', async () => {
    const manager = new LifecycleManager();
    const events: string[] = [];

    const first: Lifecycle = {
      startup: async () => {
        events.push('first:start');
      },
      shutdown: async () => {
        events.push('first:stop');
      },
    };
    const second: Lifecycle = {
      startup: async () => {
        events.push('second:start');
      },
      shutdown: async () => {
        events.push('second:stop');
      },
    };

    manager.register(first);
    manager.register(second);

    await manager.startup();

    expect(events).toEqual(['first:start', 'second:start']);
  });

  it('calls shutdown in reverse registration order', async () => {
    const manager = new LifecycleManager();
    const events: string[] = [];

    const first: Lifecycle = {
      startup: async () => {},
      shutdown: async () => {
        events.push('first:stop');
      },
    };
    const second: Lifecycle = {
      startup: async () => {},
      shutdown: async () => {
        events.push('second:stop');
      },
    };

    manager.register(first);
    manager.register(second);

    await manager.shutdown();

    expect(events).toEqual(['second:stop', 'first:stop']);
  });

  it('executes startup sequentially (waits for each to complete)', async () => {
    const manager = new LifecycleManager();
    let concurrent = 0;
    let maxConcurrent = 0;

    const createLifecycle = (): Lifecycle => ({
      startup: async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
      },
      shutdown: async () => {},
    });

    manager.register(createLifecycle());
    manager.register(createLifecycle());

    await manager.startup();

    expect(maxConcurrent).toBe(1);
  });

  it('executes shutdown sequentially', async () => {
    const manager = new LifecycleManager();
    let concurrent = 0;
    let maxConcurrent = 0;

    const createLifecycle = (): Lifecycle => ({
      startup: async () => {},
      shutdown: async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
      },
    });

    manager.register(createLifecycle());
    manager.register(createLifecycle());

    await manager.shutdown();

    expect(maxConcurrent).toBe(1);
  });

  it('startupPending only starts newly registered lifecycles', async () => {
    const manager = new LifecycleManager();
    const events: string[] = [];

    const first: Lifecycle = {
      startup: async () => {
        events.push('first:start');
      },
      shutdown: async () => {},
    };
    const second: Lifecycle = {
      startup: async () => {
        events.push('second:start');
      },
      shutdown: async () => {},
    };
    const third: Lifecycle = {
      startup: async () => {
        events.push('third:start');
      },
      shutdown: async () => {},
    };

    manager.register(first);
    manager.register(second);
    await manager.startupPending();

    expect(events).toEqual(['first:start', 'second:start']);

    manager.register(third);
    await manager.startupPending();

    expect(events).toEqual(['first:start', 'second:start', 'third:start']);
  });

  it('startupPending is idempotent when no new lifecycles registered', async () => {
    const manager = new LifecycleManager();
    let callCount = 0;

    const lifecycle: Lifecycle = {
      startup: async () => {
        callCount++;
      },
      shutdown: async () => {},
    };

    manager.register(lifecycle);
    await manager.startupPending();
    await manager.startupPending();
    await manager.startupPending();

    expect(callCount).toBe(1);
  });
});
