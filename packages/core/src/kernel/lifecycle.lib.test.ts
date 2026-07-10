import { describe, expect, it } from 'vitest';

import { ZeltLifecycleStateError, ZeltReadyFailedError } from './errors';
import type { Lifecycle } from './lifecycle.lib';
import { LifecycleManager } from './lifecycle.lib';

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

    await manager.startup();
    await manager.shutdown();

    expect(events).toEqual(['second:stop', 'first:stop']);
  });

  it('continues shutdown in reverse order and aggregates failures', async () => {
    const manager = new LifecycleManager();
    const events: string[] = [];
    const shutdownError = new Error('second shutdown failed');

    manager.register({
      startup: async () => {},
      shutdown: async () => {
        events.push('first:stop');
      },
    });
    manager.register({
      startup: async () => {},
      shutdown: async () => {
        events.push('second:stop');
        throw shutdownError;
      },
    });

    await manager.startup();

    await expect(manager.shutdown()).rejects.toMatchObject({ errors: [shutdownError] });
    expect(events).toEqual(['second:stop', 'first:stop']);
  });

  it('does not run shutdown hooks again after shutdown completes', async () => {
    const manager = new LifecycleManager();
    let shutdownCalls = 0;
    manager.register({
      startup: async () => {},
      shutdown: async () => {
        shutdownCalls++;
      },
    });

    await manager.startup();
    await manager.shutdown();
    await manager.shutdown();

    expect(shutdownCalls).toBe(1);
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

    await manager.startup();
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

  it('wraps startup failures in ZeltReadyFailedError', async () => {
    const manager = new LifecycleManager();
    const cause = new Error('startup failed');
    const lifecycle: Lifecycle = {
      startup: async () => {
        throw cause;
      },
      shutdown: async () => {},
    };

    manager.register(lifecycle);

    await expect(manager.startup()).rejects.toMatchObject({
      name: 'ZeltReadyFailedError',
      cause,
    });
    await expect(manager.startup()).rejects.toBeInstanceOf(ZeltLifecycleStateError);
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

  describe('ReadyValue integration', () => {
    it('returns ReadyValue from register when lifecycle returns object', async () => {
      const manager = new LifecycleManager();

      const lifecycle: Lifecycle<{ client: string }> = {
        startup: async () => ({ client: 'test-client' }),
        shutdown: async () => {},
      };

      const ready = manager.register(lifecycle);

      expect(() => ready.client).toThrow(ZeltLifecycleStateError);

      await manager.startup();

      expect(ready.client).toBe('test-client');
    });

    it('disposes ReadyValue on shutdown', async () => {
      const manager = new LifecycleManager();

      const lifecycle: Lifecycle<{ client: string }> = {
        startup: async () => ({ client: 'test-client' }),
        shutdown: async () => {},
      };

      const ready = manager.register(lifecycle);
      await manager.startup();

      expect(ready.client).toBe('test-client');

      await manager.shutdown();

      expect(() => ready.client).toThrow(ZeltLifecycleStateError);
    });

    it('allows access to ReadyValue during shutdown', async () => {
      const manager = new LifecycleManager();
      let accessedDuringShutdown = false;

      const lifecycle: Lifecycle<{ client: string }> = {
        startup: async () => ({ client: 'test-client' }),
        shutdown: async () => {},
      };

      const ready = manager.register(lifecycle);

      const dependentLifecycle: Lifecycle = {
        startup: async () => {},
        shutdown: async () => {
          accessedDuringShutdown = ready.client === 'test-client';
        },
      };

      manager.register(dependentLifecycle);
      await manager.startup();
      await manager.shutdown();

      expect(accessedDuringShutdown).toBe(true);
    });

    it('maintains backward compatibility with void-returning lifecycles', async () => {
      const manager = new LifecycleManager();
      const events: string[] = [];

      const lifecycle: Lifecycle = {
        startup: async () => {
          events.push('started');
        },
        shutdown: async () => {
          events.push('stopped');
        },
      };

      manager.register(lifecycle);
      await manager.startup();
      await manager.shutdown();

      expect(events).toEqual(['started', 'stopped']);
    });

    it('rolls back only successfully started lifecycles when startup fails', async () => {
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
          throw new Error('startup failed');
        },
        shutdown: async () => {
          events.push('second:stop');
        },
      };

      const third: Lifecycle = {
        startup: async () => {
          events.push('third:start');
        },
        shutdown: async () => {
          events.push('third:stop');
        },
      };

      manager.register(first);
      manager.register(second);
      manager.register(third);

      await expect(manager.startup()).rejects.toBeInstanceOf(ZeltReadyFailedError);
      expect(events).toEqual(['first:start', 'second:start', 'first:stop']);
      await expect(manager.startup()).rejects.toBeInstanceOf(ZeltLifecycleStateError);

      await manager.shutdown();

      expect(events).toEqual(['first:start', 'second:start', 'first:stop']);
    });

    it('surfaces startup and rollback failures and disposes ReadyValues', async () => {
      const manager = new LifecycleManager();
      const startupCause = new Error('second startup failed');
      const rollbackError = new Error('first rollback failed');

      const ready = manager.register({
        startup: async () => ({ client: 'ready' }),
        shutdown: async () => {
          throw rollbackError;
        },
      });
      manager.register({
        startup: async () => {
          throw startupCause;
        },
        shutdown: async () => {},
      });

      const failure = await manager.startup().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(AggregateError);
      expect(failure).toMatchObject({
        errors: [
          {
            name: 'ZeltReadyFailedError',
            cause: startupCause,
          },
          rollbackError,
        ],
      });
      expect(() => ready.client).toThrow(ZeltLifecycleStateError);
    });
  });
});
