import { Config } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';

import { configureTestDefaults, getTestDefaults } from './global-config.lib';

describe('configureTestDefaults', () => {
  it('stores config classes for fallback', () => {
    @Config
    class BaseConfig {
      get value() {
        return 'base';
      }
    }

    @Config
    class TestConfig extends BaseConfig {
      override get value() {
        return 'test';
      }
    }

    configureTestDefaults({ configs: [TestConfig] });

    const defaults = getTestDefaults();
    expect(defaults.configs).toContain(TestConfig);
  });
});
