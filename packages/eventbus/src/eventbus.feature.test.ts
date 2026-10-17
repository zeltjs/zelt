import type { Lifecycle, ReservedAppKey } from '@zeltjs/core';
import { Config, createApp, Injectable, inject, LifecycleManager } from '@zeltjs/core';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { MemoryEventBusAdaptor } from './adaptor-memory';
import type { EventBusFeature, EventBusOptions } from './eventbus.feature';
import { eventbus } from './eventbus.feature';
import type { EventBusAdaptor, EventBusSchema } from './eventbus.types';

const assertReservedNames = (name: ReservedAppKey): void => {
  // @ts-expect-error event buses share the global reserved names
  eventbus({ name, adaptor: MemoryEventBusAdaptor });
  // @ts-expect-error a reserved literal must not widen during inference
  eventbus({ name: 'args', adaptor: MemoryEventBusAdaptor });
  const options = { name: 'args' as const, adaptor: MemoryEventBusAdaptor };
  // @ts-expect-error named options must not match the unnamed event bus overload
  eventbus(options);
  const optionalOptions: {
    readonly name?: ReservedAppKey;
    readonly adaptor: typeof MemoryEventBusAdaptor;
  } = { name, adaptor: MemoryEventBusAdaptor };
  // @ts-expect-error optional names must still exclude all reserved names
  eventbus(optionalOptions);
};
void assertReservedNames;

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

  async on<K extends string & keyof EventBusSchema>(
    _event: K,
    _handler: (data: EventBusSchema[K]) => void,
  ): Promise<() => void> {
    return () => {};
  }

  async once<K extends string & keyof EventBusSchema>(
    _event: K,
    _handler: (data: EventBusSchema[K]) => void,
  ): Promise<() => void> {
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
  it('accepts the public options type without a name', () => {
    const options: EventBusOptions = { adaptor: MemoryEventBusAdaptor };
    const feature = eventbus(options);

    expectTypeOf(feature).toEqualTypeOf<EventBusFeature<'eventbus'>>();
    expect(feature.key).toBe('eventbus');
    expect(feature.featureClasses()).toEqual([MemoryEventBusAdaptor]);
  });

  it('includes the default namespace when the options name is optional', () => {
    const namedOptions: EventBusOptions<'public'> = {
      name: 'public',
      adaptor: MemoryEventBusAdaptor,
    };
    const unnamedOptions: EventBusOptions<'public'> = { adaptor: MemoryEventBusAdaptor };
    const named = eventbus(namedOptions);
    const unnamed = eventbus(unnamedOptions);

    expectTypeOf(named).toEqualTypeOf<EventBusFeature<'public' | 'eventbus'>>();
    expectTypeOf(unnamed).toEqualTypeOf<EventBusFeature<'public' | 'eventbus'>>();
    expect(named.key).toBe('public');
    expect(unnamed.key).toBe('eventbus');
    expectTypeOf(eventbus({ adaptor: MemoryEventBusAdaptor }).key).toEqualTypeOf<'eventbus'>();
    expectTypeOf(
      eventbus({ name: 'public', adaptor: MemoryEventBusAdaptor }).key,
    ).toEqualTypeOf<'public'>();
  });

  it('returns a ConfiguredFeature with key "eventbus"', () => {
    const feature = eventbus({ adaptor: MemoryEventBusAdaptor });
    expect(feature.key).toBe('eventbus');
    expect(feature.featureClasses()).toEqual([MemoryEventBusAdaptor]);
    expect(typeof feature.realize).toBe('function');
  });

  it('returns adaptor and handlers as feature classes', () => {
    const feature = eventbus({
      adaptor: MemoryEventBusAdaptor,
      handlers: [ConfigAwareEventBusHandler],
    });

    expect(feature.featureClasses()).toEqual([MemoryEventBusAdaptor, ConfigAwareEventBusHandler]);
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
