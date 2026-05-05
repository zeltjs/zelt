import { Container } from '@needle-di/core';
import { describe, expect, it } from 'vitest';
import { Config } from './decorator';

describe('Config decorator', () => {
  it('makes class injectable', () => {
    @Config
    class TestConfig {
      static readonly Token = TestConfig;
      value = 'test';
    }

    const container = new Container();
    const instance = container.get(TestConfig);
    expect(instance.value).toBe('test');
  });

  it('throws if Token is missing', () => {
    expect(() => {
      @Config
      class NoTokenConfig {
        value = 'test';
      }
      return NoTokenConfig;
    }).toThrow('must have static Token');
  });

  it('finds Token from parent class', () => {
    @Config
    class ParentConfig {
      static readonly Token = ParentConfig;
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

    const container = new Container();
    const instance = container.get(ChildConfig);
    expect(instance.level).toBe('debug');
  });
});
