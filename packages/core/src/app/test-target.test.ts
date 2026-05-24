import { describe, expect, it } from 'vitest';

import { Config } from '../built-in-service/config';
import type { Lifecycle } from '../index';
import { Injectable, inject, LifecycleManager } from '../index';

import { createTestTargetBase } from './test-target';

describe('createTestTargetBase', () => {
  it('instantiates configs before calling startup', async () => {
    const events: string[] = [];

    @Config
    class TestConfig implements Lifecycle {
      constructor(lifecycle = inject(LifecycleManager)) {
        events.push('config:constructor');
        lifecycle.register(this);
      }

      async startup(): Promise<void> {
        events.push('config:startup');
      }

      async shutdown(): Promise<void> {
        events.push('config:shutdown');
      }

      get value(): string {
        return 'test-value';
      }
    }

    @Injectable()
    class TestService {
      constructor(private config = inject(TestConfig)) {}

      getValue(): string {
        return this.config.value;
      }
    }

    const { target, shutdown } = await createTestTargetBase(TestService, {
      configs: [TestConfig],
    });

    expect(events).toEqual(['config:constructor', 'config:startup']);
    expect(target.getValue()).toBe('test-value');

    await shutdown();
    expect(events).toEqual(['config:constructor', 'config:startup', 'config:shutdown']);
  });

  it('shutdown is idempotent', async () => {
    const events: string[] = [];

    @Config
    class IdempotentConfig implements Lifecycle {
      constructor(lifecycle = inject(LifecycleManager)) {
        lifecycle.register(this);
      }

      async startup(): Promise<void> {}

      async shutdown(): Promise<void> {
        events.push('shutdown');
      }
    }

    @Injectable()
    class SimpleService {}

    const { shutdown } = await createTestTargetBase(SimpleService, {
      configs: [IdempotentConfig],
    });

    await shutdown();
    await shutdown();
    await shutdown();

    expect(events).toEqual(['shutdown']); // Only called once
  });

  it('throws error when get is called after shutdown', async () => {
    @Injectable()
    class SomeService {}

    const { get, shutdown } = await createTestTargetBase(SomeService);

    await shutdown();

    expect(() => get(SomeService)).toThrow(/Cannot get\(\) after shutdown\(\)/);
  });
});
