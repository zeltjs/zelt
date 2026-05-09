import { describe, expect, it } from 'vitest';

import { Config } from './decorator';
import { findConfigToken } from './token';

describe('Config decorator', () => {
  it('registers class in config registry', () => {
    @Config
    class TestConfig {
      value = 'test';
    }

    const token = findConfigToken(TestConfig);
    expect(token).toBe(TestConfig);
  });

  it('undecorated child class finds parent in registry', () => {
    @Config
    class ParentConfig {
      get level() {
        return 'info';
      }
    }

    class ChildConfig extends ParentConfig {
      override get level() {
        return 'debug';
      }
    }

    const parentToken = findConfigToken(ParentConfig);
    const childToken = findConfigToken(ChildConfig);

    expect(parentToken).toBe(ParentConfig);
    expect(childToken).toBe(ParentConfig);
  });

  it('decorated child class is registered independently', () => {
    @Config
    class ParentConfig {
      get level() {
        return 'info';
      }
    }

    @Config
    class ChildConfig extends ParentConfig {
      override get level() {
        return 'debug';
      }
    }

    const parentToken = findConfigToken(ParentConfig);
    const childToken = findConfigToken(ChildConfig);

    expect(parentToken).toBe(ParentConfig);
    expect(childToken).toBe(ChildConfig);
  });
});
