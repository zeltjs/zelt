import { describe, it, expect } from 'vitest';
import { injectable } from '@needle-di/core';

import { Config, injectConfig } from '../config';
import { Injectable, inject, LifecycleManager } from '../index';
import type { Lifecycle } from '../index';

import { createContainer, createTestTargetBase } from './container';

describe('createContainer with configs', () => {
  it('binds user config to parent Token', () => {
    @Config
    class BaseConfig {
      static readonly Token = BaseConfig;
      get value() {
        return 'base';
      }
    }

    @Config
    class UserConfig extends BaseConfig {
      override get value() {
        return 'user';
      }
    }

    @injectable()
    class TestService {
      constructor(private config = injectConfig(BaseConfig)) {}
      getValue() {
        return this.config.value;
      }
    }

    const resolver = createContainer({ configs: [UserConfig] });
    const service = resolver.get(TestService);
    expect(service.getValue()).toBe('user');
  });

  it('uses default config when no override provided', () => {
    @Config
    class DefaultConfig {
      static readonly Token = DefaultConfig;
      get value() {
        return 'default';
      }
    }

    @injectable()
    class TestService {
      constructor(private config = injectConfig(DefaultConfig)) {}
      getValue() {
        return this.config.value;
      }
    }

    const resolver = createContainer({ configs: [] });
    const service = resolver.get(TestService);
    expect(service.getValue()).toBe('default');
  });
});

describe('createTestTargetBase', () => {
  it('instantiates configs before calling startup', async () => {
    const events: string[] = [];

    @Config
    class TestConfig implements Lifecycle {
      static readonly Token = TestConfig;

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
      static readonly Token = IdempotentConfig;

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
});
