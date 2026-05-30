import { describe, expect, it } from 'vitest';

import { Config } from '../built-in-service/config';
import type { Lifecycle } from '../index';
import { Injectable, inject, LifecycleManager } from '../index';

import { createApp } from './create-app.lib';

describe('createApp for testing', () => {
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

    const app = createApp({ configs: [TestConfig] });
    const { get } = await app.ready();

    expect(events).toEqual(['config:constructor', 'config:startup']);
    expect((await get(TestService)).getValue()).toBe('test-value');

    await app.shutdown();
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

    const app = createApp({ configs: [IdempotentConfig] });
    await app.ready();

    await app.shutdown();
    await app.shutdown();
    await app.shutdown();

    expect(events).toEqual(['shutdown']);
  });

  it('throws error when get is called after shutdown', async () => {
    @Injectable()
    class SomeService {}

    const app = createApp({});
    const { get } = await app.ready();

    await app.shutdown();

    await expect(get(SomeService)).rejects.toThrow(/Cannot get\(\) after shutdown\(\)/);
  });
});
