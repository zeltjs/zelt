import { describe, expect, it } from 'vitest';
import { Config } from '@zeltjs/core';

import { configureTestDefaults, getTestDefaults } from './global-config';

describe('configureTestDefaults', () => {
  it('maps config token to replacement class', () => {
    @Config
    class BaseConfig {
      static readonly Token = BaseConfig;
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
    expect(defaults.tokenMap.get(BaseConfig)).toBe(TestConfig);
  });
});
