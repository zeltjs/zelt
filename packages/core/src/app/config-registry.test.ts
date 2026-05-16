import { Container } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { ConfigRegistry } from './config-registry';

describe('ConfigRegistry', () => {
  it('should store and return fallback configs', () => {
    const container = new Container();
    const registry = container.get(ConfigRegistry);

    class TestConfig {}

    registry.addFallbackConfig(TestConfig);

    expect(registry.getDefaults()).toContain(TestConfig);
  });

  it('should store and return override configs', () => {
    const container = new Container();
    const registry = container.get(ConfigRegistry);

    class TestConfig {}

    registry.overrideConfig(TestConfig);

    expect(registry.getOverrides()).toContain(TestConfig);
  });

  it('should maintain order of configs', () => {
    const container = new Container();
    const registry = container.get(ConfigRegistry);

    class ConfigA {}
    class ConfigB {}

    registry.addFallbackConfig(ConfigA);
    registry.addFallbackConfig(ConfigB);

    const defaults = registry.getDefaults();
    expect(defaults[0]).toBe(ConfigA);
    expect(defaults[1]).toBe(ConfigB);
  });
});
