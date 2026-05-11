import { describe, expect, it } from 'vitest';
import { Config } from '@zeltjs/core';

import { configureTestDefaults, getTestDefaults } from './global-config';

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
