import { describe, expect, it } from 'vitest';

import { ZeltLifecycleStateError, ZeltReadyFailedError } from './errors';
import type { Lifecycle } from './lifecycle.lib';
import { LifecycleManager } from './lifecycle.lib';

describe('LifecycleManager', () => {
  it.each([
    false,
    true,
  ])('shares concurrent startup completion and rollback (fails: %s)', async (fail) => {
    const manager = new LifecycleManager();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const events: string[] = [];
    const cause = new Error('startup failed');
    manager.register({
      startup: () => {
        events.push('first:start');
      },
      shutdown: () => {
        events.push('first:stop');
      },
    });
    manager.register({
      startup: async () => {
        events.push('second:start');
        entered.resolve();
        await release.promise;
        await manager.startupPending();
        if (fail) throw cause;
        manager.register({
          startup: () => {
            events.push('late:start');
          },
          shutdown: () => {
            events.push('late:stop');
          },
        });
      },
      shutdown: () => {
        events.push('second:stop');
      },
    });
    const first = manager.startup();
    await entered.promise;
    let completed = false;
    const second = manager.startupPending().then(() => {
      completed = true;
    });
    const outcomes = Promise.allSettled([first, second]);
    try {
      await Promise.resolve();
      expect(completed).toBe(false);
      expect(events).toEqual(['first:start', 'second:start']);
    } finally {
      release.resolve();
    }
    const [one, two] = await outcomes;
    if (fail) {
      expect(one).toMatchObject({ status: 'rejected', reason: { cause } });
      expect(two).toEqual(one);
      expect(events).toEqual(['first:start', 'second:start', 'first:stop']);
    } else {
      expect(one.status).toBe('fulfilled');
      expect(two.status).toBe('fulfilled');
      expect(events).toEqual(['first:start', 'second:start', 'late:start']);
    }
    await manager.shutdown();
    if (!fail) expect(events.slice(-3)).toEqual(['late:stop', 'second:stop', 'first:stop']);
  });

  it('does not treat work inherited from a completed startup as reentry into a new batch', async () => {
    const manager = new LifecycleManager();
    const trigger = Promise.withResolvers<void>();
    let inherited: Promise<void> | undefined;
    let completed = false;
    manager.register({
      startup: () => {
        inherited = trigger.promise.then(async () => {
          await manager.startupPending();
          completed = true;
        });
      },
      shutdown: () => {},
    });
    await manager.startup();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    manager.register({
      startup: async () => {
        entered.resolve();
        await release.promise;
      },
      shutdown: () => {},
    });
    const pending = manager.startupPending();
    await entered.promise;
    trigger.resolve();
    try {
      await Promise.resolve();
      await Promise.resolve();
      expect(completed).toBe(false);
    } finally {
      release.resolve();
      await pending;
      await inherited;
      await manager.shutdown();
    }
    expect(completed).toBe(true);
  });

  it('returns a Promise when empty and rejects after disposal even with no pending hooks', async () => {
    const manager = new LifecycleManager();
    const pending = manager.startupPending();

    expect(pending).toBeInstanceOf(Promise);
    await pending;
    await manager.shutdown();

    await expect(manager.startupPending()).rejects.toBeInstanceOf(ZeltLifecycleStateError);
  });

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
