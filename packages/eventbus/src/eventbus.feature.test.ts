import { Container } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { MemoryEventBusAdaptor } from './adaptor-memory';
import { eventbus } from './eventbus.feature';

describe('eventbus feature', () => {
  it('returns a ConfiguredFeature with key "eventbus"', () => {
    const feature = eventbus({ adaptor: MemoryEventBusAdaptor });
    expect(feature.key).toBe('eventbus');
    expect(typeof feature.bind).toBe('function');
    expect(typeof feature.resolve).toBe('function');
  });

  it('resolve returns EventBus capabilities', () => {
    const feature = eventbus({ adaptor: MemoryEventBusAdaptor });
    const container = new Container();
    feature.bind(container);
    const caps = feature.resolve(container);
    expect(typeof caps.emit).toBe('function');
    expect(typeof caps.on).toBe('function');
    expect(typeof caps.once).toBe('function');
  });
});
