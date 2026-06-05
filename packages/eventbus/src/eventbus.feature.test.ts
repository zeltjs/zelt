import { Container } from '@needle-di/core';
import type { Lifecycle } from '@zeltjs/core';
import { Config, createApp, Injectable, inject, LifecycleManager } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';

import { MemoryEventBusAdaptor } from './adaptor-memory';
import { eventbus } from './eventbus.feature';
import type { EventBusAdaptor, EventBusSchema } from './eventbus.types';

const createRuntime = (container: Container) => ({
  get: async <T extends object>(cls: new (...args: never[]) => T): Promise<T> => container.get(cls),
});

@Config
class BaseEventBusConfig {
  get value() {
    return 'base';
  }
}

@Config
class OverrideEventBusConfig extends BaseEventBusConfig {
  override get value() {
    return 'override';
  }
}

@Injectable()
class ConfigAwareEventBusAdaptor implements EventBusAdaptor, Lifecycle {
  static constructedValue: string | undefined;
  static startedValue: string | undefined;

  constructor(
    private readonly config = inject(BaseEventBusConfig),
    lifecycle = inject(LifecycleManager),
  ) {
    ConfigAwareEventBusAdaptor.constructedValue = config.value;
    lifecycle.register(this);
  }

  startup(): void {
    ConfigAwareEventBusAdaptor.startedValue = this.config.value;
  }

  shutdown(): void {}

  async emit<K extends string & keyof EventBusSchema>(
    _event: K,
    _data: EventBusSchema[K],
  ): Promise<void> {}

  on<K extends string & keyof EventBusSchema>(
    _event: K,
    _handler: (data: EventBusSchema[K]) => void,
  ): () => void {
    return () => {};
  }

  once<K extends string & keyof EventBusSchema>(
    _event: K,
    _handler: (data: EventBusSchema[K]) => void,
  ): () => void {
    return () => {};
  }
}

@Injectable()
class ConfigAwareEventBusHandler {
  static constructedValue: string | undefined;

  constructor(config = inject(BaseEventBusConfig)) {
    ConfigAwareEventBusHandler.constructedValue = config.value;
  }
}

describe('eventbus feature', () => {
  it('returns a ConfiguredFeature with key "eventbus"', () => {
    const feature = eventbus({ adaptor: MemoryEventBusAdaptor });
    expect(feature.key).toBe('eventbus');
    expect(typeof feature.bind).toBe('function');
    expect(typeof feature.createCapabilities).toBe('function');
  });

  it('createCapabilities returns EventBus capabilities', async () => {
    const feature = eventbus({ adaptor: MemoryEventBusAdaptor });
    const container = new Container();
    feature.bind(container);
    const caps = await feature.createCapabilities(createRuntime(container));
    expect(typeof caps.emit).toBe('function');
    expect(typeof caps.on).toBe('function');
    expect(typeof caps.once).toBe('function');
  });

  it('resolves adaptor and handlers after config binding and starts pending lifecycle', async () => {
    ConfigAwareEventBusAdaptor.constructedValue = undefined;
    ConfigAwareEventBusAdaptor.startedValue = undefined;
    ConfigAwareEventBusHandler.constructedValue = undefined;

    const app = createApp(
      [
        eventbus({
          adaptor: ConfigAwareEventBusAdaptor,
          handlers: [ConfigAwareEventBusHandler],
        }),
      ],
      { configs: [OverrideEventBusConfig] },
    );

    const readyApp = await app.createRuntime();

    expect(ConfigAwareEventBusAdaptor.constructedValue).toBe('override');
    expect(ConfigAwareEventBusAdaptor.startedValue).toBe('override');
    expect(ConfigAwareEventBusHandler.constructedValue).toBe('override');

    await readyApp.shutdown();
  });
});
